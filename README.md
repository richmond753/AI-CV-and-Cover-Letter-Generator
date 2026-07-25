# AI CV & Cover Letter Generator

> **CareerAI** – an AI-powered career toolkit that helps you generate professional CVs and tailored cover letters, check how well your CV matches a job (ATS score), and prepare for interviews — all powered by Google Gemini.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)
![Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini-8E75B2?logo=google&logoColor=white)
![License](https://img.shields.io/badge/license-ISC-blue)

---

## ✨ Features

- **📄 CV Builder** – Turn your details into a polished, professional CV. Edit the AI output inline before exporting, then download as PDF or copy/print the text.
- **✉️ Cover Letter Writer** – Paste a job description and get a tailored cover letter in your chosen tone (professional, enthusiastic, concise, or creative).
- **🎯 ATS Score Checker** – Upload `.txt` / `.md` / `.pdf` or paste text; get a 0–100 score, keywords, and improvement tips. Browse recent scores.
- **🎤 Interview Prep** – Generate role-specific technical and behavioral questions with strong suggested answers.
- **🔐 Authentication** – JWT login/register, profile settings, password change, and forgot/reset password flow.
- **🧠 Smart UX** – Editable AI output, cancellable generation, undo/restore, staged progress, toasts, light/dark theme, onboarding tour, and feedback widget.
- **💳 Freemium-ready** – Daily free AI credit meter, rate limiting, usage tracking, and landing-page pricing (Free / Pro / Campus).
- **♿ Accessible & responsive** – Skip link, keyboard shortcuts (`?`), focus states, ARIA labels, and mobile layout.

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
├── public/
│   ├── index.html            ← Landing + pricing
│   ├── css/main.css
│   ├── js/main.js            ← Shared UX (theme, feedback, usage, shortcuts)
│   └── pages/
│       ├── login.html / register.html / forgot-password.html / reset-password.html
│       ├── dashboard.html / settings.html
│       ├── cv-builder.html / cover-letter.html
│       ├── ats-checker.html / interview-prep.html
└── backend/
    ├── server.js             ← Express entry (rate limits, compression, health)
    ├── config.js             ← Central env config
    ├── db.js / schema.sql
    ├── services/usage.js     ← Freemium quotas + schema extras
    ├── middleware/auth.js / rateLimit.js
    ├── controllers/gemini.js
    └── routes/               ← auth, cv, coverLetter, ats, interview, usage
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
| `APP_URL`         | Public URL for password-reset links                      |
| `FREE_DAILY_GENERATIONS` | Daily free AI credit limit (default `15`)         |

### 5. Run the app (from the project root)
```bash
npm run dev     # development with auto-restart (nodemon)
npm start       # production
npm run start:ca  # if TLS/proxy cert issues require --use-system-ca
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
- API rate limiting and daily freemium quotas help control cost and abuse.

> **Note:** If outbound HTTPS calls to Gemini fail with a certificate error (common behind TLS-inspecting antivirus/proxies), use `npm run start:ca` so Node trusts the OS certificate store.

---

## 📜 License

ISC. Free to use and modify.
