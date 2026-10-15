const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");

const app = express();
const { PDFParse } = require("pdf-parse");
const OLLAMA_BASE_URL =
    process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

// -------------------- Setup --------------------
["uploads/resources", "uploads/models"].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("client"));
app.use(express.static("styles"));
app.use("/uploads/resources", express.static("uploads/resources"));

app.set("view engine", "pug");

// Sessions
app.use(session({
  secret: "supersecretkey",
  resave: false,
  saveUninitialized: false,
}));

// Database
const db = new sqlite3.Database("./ai_training.db", (err) => {
    if (err) console.error(err.message);
    db.run("PRAGMA foreign_keys = ON"); // Ensure foreign keys are enabled
});

// -------------------- File Upload (Multer) --------------------
const uploadPDF = multer({
  storage: multer.diskStorage({
    destination: "uploads/resources",
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
  }),
  fileFilter: (req, file, cb) => cb(null, file.mimetype === "application/pdf")
});

// -------------------- Helpers --------------------
function sqlGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function sqlAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

function sqlRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);

            resolve({
                lastID: this.lastID,
                changes: this.changes
            });
        });
    });
}

async function getOllamaModels() {
    const response = await fetch(
        `${OLLAMA_BASE_URL}/api/tags`
    );

    if (!response.ok) {
        throw new Error(
            `Ollama returned HTTP ${response.status}`
        );
    }

    const data = await response.json();
    return data.models || [];
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}

function loadFormData(callback) {
  db.all("SELECT * FROM authors", [], (e1, authors = []) => {
    db.all("SELECT * FROM subjects", [], (e2, subjects = []) => {
      db.all("SELECT * FROM sources", [], (e3, sources = []) => {
        callback(authors, subjects, sources);
      });
    });
  });
}

// -------------------- Authentication --------------------
app.get("/", (req, res) => {
  res.render("index", { message: null });
});

