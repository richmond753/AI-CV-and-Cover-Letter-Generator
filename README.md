# CareerAI – Setup Guide

## Project Structure
```
careerai/
├── public/                   ← Frontend (HTML/CSS/JS)
│   ├── index.html            ← Landing page
│   ├── css/main.css          ← All styles
│   ├── js/main.js            ← Shared utilities
│   └── pages/
│       ├── login.html
│       ├── register.html
│       ├── dashboard.html
│       ├── cv-builder.html
│       ├── cover-letter.html
│       ├── ats-checker.html
│       └── interview-prep.html
└── backend/
    ├── server.js             ← Express entry point
    ├── db.js                 ← MySQL pool
    ├── schema.sql            ← Run once to create tables
    ├── .env.example          ← Copy to backend/.env
    ├── middleware/auth.js    ← JWT middleware
    ├── controllers/gemini.js ← Gemini AI helper
    └── routes/
        ├── auth.js           ← Register / Login
        ├── cv.js             ← CV generation + PDF
        ├── coverLetter.js    ← Cover letter generation + PDF
        ├── ats.js            ← ATS score checker
        └── interview.js      ← Interview questions
```

## Tech Stack
- **Frontend**: HTML5, CSS3, Vanilla JS (no framework needed)
- **Backend**: Node.js + Express.js
- **Database**: MySQL
- **AI**: Google Gemini (configurable via `GEMINI_MODEL`, default `gemini-2.5-flash`)
- **PDF**: PDFKit

## Setup Steps

### 1. Install Node.js
Download from https://nodejs.org (LTS version, Node 18+).

### 2. Install MySQL
Download MySQL Community Server from https://dev.mysql.com/downloads/

### 3. Create the database
```bash
mysql -u root -p < backend/schema.sql
```

### 4. Install dependencies (from the project root)
```bash
npm install
```

### 5. Configure environment
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your DB credentials and API keys
```

### 6. Get your Gemini API key
1. Go to https://aistudio.google.com/app/apikey
2. Create a free API key
3. Add it to `backend/.env` as `GEMINI_API_KEY=...`
4. Optionally set `GEMINI_MODEL` (defaults to `gemini-2.5-flash`)

### 7. Start the server (from the project root)
```bash
npm run dev     # development (auto-restart)
npm start       # production
```

### 8. Open in browser
http://localhost:5000
