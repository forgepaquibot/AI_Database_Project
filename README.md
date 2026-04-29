# AI Training Resource Hub

A full-stack web application that allows users to upload, manage, and search PDF resources and AI models for training and research purposes.

---

## Features

### Authentication

* User signup and login system
* Session-based authentication
* Protected routes for authorized users only

### PDF Resource Management

* Upload PDF files with:

  * Title
  * Description
  * Page count
  * Author(s)
  * Subject(s)
  * Source (name + URL)

* Automatically stores files locally
* Supports:

  * Selecting existing authors/subjects/sources
  * Creating new ones dynamically
* Search functionality:

  * Filter by title
  * Filter by author
  * Filter by subject

### AI Model Hub

* Upload AI model files (.pt, .bin)
* Store:

  * Model name
  * Description
  * Upload date

* View and download uploaded models
* Search models by name

---

## Tech Stack

Backend:

* Node.js
* Express.js
* SQLite3
* Multer (file uploads)
* express-session (authentication)

Frontend:

* Pug (templating engine)
* Vanilla JavaScript
* CSS (custom styling)

---

## Project Structure

project-root/

    client/
    styles/
    uploads/
        resources/
        models/

    views/
        index.pug
        resources.pug
        ai_model.pug

    ai_training.db
    server.js
    README.md

---

## Installation & Setup

1. Clone the repository
   git clone <your-repo-url>
   cd <project-folder>

2. Install dependencies
   npm install

3. Run the server
   node server.js

4. Open in browser
   http://localhost:3005

---

## File Upload Rules

PDFs:

* Only .pdf files allowed

AI Models:

* Only .pt and .bin files allowed

---

## Search Functionality

Resources:

* Search by:

  * Title (partial match)
  * Author
  * Subject

AI Models:

* Search by model name

---

## Author Notes

Created as a full-stack project for managing AI training resources and models.
Link to video demonstration: https://youtu.be/QqxKC7fZODI

---

## License

This project is for educational purposes.