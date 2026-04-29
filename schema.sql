CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authors (
    author_id INTEGER PRIMARY KEY,
    author_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
    subject_id INTEGER PRIMARY KEY,
    subject_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
    source_id INTEGER PRIMARY KEY,
    source_name TEXT,
    source_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS status (
    status_id INTEGER PRIMARY KEY,
    status_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pdf_resources (
    resource_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    pages INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    date_added TEXT NOT NULL,
    is_public BOOLEAN,
    user_id INTEGER NOT NULL,
    source_id INTEGER NOT NULL,
    status_id INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (source_id) REFERENCES sources(source_id),
    FOREIGN KEY (status_id) REFERENCES status(status_id)
);

CREATE TABLE IF NOT EXISTS ai_llms (
    ai_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    model_path TEXT NOT NULL,
    date_created TEXT NOT NULL,
    is_public BOOLEAN,
    user_id INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS resource_authors (
    resource_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    PRIMARY KEY (resource_id, author_id),
    FOREIGN KEY (resource_id) REFERENCES pdf_resources(resource_id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES authors(author_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resource_subjects (
    resource_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    PRIMARY KEY (resource_id, subject_id),
    FOREIGN KEY (resource_id) REFERENCES pdf_resources(resource_id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS training (
    ai_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    priority INTEGER NOT NULL,
    PRIMARY KEY (ai_id, resource_id),
    FOREIGN KEY (ai_id) REFERENCES ai_llms(ai_id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES pdf_resources(resource_id) ON DELETE CASCADE
);