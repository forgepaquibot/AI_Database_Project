const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const { parse: parseCsv } = require('csv-parse/sync');

const {
  PROJECT_ROOT,
  RESOURCE_DIR
} = require('../config/app-config');

const { sqlGet, sqlAll, sqlRun } = require('../db/database');

const {
  getEmbeddings,
  EMBEDDING_MODEL
} = require('./embeddings.service');

const allowedExtensions = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.jsonl',
  '.docx'
]);

const uploadResource = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, RESOURCE_DIR);
    },

    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),

  limits: {
    fileSize: 50 * 1024 * 1024
  },

  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, allowedExtensions.has(extension));
  }
});

function resourceTypeFromFilename(filename) {
  const extension = path.extname(filename).toLowerCase();

  if (extension === '.pdf') return 'pdf';
  if (extension === '.txt' || extension === '.md') return 'txt';
  if (extension === '.docx') return 'docx';
  if (extension === '.csv') return 'csv';
  if (extension === '.jsonl') return 'jsonl';
  if (extension === '.json') return 'json';

  throw new Error('Unsupported file type.');
}

function storedResourcePath(storageUri) {
  const absolute = path.resolve(
    PROJECT_ROOT,
    String(storageUri || '')
  );

  const root = `${RESOURCE_DIR}${path.sep}`;

  if (!absolute.startsWith(root)) {
    throw new Error('Invalid resource storage path.');
  }

  return absolute;
}

function parseResourceMetadata(metadataJson) {
  try {
    return metadataJson ? JSON.parse(metadataJson) : {};
  } catch {
    return {};
  }
}

function mapResourceForTemplate(row) {
  const metadata = parseResourceMetadata(row.metadata_json);

  return {
    ...row,
    pages: metadata.pages ?? '',
    file_path: `/resource/${row.resource_id}/download`
  };
}

async function loadFormData() {
  const [authors, subjects, sources] = await Promise.all([
    sqlAll('SELECT * FROM authors ORDER BY author_name'),
    sqlAll('SELECT * FROM subjects ORDER BY subject_name'),
    sqlAll('SELECT * FROM sources ORDER BY source_name')
  ]);

  return {
    authors,
    subjects,
    sources
  };
}

async function getResourceText(resource) {
  const filePath = storedResourcePath(resource.storage_uri);

  if (!fs.existsSync(filePath)) {
    throw new Error('The resource file was not found on disk.');
  }

  if (resource.resource_type === 'pdf') {
    const parser = new PDFParse({
      data: fs.readFileSync(filePath)
    });

    try {
      const extracted = await parser.getText();
      return String(extracted.text || '').trim();
    } finally {
      await parser.destroy();
    }
  }

  if (resource.resource_type === 'docx') {
    const result = await mammoth.extractRawText({
      path: filePath
    });

    return String(result.value || '')
      .replace(/\u0000/g, '')
      .trim();
  }

  if (resource.resource_type === 'txt') {
    return fs.readFileSync(filePath, 'utf8')
      .replace(/^\uFEFF/, '')
      .trim();
  }

  throw new Error(
    `Text extraction is not supported for resource type '${resource.resource_type}'.`
  );
}

function splitTextIntoChunks(
  text,
  chunkSize = 1200,
  overlap = 180
) {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return [];

  const chunks = [];
  const step = chunkSize - overlap;

  for (
    let start = 0;
    start < normalized.length;
    start += step
  ) {
    const chunk = normalized
      .slice(start, start + chunkSize)
      .trim();

    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

function contentFromRecord(record) {
  if (
    typeof record === 'string' ||
    typeof record === 'number' ||
    typeof record === 'boolean'
  ) {
    return String(record);
  }

  if (!record || typeof record !== 'object') return '';

  const preferred =
    record.text ??
    record.content ??
    record.document ??
    record.description;

  return preferred !== undefined && preferred !== null
    ? String(preferred)
    : JSON.stringify(record);
}

function isNumericVector(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      item => typeof item === 'number' && Number.isFinite(item)
    )
  );
}

async function createResourceItems(resource) {
  const filePath = storedResourcePath(resource.storage_uri);

  if (!fs.existsSync(filePath)) {
    throw new Error('The resource file was not found on disk.');
  }

  if (
    resource.resource_type === 'pdf' ||
    resource.resource_type === 'txt' ||
    resource.resource_type === 'docx'
  ) {
    const text = await getResourceText(resource);
    const chunks = splitTextIntoChunks(text);

    if (!chunks.length) {
      throw new Error('No extractable text was found in this resource.');
    }

    return chunks.map((chunk, index) => ({
      item_index: index,
      item_type: 'text_chunk',
      content_text: chunk,
      structured_json: null,
      metadata_json: JSON.stringify({
        chunk_index: index
      }),
      imported_vector: null
    }));
  }

  if (resource.resource_type === 'csv') {
    const csvText = fs.readFileSync(filePath, 'utf8')
      .replace(/^\uFEFF/, '');

    const records = parseCsv(csvText, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: true
    });

    if (!records.length) {
      throw new Error('The CSV contains no data rows.');
    }

    return records.map((record, index) => ({
      item_index: index,
      item_type: 'csv_row',
      content_text: Object.entries(record)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n'),
      structured_json: JSON.stringify(record),
      metadata_json: JSON.stringify({
        row_number: index + 2
      }),
      imported_vector: null
    }));
  }

  if (
    resource.resource_type === 'json' ||
    resource.resource_type === 'jsonl'
  ) {
    const raw = fs.readFileSync(filePath, 'utf8')
      .replace(/^\uFEFF/, '')
      .trim();

    let records;

    if (resource.resource_type === 'jsonl') {
      records = raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line));
    } else {
      const parsed = JSON.parse(raw);

      records = Array.isArray(parsed)
        ? parsed
        : (
            Array.isArray(parsed.records)
              ? parsed.records
              : [parsed]
          );
    }

    if (!records.length) {
      throw new Error('The JSON resource contains no records.');
    }

    return records.map((record, index) => {
      const vector =
        record && typeof record === 'object'
          ? (
              isNumericVector(record.embedding)
                ? record.embedding
                : (
                    isNumericVector(record.vector)
                      ? record.vector
                      : null
                  )
            )
          : null;

      const text = contentFromRecord(record);

      const hasExplicitText =
        record &&
        typeof record === 'object' &&
        (
          record.text != null ||
          record.content != null ||
          record.document != null
        );

      return {
        item_index: index,
        item_type: vector ? 'vector' : 'json_record',
        content_text: vector && !hasExplicitText ? null : text,
        structured_json: JSON.stringify(record),
        metadata_json: JSON.stringify({
          record_index: index,
          source_embedding_model:
            record?.embedding_model || record?.model || null
        }),
        imported_vector: vector
          ? {
              values: vector,
              model: String(
                record.embedding_model ||
                record.model ||
                'imported-unknown'
              )
            }
          : null
      };
    });
  }

  throw new Error(
    `Processing is not implemented for resource type '${resource.resource_type}'.`
  );
}