app.post("/signup", (req, res) => {
  const { username, password } = req.body;

  // Enforce naming rule (only this one for now since it could be important)
  if (username.includes(" ") || password.includes(" ")) {
    return res.render("index", { message: "No spaces allowed in username or password." });
  }

  db.run(
    `INSERT INTO users (username, password) VALUES (?, ?)`,
    [username, password],
    err => {
      res.render("index", {
        message: err ? "Signup failed." : "Signup successful!"
      });
    }
  );
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username.includes(" ") || password.includes(" ")) {
    return res.render("index", { message: "No spaces allowed in username or password." });
  }

  db.get(
    `SELECT * FROM users WHERE username=? AND password=?`,
    [username, password],
    (err, user) => {
      if (!user) return res.render("index", { message: "Invalid login." });

      req.session.user = { id: user.user_id };
      res.redirect("/resources");
    }
  );
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// -------------------- Resources --------------------
app.get("/resources", requireLogin, (req, res) => {
  const msg = req.session.message;
  req.session.message = null; // clear after showing

  loadFormData((authors, subjects, sources) => {
    res.render("resources", {
      results: null,
      message: msg,
      authors,
      subjects,
      sources,
      selectedAuthor: "",
      selectedSubject: "",
      query: ""
    });
  });
});

// Upload PDF
app.post("/upload", requireLogin, uploadPDF.single("pdf"), (req, res) => {
  if (!req.file) {
    req.session.message = "Invalid file.";
    return res.redirect("/resources");
  }

  const userId = req.session.user.id;
  const {
    title, description, pages,
    author_id, author_name,
    subject_id, subject_name,
    source_id, source_name, source_url
  } = req.body;

  const filePath = "/uploads/resources/" + req.file.filename;

  db.serialize(() => {
    db.run("BEGIN");

    // ---------- Source ----------
    const getSource = (cb) => {
      if (source_id) return cb(source_id);
      // Check if source already exists
      db.get("SELECT source_id FROM sources WHERE source_name = ?", [source_name], (err, row) => {
        if (row) return cb(row.source_id);
        db.run(
          `INSERT INTO sources (source_name, source_url) VALUES (?, ?)`,
          [source_name, source_url],
          function () { cb(this.lastID); }
        );
      });
    };

    // ---------- Author ----------
    const getAuthor = (cb) => {
      if (author_id) return cb(author_id);
      db.get("SELECT author_id FROM authors WHERE author_name = ?", [author_name], (err, row) => {
        if (row) return cb(row.author_id);
        db.run(
          `INSERT INTO authors (author_name) VALUES (?)`,
          [author_name],
          function () { cb(this.lastID); }
        );
      });
    };

    // ---------- Subject ----------
    const getSubject = (cb) => {
      if (subject_id) return cb(subject_id);
      db.get("SELECT subject_id FROM subjects WHERE subject_name = ?", [subject_name], (err, row) => {
        if (row) return cb(row.subject_id);
        db.run(
          `INSERT INTO subjects (subject_name) VALUES (?)`,
          [subject_name],
          function () { cb(this.lastID); }
        );
      });
    };

    // ---------- Full Upload ----------
    getSource((sourceId) => {
      db.run(
        `INSERT INTO pdf_resources
        (title, description, pages, file_path, date_added, is_public, user_id, source_id, status_id)
        VALUES (?, ?, ?, ?, datetime('now'), 1, ?, ?, 1)`,
        [title, description, pages, filePath, userId, sourceId],
        function () {
          const resourceId = this.lastID;

          getAuthor((authorId) => {
            db.run(`INSERT INTO resource_authors VALUES (?, ?)`, [resourceId, authorId]);

            getSubject((subjectId) => {
              db.run(`INSERT INTO resource_subjects VALUES (?, ?)`, [resourceId, subjectId]);

              db.run("COMMIT");

              req.session.message = "PDF uploaded successfully!";
              res.redirect("/resources");
            });
          });
        }
      );
    });
  });
});

// Search PDFs
app.get("/search", requireLogin, (req, res) => {
  const { query = "", author_id = "", subject_id = "" } = req.query;

  const params = [];

  let sql = `
    SELECT 
      pr.*,
      DATE(pr.date_added) AS date_added,
      u.username AS uploader,    
      a.author_name,
      s.subject_name,
      so.source_name,
      so.source_url
    FROM pdf_resources pr
    LEFT JOIN users u ON pr.user_id = u.user_id 
    LEFT JOIN resource_authors ra ON pr.resource_id = ra.resource_id
    LEFT JOIN authors a ON ra.author_id = a.author_id
    LEFT JOIN resource_subjects rs ON pr.resource_id = rs.resource_id
    LEFT JOIN subjects s ON rs.subject_id = s.subject_id
    LEFT JOIN sources so ON pr.source_id = so.source_id
    WHERE pr.is_public = 1
  `;

  // Add title filter
  if (query) {
    sql += " AND pr.title LIKE ?";
    params.push(`%${query}%`);
  }

  // Add author filter using junction (N:N) table
  if (author_id) {
    sql += ` AND pr.resource_id IN (
      SELECT resource_id FROM resource_authors WHERE author_id = ?
    )`;
    params.push(author_id);
  }

  // Add subject filter using junction table
  if (subject_id) {
    sql += ` AND pr.resource_id IN (
      SELECT resource_id FROM resource_subjects WHERE subject_id = ?
    )`;
    params.push(subject_id);
  }

  // Group results for proper display
  sql += " GROUP BY pr.resource_id";

  db.all(sql, params, (err, results) => {
    if (err) {
      console.error(err);
      results = [];
    }

    // Load authors, subjects, sources for the select dropdowns
    loadFormData((authors, subjects, sources) => {
      res.render("resources", {
        results,
        message: null,
        authors,
        subjects,
        sources,
        selectedAuthor: author_id,
        selectedSubject: subject_id,
        query
      });
    });
  });
});

// -------------------- AI Models --------------------
app.get("/ai_model", requireLogin, async (req, res) => {
    const userId = req.session.user.id;

    let message = req.session.message;
    req.session.message = null;

    let ollamaModels = [];

    try {
        ollamaModels = await getOllamaModels();
    } catch (err) {
        console.error("Ollama connection error:", err.message);

        message = message ||
            "Could not connect to Ollama. Check that Ollama is running.";
    }

    try {
        const models = await sqlAll(
            `SELECT *
             FROM ai_llms
             WHERE user_id = ?
             ORDER BY ai_id DESC`,
            [userId]
        );

        const resources = await sqlAll(
            `SELECT resource_id, title
             FROM pdf_resources
             WHERE user_id = ? OR is_public = 1
             ORDER BY resource_id DESC`,
            [userId]
        );

        const jobs = await sqlAll(
            `SELECT
                tj.*,
                ai.name AS model_name,
                pr.title AS resource_title
            FROM training_jobs tj
            JOIN ai_llms ai ON ai.ai_id = tj.ai_id
            JOIN pdf_resources pr ON pr.resource_id = tj.resource_id
            WHERE ai.user_id = ?
            ORDER BY tj.job_id DESC
            LIMIT 20`,
            [userId]
        );

        res.render("ai_model", {
            models,
            ollamaModels,
            resources,
            jobs,
            message
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Could not load AI models.");
    }
});

app.post("/register_ollama_model", requireLogin, async (req, res) => {
    const userId = req.session.user.id;

    const modelRef = String(req.body.model_ref || "").trim();
    const name = String(req.body.name || modelRef).trim();
    const description = String(req.body.description || "").trim();

    if (!modelRef || !name) {
        req.session.message = "Choose a model and provide a name.";
        return res.redirect("/ai_model");
    }

    try {
        const installedModels = await getOllamaModels();

        const found = installedModels.find(
            item => (item.name || item.model) === modelRef
        );

        if (!found) {
            throw new Error(
                "That model is not installed in Ollama. Pull it first."
            );
        }

        await sqlRun(
            `INSERT INTO ai_llms
                (name, description, model_path, date_created,
                 is_public, user_id, provider, model_ref,
                 model_format, model_digest)
             VALUES (?, ?, ?, datetime('now'),
                     0, ?, 'ollama', ?, ?, ?)`,
            [
                name,
                description,
                `ollama://${modelRef}`,
                userId,
                modelRef,
                found.details?.format || null,
                found.digest || null
            ]
        );

        req.session.message = "Ollama model registered successfully!";
    } catch (err) {
        console.error("Model registration error:", err.message);

        req.session.message = err.message.includes("UNIQUE")
            ? "You have already registered that Ollama model."
            : err.message === "That model is not installed in Ollama. Pull it first."
                ? err.message
                : "Model registration failed. Check your database and Ollama.";
    }

    res.redirect("/ai_model");
});


app.post("/evaluate_model", requireLogin, async (req, res) => {
    const userId = req.session.user.id;

    const aiId = Number(req.body.ai_id);
    const resourceId = Number(req.body.resource_id);

    const threshold = 0.80;
    let jobId = null;

    try {
        if (
            !Number.isInteger(aiId) ||
            !Number.isInteger(resourceId) ||
            aiId <= 0 ||
            resourceId <= 0
        ) {
            throw new Error("Select a valid model and PDF.");
        }

        // Verify that the model belongs to the logged-in user.
        const model = await sqlGet(
            `SELECT *
             FROM ai_llms
             WHERE ai_id = ?
               AND user_id = ?
               AND provider = 'ollama'`,
            [aiId, userId]
        );

        if (!model) {
            throw new Error("Ollama model not found.");
        }

        // Verify that the PDF is accessible to the user.
        const resource = await sqlGet(
            `SELECT *
             FROM pdf_resources
             WHERE resource_id = ?
               AND (user_id = ? OR is_public = 1)`,
            [resourceId, userId]
        );

        if (!resource) {
            throw new Error("PDF not found or access denied.");
        }

        // Load the benchmark questions associated with this PDF.
        const cases = await sqlAll(
            `SELECT *
             FROM evaluation_cases
             WHERE resource_id = ?
             ORDER BY case_id`,
            [resourceId]
        );

        if (cases.length === 0) {
            throw new Error(
                "No evaluation questions exist for this PDF."
            );
        }

        if (
            cases.some(
                test =>
                    !test.prompt?.trim() ||
                    !test.expected_phrase?.trim()
            )
        ) {
            throw new Error(
                "Every evaluation question needs a prompt and expected phrase."
            );
        }

        // Create a job record.
        const createdJob = await sqlRun(
            `INSERT INTO training_jobs
                (ai_id, resource_id, job_type, status, threshold)
             VALUES (?, ?, 'evaluation', 'pending', ?)`,
            [aiId, resourceId, threshold]
        );

        jobId = createdJob.lastID;

        await sqlRun(
            `UPDATE training_jobs
             SET status = 'running',
                 started_at = CURRENT_TIMESTAMP
             WHERE job_id = ?`,
            [jobId]
        );

        // Resolve the stored PDF path safely.
        const relativePath = String(resource.file_path)
            .replace(/^[/\\]+/, "");

        const filePath = path.resolve(__dirname, relativePath);

        const resourceRoot =
            path.resolve(__dirname, "uploads/resources") + path.sep;

        if (!filePath.startsWith(resourceRoot)) {
            throw new Error("Invalid PDF storage path.");
        }

        if (!fs.existsSync(filePath)) {
            throw new Error("The PDF file was not found on disk.");
        }

        // Extract text from the PDF.
        const parser = new PDFParse({
            data: fs.readFileSync(filePath)
        });

        let extracted;

        try {
            extracted = await parser.getText();
        } finally {
            await parser.destroy();
        }

        // Prototype limit: the first 12,000 characters only.
        const documentText = String(extracted.text || "")
            .trim()
            .slice(0, 12000);

        if (!documentText) {
            throw new Error(
                "No selectable text was extracted from this PDF."
            );
        }

        let passed = 0;

        // Test the model with every benchmark question.
        for (const test of cases) {
            const response = await fetch(
                `${OLLAMA_BASE_URL}/api/chat`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: model.model_ref,
                        stream: false,
                        options: {
                            temperature: 0
                        },
                        messages: [
                            {
                                role: "system",
                                content:
                                    "Answer using only the supplied PDF context. " +
                                    "If the answer is not supported by the context, " +
                                    "say that you cannot determine it from the PDF."
                            },
                            {
                                role: "user",
                                content:
                                    `PDF CONTEXT:\n${documentText}\n\n` +
                                    `QUESTION:\n${test.prompt}`
                            }
                        ]
                    })
                }
            );

            if (!response.ok) {
                throw new Error(
                    `Ollama returned HTTP ${response.status}.`
                );
            }

            const result = await response.json();

            const answer = String(
                result.message?.content || ""
            ).toLowerCase();

            const expected =
                test.expected_phrase.trim().toLowerCase();

            if (answer.includes(expected)) {
                passed++;
            }
        }

        const total = cases.length;
        const score = passed / total;
        const status = score >= threshold ? "done" : "failed";

        // Save the score and final job status.
        await sqlRun(
            `UPDATE training_jobs
             SET passed_tests = ?,
                 total_tests = ?,
                 score = ?,
                 status = ?,
                 error_message = ?,
                 completed_at = CURRENT_TIMESTAMP
             WHERE job_id = ?`,
            [
                passed,
                total,
                score,
                status,
                status === "failed"
                    ? `Score ${(score * 100).toFixed(1)}% was below the ` +
                      `${(threshold * 100).toFixed(1)}% threshold.`
                    : null,
                jobId
            ]
        );

        req.session.message =
            `Evaluation complete: ${passed}/${total} passed ` +
            `(${(score * 100).toFixed(1)}%). Status: ${status}.`;

    } catch (err) {
        console.error("Evaluation error:", err);

        if (jobId !== null) {
            try {
                await sqlRun(
                    `UPDATE training_jobs
                     SET status = 'failed',
                         error_message = ?,
                         completed_at = CURRENT_TIMESTAMP
                     WHERE job_id = ?`,
                    [String(err.message).slice(0, 800), jobId]
                );
            } catch (dbErr) {
                console.error(
                    "Could not update failed job:",
                    dbErr
                );
            }
        }

        req.session.message = `Evaluation failed: ${err.message}`;
    }

    res.redirect("/ai_model");
});

// Host server
app.listen(3005, () => console.log("http://localhost:3005"));