-- CareerAI Database Schema
-- Run this in MySQL Workbench or via: mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS careerai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE careerai;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  fullname   VARCHAR(150) NOT NULL,
  email      VARCHAR(200) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CVs (one row per user; the app upserts on user_id)
CREATE TABLE IF NOT EXISTS cvs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  education     TEXT,
  experience    TEXT,
  skills        TEXT,
  projects      TEXT,
  certifications TEXT,
  generated_cv  LONGTEXT,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cv_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Cover Letters
CREATE TABLE IF NOT EXISTS cover_letters (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  company_name VARCHAR(200),
  job_title    VARCHAR(200),
  content      LONGTEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cover_letters_user (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ATS Reports
CREATE TABLE IF NOT EXISTS ats_reports (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  score           INT,
  recommendations LONGTEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ats_reports_user (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Interview Questions
CREATE TABLE IF NOT EXISTS interview_questions (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_id             INT NOT NULL,
  job_title           VARCHAR(200),
  generated_questions LONGTEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_interview_user (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Daily AI usage (freemium / cost control)
CREATE TABLE IF NOT EXISTS usage_events (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  action     VARCHAR(64) NOT NULL,
  day_key    CHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_usage_user_day (user_id, day_key),
  KEY idx_usage_action (action),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Product feedback (customer satisfaction)
CREATE TABLE IF NOT EXISTS feedback (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  rating     TINYINT NOT NULL,
  message    VARCHAR(1000) NULL,
  page       VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_feedback_created (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reset_token (token_hash),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