async function saveResourceIndex(resource, items) {
  const textItems = items.filter(
    item =>
      item.content_text &&
      item.content_text.trim() &&
      !item.imported_vector
  );

  const vectorByItemIndex = new Map();

  // Generate embeddings in small batches.
  for (
    let index = 0;
    index < textItems.length;
    index += 16
  ) {
    const batch = textItems.slice(index, index + 16);

    const vectors = await getEmbeddings(
      batch.map(item => item.content_text)
    );

    batch.forEach((item, vectorIndex) => {
      vectorByItemIndex.set(
        item.item_index,
        vectors[vectorIndex]
      );
    });
  }

  await sqlRun('BEGIN IMMEDIATE TRANSACTION');

  try {
    await sqlRun(
      'DELETE FROM resource_items WHERE resource_id = ?',
      [resource.resource_id]
    );

    for (const item of items) {
      const inserted = await sqlRun(
        `INSERT INTO resource_items
           (resource_id, item_index, item_type, content_text,
            structured_json, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          resource.resource_id,
          item.item_index,
          item.item_type,
          item.content_text,
          item.structured_json,
          item.metadata_json
        ]
      );

      const imported = item.imported_vector;

      const vector = imported
        ? imported.values
        : vectorByItemIndex.get(item.item_index);

      const embeddingModel = imported
        ? imported.model
        : (vector ? EMBEDDING_MODEL : null);

      if (vector && embeddingModel) {
        await sqlRun(
          `INSERT INTO resource_embeddings
             (item_id, embedding_model, dimensions,
              embedding_json, is_imported)
           VALUES (?, ?, ?, ?, ?)`,
          [
            inserted.lastID,
            embeddingModel,
            vector.length,
            JSON.stringify(vector),
            imported ? 1 : 0
          ]
        );
      }
    }

    await sqlRun(
      `UPDATE data_resources
          SET processing_status = 'ready'
        WHERE resource_id = ?`,
      [resource.resource_id]
    );

    await sqlRun('COMMIT');
  } catch (err) {
    try {
      await sqlRun('ROLLBACK');
    } catch {
      // Preserve the original error.
    }

    throw err;
  }
}

async function resolveAuthorId(authorId, authorName) {
  if (authorId) {
    const row = await sqlGet(
      'SELECT author_id FROM authors WHERE author_id = ?',
      [Number(authorId)]
    );

    return row ? row.author_id : null;
  }

  const name = String(authorName || '').trim();
  if (!name) return null;

  const found = await sqlGet(
    'SELECT author_id FROM authors WHERE author_name = ?',
    [name]
  );

  if (found) return found.author_id;

  const created = await sqlRun(
    'INSERT INTO authors (author_name) VALUES (?)',
    [name]
  );

  return created.lastID;
}

async function resolveSubjectId(subjectId, subjectName) {
  if (subjectId) {
    const row = await sqlGet(
      'SELECT subject_id FROM subjects WHERE subject_id = ?',
      [Number(subjectId)]
    );

    return row ? row.subject_id : null;
  }

  const name = String(subjectName || '').trim();
  if (!name) return null;

  const found = await sqlGet(
    'SELECT subject_id FROM subjects WHERE subject_name = ?',
    [name]
  );

  if (found) return found.subject_id;

  const created = await sqlRun(
    'INSERT INTO subjects (subject_name) VALUES (?)',
    [name]
  );

  return created.lastID;
}

async function resolveSourceId(sourceId, sourceName, sourceUrl) {
  if (sourceId) {
    const row = await sqlGet(
      'SELECT source_id FROM sources WHERE source_id = ?',
      [Number(sourceId)]
    );

    return row ? row.source_id : null;
  }

  const name = String(sourceName || '').trim();
  const url = String(sourceUrl || '').trim();

  if (!name || !url) return null;

  const found = await sqlGet(
    'SELECT source_id FROM sources WHERE source_url = ?',
    [url]
  );

  if (found) return found.source_id;

  const created = await sqlRun(
    'INSERT INTO sources (source_name, source_url) VALUES (?, ?)',
    [name, url]
  );

  return created.lastID;
}

module.exports = {
  allowedExtensions,
  uploadResource,
  resourceTypeFromFilename,
  storedResourcePath,
  mapResourceForTemplate,
  loadFormData,
  splitTextIntoChunks,
  contentFromRecord,
  createResourceItems,
  saveResourceIndex,
  resolveAuthorId,
  resolveSubjectId,
  resolveSourceId
};