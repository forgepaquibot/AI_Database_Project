const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");

const app = express();

// -------------------- Setup --------------------
["uploads/resources", "uploads/models"].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("client"));
app.use(express.static("styles"));
app.use("/uploads/resources", express.static("uploads/resources"));
app.use("/uploads/models", express.static("uploads/models"));

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

const uploadModel = multer({
  storage: multer.diskStorage({
    destination: "uploads/models",
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ext === ".pt" || ext === ".bin");
  }
});

// -------------------- Helpers --------------------
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
app.get("/ai_model", requireLogin, (req, res) => {
  const msg = req.session.message;
  req.session.message = null; // clear after showing

  db.all("SELECT * FROM ai_llms", [], (err, models = []) => {
    res.render("ai_model", { models, message: msg });
  });
});

app.post("/upload_model", requireLogin, uploadModel.single("model_file"), (req, res) => {
  if (!req.file) {
    req.session.message = "Invalid file. Only .pt or .bin allowed.";
    return res.redirect("/ai_model");
  }

  const userId = req.session.user.id;
  const { name, description } = req.body;
  const filePath = "/uploads/models/" + req.file.filename;

  db.run(
    `INSERT INTO ai_llms (name, description, model_path, date_created, is_public, user_id)
     VALUES (?, ?, ?, datetime('now'), 1, ?)`,
    [name, description, filePath, userId],
    (err) => {
      req.session.message = err ? "Model upload failed." : "Model uploaded successfully!";
      res.redirect("/ai_model");
    }
  );
});

// Host server
app.listen(3005, () => console.log("http://localhost:3005"));