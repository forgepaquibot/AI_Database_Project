PRAGMA foreign_keys = ON;

--- Users ---

CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

--- Resource Metadata ---

CREATE TABLE IF NOT EXISTS authors (
    author_id INTEGER PRIMARY KEY,
    author_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS subjects (
    subject_id INTEGER PRIMARY KEY,
    subject_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sources (
    source_id INTEGER PRIMARY KEY,
    source_name TEXT,
    source_url TEXT NOT NULL
);


-- ============================================================
-- 3. GENERAL DATA RESOURCES
-- resource_type is intentionally extensible. Validate supported
-- types in the application instead of requiring a schema change
-- every time a new file format is introduced.
-- Examples: pdf, txt, csv, json, jsonl, vector, other
-- ============================================================

CREATE TABLE IF NOT EXISTS data_resources (
    resource_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,

    resource_type TEXT NOT NULL,
    original_filename TEXT,
    mime_type TEXT,
    storage_uri TEXT NOT NULL,
    file_size_bytes INTEGER CHECK (
        file_size_bytes IS NULL OR file_size_bytes >= 0
    ),
    checksum_sha256 TEXT,

    -- Optional and format-specific. For example, PDF page count
    -- or CSV columns/vector metadata in metadata_json.
    metadata_json TEXT,

    date_added TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_public INTEGER NOT NULL DEFAULT 0
        CHECK (is_public IN (0, 1)),

    user_id INTEGER NOT NULL,
    source_id INTEGER,

    processing_status TEXT NOT NULL DEFAULT 'uploaded'
        CHECK (processing_status IN (
            'uploaded', 'queued', 'processing', 'ready', 'failed'
        )),

    FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (source_id)
        REFERENCES sources(source_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_data_resources_user
    ON data_resources(user_id);
CREATE INDEX IF NOT EXISTS idx_data_resources_public
    ON data_resources(is_public);
CREATE INDEX IF NOT EXISTS idx_data_resources_type
    ON data_resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_data_resources_processing_status
    ON data_resources(processing_status);
CREATE INDEX IF NOT EXISTS idx_data_resources_checksum
    ON data_resources(checksum_sha256);


-- ============================================================
-- 4. OPTIONAL AUTHOR / SUBJECT MANY-TO-MANY RELATIONSHIPS
-- These now reference any data resource, not only PDFs.
-- ============================================================

CREATE TABLE IF NOT EXISTS resource_authors (
    resource_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    PRIMARY KEY (resource_id, author_id),
    FOREIGN KEY (resource_id)
        REFERENCES data_resources(resource_id) ON DELETE CASCADE,
    FOREIGN KEY (author_id)
        REFERENCES authors(author_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resource_subjects (
    resource_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    PRIMARY KEY (resource_id, subject_id),
    FOREIGN KEY (resource_id)
        REFERENCES data_resources(resource_id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id)
        REFERENCES subjects(subject_id) ON DELETE CASCADE
);


-- ============================================================
-- 5. MODEL REGISTRY
-- A model row points to a model managed by a provider such as
-- Ollama. artifact_uri is optional and is not the model endpoint.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_llms (
    ai_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,

    provider TEXT NOT NULL DEFAULT 'ollama',
    model_ref TEXT NOT NULL,
    model_format TEXT,
    model_digest TEXT,
    artifact_uri TEXT,

    model_origin TEXT NOT NULL DEFAULT 'registered'
        CHECK (model_origin IN (
            'registered', 'imported', 'fine_tuned'
        )),

    parent_ai_id INTEGER,
    date_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_public INTEGER NOT NULL DEFAULT 0
        CHECK (is_public IN (0, 1)),
    user_id INTEGER NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_ai_id)
        REFERENCES ai_llms(ai_id) ON DELETE SET NULL,

    UNIQUE (user_id, provider, model_ref)
);

CREATE INDEX IF NOT EXISTS idx_ai_llms_user
    ON ai_llms(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_llms_public
    ON ai_llms(is_public);
CREATE INDEX IF NOT EXISTS idx_ai_llms_provider_ref
    ON ai_llms(provider, model_ref);


-- ============================================================
-- 6. NORMALIZED RESOURCE ITEMS
-- One resource can yield text chunks, CSV rows, JSON records,
-- or records representing vectors. Structured values and extra
-- provenance are preserved as JSON text.
-- ============================================================

CREATE TABLE IF NOT EXISTS resource_items (
    item_id INTEGER PRIMARY KEY,
    resource_id INTEGER NOT NULL,
    item_index INTEGER NOT NULL,

    item_type TEXT NOT NULL,
    content_text TEXT,
    structured_json TEXT,
    metadata_json TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (resource_id, item_index),
    FOREIGN KEY (resource_id)
        REFERENCES data_resources(resource_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resource_items_resource
    ON resource_items(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_items_type
    ON resource_items(item_type);


-- ============================================================
-- 7. EMBEDDINGS / VECTORS
-- Embeddings are separated from content so an item can have
-- vectors from different embedding models. JSON storage is fine
-- for a prototype; use a vector index as the collection grows.
-- ============================================================

CREATE TABLE IF NOT EXISTS resource_embeddings (
    embedding_id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL,
    embedding_model TEXT NOT NULL,
    dimensions INTEGER NOT NULL CHECK (dimensions > 0),
    embedding_json TEXT NOT NULL,
    is_imported INTEGER NOT NULL DEFAULT 0
        CHECK (is_imported IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (item_id, embedding_model),
    FOREIGN KEY (item_id)
        REFERENCES resource_items(item_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resource_embeddings_model
    ON resource_embeddings(embedding_model);


-- ============================================================
-- 8. RESOURCE PROCESSING JOBS
-- This means extraction/validation/indexing/importing, not
-- fine-tuning model weights.
-- ============================================================

CREATE TABLE IF NOT EXISTS resource_processing_jobs (
    processing_job_id INTEGER PRIMARY KEY,
    resource_id INTEGER NOT NULL,
    requested_by INTEGER NOT NULL,

    operation TEXT NOT NULL DEFAULT 'index'
        CHECK (operation IN (
            'extract', 'validate', 'index', 'import_vectors'
        )),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending', 'running', 'done', 'failed', 'cancelled'
        )),
    progress_percent INTEGER NOT NULL DEFAULT 0
        CHECK (progress_percent BETWEEN 0 AND 100),

    processor_config_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,

    FOREIGN KEY (resource_id)
        REFERENCES data_resources(resource_id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by)
        REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resource_jobs_resource
    ON resource_processing_jobs(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_jobs_user
    ON resource_processing_jobs(requested_by);
CREATE INDEX IF NOT EXISTS idx_resource_jobs_status
    ON resource_processing_jobs(status);


-- ============================================================
-- 9. USER-SELECTED RESOURCES FOR A MODEL
-- This records resource selection, not processing status.
-- Application code must enforce that a user can only link a
-- resource they own or a resource that is public, and can only
-- use models they own or models that are public.
-- ============================================================

CREATE TABLE IF NOT EXISTS model_resource_links (
    link_id INTEGER PRIMARY KEY,
    ai_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1
        CHECK (is_enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (ai_id, resource_id, user_id),
    FOREIGN KEY (ai_id)
        REFERENCES ai_llms(ai_id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id)
        REFERENCES data_resources(resource_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_model_resource_links_model
    ON model_resource_links(ai_id);
CREATE INDEX IF NOT EXISTS idx_model_resource_links_resource
    ON model_resource_links(resource_id);
CREATE INDEX IF NOT EXISTS idx_model_resource_links_user
    ON model_resource_links(user_id);


-- ============================================================
-- 10. CHAT HISTORY (OPTIONAL BUT READY FOR THE APP)
-- A chat session belongs to a user and uses a registered model.
-- Keep source references in each assistant message as JSON if
-- you want to display which resources informed an answer.
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    ai_id INTEGER NOT NULL,
    title TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (ai_id)
        REFERENCES ai_llms(ai_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
    ON chat_sessions(user_id, updated_at);

CREATE TABLE IF NOT EXISTS chat_messages (
    message_id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL,
    role TEXT NOT NULL
        CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    sources_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id)
        REFERENCES chat_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
    ON chat_messages(session_id, message_id);


-- ============================================================
-- 11. FUTURE ACTUAL FINE-TUNING JOBS
-- Separate from resource indexing/RAG. A completed indexing job
-- does not mean that model weights have been trained.
-- ============================================================

CREATE TABLE IF NOT EXISTS fine_tuning_jobs (
    fine_tuning_job_id INTEGER PRIMARY KEY,
    base_ai_id INTEGER NOT NULL,
    created_by INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending', 'preparing', 'running', 'evaluating',
            'completed', 'failed', 'cancelled'
        )),
    training_method TEXT,
    config_json TEXT,

    output_ai_id INTEGER,
    output_artifact_uri TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,

    FOREIGN KEY (base_ai_id)
        REFERENCES ai_llms(ai_id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by)
        REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (output_ai_id)
        REFERENCES ai_llms(ai_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fine_tuning_jobs_user
    ON fine_tuning_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_fine_tuning_jobs_status
    ON fine_tuning_jobs(status);

CREATE TABLE IF NOT EXISTS fine_tuning_job_resources (
    fine_tuning_job_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'training'
        CHECK (role IN ('training', 'validation')),

    PRIMARY KEY (fine_tuning_job_id, resource_id, role),
    FOREIGN KEY (fine_tuning_job_id)
        REFERENCES fine_tuning_jobs(fine_tuning_job_id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id)
        REFERENCES data_resources(resource_id) ON DELETE RESTRICT
);