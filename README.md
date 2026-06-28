# AI CV & Cover Letter Generator

> **CareerAI** – an AI-powered career toolkit that helps you generate professional CVs and tailored cover letters, check how well your CV matches a job (ATS score), and prepare for interviews — all powered by Google Gemini.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)
![Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini-8E75B2?logo=google&logoColor=white)
![License](https://img.shields.io/badge/license-ISC-blue)

---

## ✨ Features

- **📄 CV Builder** – Turn your details into a polished, professional CV. Edit the AI output inline before exporting, then download as PDF or copy the text.
- **✉️ Cover Letter Writer** – Paste a job description and get a tailored cover letter in your chosen tone (professional, enthusiastic, concise, or creative).
- **🎯 ATS Score Checker** – See how well your CV matches a job description, with a 0–100 score, matched/missing keywords, and concrete improvement tips.
- **🎤 Interview Prep** – Generate role-specific technical and behavioral questions with strong suggested answers.
- **🔐 Authentication** – Secure register/login with JWT and hashed passwords (bcrypt).
- **🧠 Smart UX** – Editable AI output, **cancellable generation**, **undo/restore** for clears and deletes, staged progress indicators, and toast notifications.
- **♿ Accessible & responsive** – Keyboard focus states, ARIA labels, live regions, and a mobile-friendly layout.

---

## 🛠 Tech Stack

| Layer        | Technology                                                        |
| ------------ | ----------------------------------------------------------------- |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (no framework)                    |
| **Backend**  | Node.js, Express.js                                               |
| **Database** | MySQL (`mysql2`)                                                  |
| **AI**       | Google Gemini (configurable via `GEMINI_MODEL`, default `gemini-2.5-flash`) |
| **Auth**     | JSON Web Tokens (`jsonwebtoken`), `bcryptjs`                      |
| **PDF**      | PDFKit                                                            |

---

## 📂 Project Structure

```
careerai/
├── public/                   ← Frontend (HTML/CSS/JS)
│   ├── index.html            ← Landing page
│   ├── css/main.css          ← All styles
│   ├── js/main.js            ← Shared utilities (apiFetch, toasts, progress, a11y)
│   └── pages/
│       ├── login.html
│       ├── register.html
│       ├── dashboard.html
│       ├── cv-builder.html
│       ├── cover-letter.html
│       ├── ats-checker.html
│       └── interview-prep.html
└── backend/
    ├── server.js             ← Express entry point (serves API + frontend)
    ├── db.js                 ← MySQL connection pool
    ├── schema.sql            ← Run once to create tables
    ├── .env.example          ← Copy to backend/.env
    ├── middleware/auth.js    ← JWT middleware
    ├── controllers/gemini.js ← Gemini AI helper
    └── routes/
        ├── auth.js           ← Register / Login
        ├── cv.js             ← CV generation + PDF + save/delete
        ├── coverLetter.js    ← Cover letter generation + PDF + save/delete
        ├── ats.js            ← ATS score checker
        └── interview.js      ← Interview questions
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js 18+](https://nodejs.org) (LTS recommended)
- [MySQL Community Server](https://dev.mysql.com/downloads/)
- A free [Google Gemini API key](https://aistudio.google.com/app/apikey)

### 1. Clone the repository
```bash
git clone https://github.com/richmond753/AI-CV-and-Cover-Letter-Generator.git
cd AI-CV-and-Cover-Letter-Generator
```

### 2. Install dependencies (from the project root)
```bash
npm install
```

### 3. Create the database
```bash
mysql -u root -p < backend/schema.sql
```

### 4. Configure environment variables
```bash
cp backend/.env.example backend/.env
```
Then edit `backend/.env` with your own values:

| Variable          | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `GEMINI_API_KEY`  | Your Google Gemini API key                               |
| `GEMINI_MODEL`    | Model to use (optional, defaults to `gemini-2.5-flash`)  |
| `JWT_SECRET`      | A long random string used to sign auth tokens            |
| `DB_HOST`         | MySQL host (e.g. `localhost`)                            |
| `DB_USER`         | MySQL user (e.g. `root`)                                 |
| `DB_PASSWORD`     | MySQL password                                           |
| `DB_NAME`         | Database name (e.g. `careerai`)                          |
| `PORT`            | Server port (defaults to `5000`)                         |

### 5. Run the app (from the project root)
```bash
npm run dev     # development with auto-restart (nodemon)
npm start       # production
```

### 6. Open in your browser
```
http://localhost:5000
```

---

## 🔒 Security Notes

- Your real `backend/.env` (including the API key) is **git-ignored** and never committed — only `.env.example` is tracked.
- Passwords are hashed with bcrypt; routes are protected with JWT middleware.
- User/AI-supplied content is HTML-escaped on the frontend to prevent XSS.

> **Note:** This environment may sit behind a TLS-inspecting proxy/antivirus. If outbound HTTPS calls to Gemini fail with a certificate error, the `npm start` / `npm run dev` scripts already run Node with `--use-system-ca` to use the OS certificate store.

---

## 📜 License

ISC. Free to use and modify.
