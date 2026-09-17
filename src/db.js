const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { resolveBaseDir } = require('./runtimePaths');

const BASE_DIR = resolveBaseDir();
const DB_PATH = path.join(BASE_DIR, 'data', 'app.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const DEFAULT_SUPERADMIN_PASSWORD = process.env.DEFAULT_SUPERADMIN_PASSWORD || 'admin_123';

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 建表
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('superadmin','teacher','student')),
  real_name TEXT NOT NULL,
  class_name TEXT,
  teacher_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(teacher_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS contests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  start_time DATETIME,
  end_time DATETIME,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','ended')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(teacher_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(contest_id) REFERENCES contests(id) ON DELETE CASCADE,
  UNIQUE(contest_id, number),
  UNIQUE(contest_id, code)
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  problem_id INTEGER NOT NULL,
  contest_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size INTEGER,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES users(id),
  FOREIGN KEY(problem_id) REFERENCES problems(id) ON DELETE CASCADE,
  FOREIGN KEY(contest_id) REFERENCES contests(id) ON DELETE CASCADE,
  UNIQUE(student_id, problem_id)
);

CREATE TABLE IF NOT EXISTS contest_finals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  contest_id INTEGER NOT NULL,
  finalized_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES users(id),
  FOREIGN KEY(contest_id) REFERENCES contests(id),
  UNIQUE(student_id, contest_id)
);

CREATE TABLE IF NOT EXISTS contest_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL,
  stored_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(contest_id) REFERENCES contests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contest_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  contest_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size INTEGER,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES users(id),
  FOREIGN KEY(contest_id) REFERENCES contests(id) ON DELETE CASCADE,
  UNIQUE(student_id, contest_id)
);
`);

// 插入超级管理员（如不存在）
const bcrypt = require('bcryptjs');
const adminExists = db.prepare("SELECT id FROM users WHERE username='admin'").get();
if (!adminExists) {
  const hash = bcrypt.hashSync(DEFAULT_SUPERADMIN_PASSWORD, 10);
  db.prepare("INSERT INTO users(username,password,role,real_name) VALUES(?,?,?,?)").run('admin', hash, 'superadmin', '超级管理员');
  console.log(`[DB] Created default admin: admin / ${DEFAULT_SUPERADMIN_PASSWORD}`);
}

// 迁移：给 problems 表增加 code 字段（如不存在）
try {
  const colInfo = db.prepare("PRAGMA table_info(problems)").all();
  const hasCode = colInfo.some(c => c.name === 'code');
  if (!hasCode) {
    db.exec("ALTER TABLE problems ADD COLUMN code TEXT NOT NULL DEFAULT ''");
    console.log('[DB] Added code column to problems');
  }
} catch (e) {
  // 忽略（可能已存在）
}

// 迁移：给 users 表增加 class_name 字段（如不存在）
try {
  const colInfo = db.prepare('PRAGMA table_info(users)').all();
  const hasClassName = colInfo.some(c => c.name === 'class_name');
  if (!hasClassName) {
    db.exec('ALTER TABLE users ADD COLUMN class_name TEXT');
    console.log('[DB] Added class_name column to users');
  }
} catch (e) {
  // 忽略（可能已存在）
}

// 迁移：比赛资料目录由 contest_materials/{比赛 id} 改为 contest_materials/{比赛代号}
try {
  const matRoot = path.join(BASE_DIR, 'uploads', 'contest_materials');
  fs.mkdirSync(matRoot, { recursive: true });
  const contests = db.prepare('SELECT id, code FROM contests').all();
  const selMats = db.prepare('SELECT id, stored_path FROM contest_materials WHERE contest_id=?');
  const updMatPath = db.prepare('UPDATE contest_materials SET stored_path=? WHERE id=?');
  for (const c of contests) {
    const idDir = path.join(matRoot, String(c.id));
    const codeDir = path.join(matRoot, c.code);
    if (!fs.existsSync(idDir)) continue;
    if (fs.existsSync(codeDir)) {
      console.warn('[DB] contest_materials: skip id->code migrate (code dir exists):', c.code);
      continue;
    }
    fs.renameSync(idDir, codeDir);
    const idNorm = path.normalize(idDir);
    const codeNorm = path.normalize(codeDir);
    for (const m of selMats.all(c.id)) {
      const fp = path.normalize(m.stored_path);
      if (fp.startsWith(idNorm + path.sep)) {
        const rel = path.relative(idNorm, fp);
        if (!rel || rel.startsWith('..')) continue;
        updMatPath.run(path.join(codeNorm, rel), m.id);
      }
    }
    console.log('[DB] contest_materials: migrated folder id -> code:', c.id, '->', c.code);
  }
} catch (e) {
  console.error('[DB] contest_materials id->code migrate:', e.message);
}

module.exports = db;
