const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "acadly.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  bio TEXT DEFAULT '',
  xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#7867f5'
);
CREATE TABLE IF NOT EXISTS subject_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, subject_id)
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT DEFAULT 'General',
  due_date TEXT,
  priority TEXT DEFAULT 'Normal',
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT DEFAULT '',
  question_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  options TEXT NOT NULL,
  answer TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple-choice'
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const subjectCount = db.prepare("SELECT COUNT(*) count FROM subjects").get().count;
if (!subjectCount) {
  const insert = db.prepare("INSERT INTO subjects (name, code, description, color) VALUES (?, ?, ?, ?)");
  [
    ["Mathematics", "MATH", "Build confidence with numbers, equations, and problem solving.", "#7867f5"],
    ["Programming", "PROG", "Practice logic, algorithms, and software development.", "#27b6a5"],
    ["Science", "SCI", "Explore scientific ideas and understand the world around you.", "#e7a34b"],
    ["Communication", "COMM", "Improve writing, reading, and communication skills.", "#e47d9a"]
  ].forEach(s => insert.run(...s));
}
const quizCount = db.prepare("SELECT COUNT(*) count FROM quizzes").get().count;
if (!quizCount) {
  const quiz = db.prepare("INSERT INTO quizzes (title, subject, description, question_count) VALUES (?, ?, ?, ?)");
  const q = db.prepare("INSERT INTO questions (quiz_id, prompt, options, answer) VALUES (?, ?, ?, ?)");
  const id1 = quiz.run("JavaScript Basics", "Programming", "A short check of your JavaScript fundamentals.", 3).lastInsertRowid;
  [
    ["Which keyword declares a variable that can be reassigned?", ["const", "let", "static", "define"], "let"],
    ["Which method prints a message to the console?", ["console.log()", "print()", "echo()", "write()"], "console.log()"],
    ["Which symbol is used for strict equality?", ["=", "==", "===", "!="], "==="]
  ].forEach(x => q.run(id1, x[0], JSON.stringify(x[1]), x[2]));
  const id2 = quiz.run("Mathematics Quick Check", "Mathematics", "Warm up with a few basic math questions.", 3).lastInsertRowid;
  [
    ["What is 12 × 8?", ["86", "92", "96", "108"], "96"],
    ["What is the square root of 144?", ["10", "11", "12", "14"], "12"],
    ["What is 25% of 200?", ["25", "40", "50", "75"], "50"]
  ].forEach(x => q.run(id2, x[0], JSON.stringify(x[1]), x[2]));
}
module.exports = db;
