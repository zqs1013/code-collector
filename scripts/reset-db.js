const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const rootDir = path.join(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const dbPath = path.join(dataDir, 'app.db');
const sessionsPath = path.join(dataDir, 'sessions.db');
const DEFAULT_SUPERADMIN_PASSWORD = process.env.DEFAULT_SUPERADMIN_PASSWORD || 'admin_123';

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

function hasTable(tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName);
  return Boolean(row);
}

const tx = db.transaction(() => {
  if (hasTable('submissions')) db.prepare('DELETE FROM submissions').run();
  if (hasTable('contest_finals')) db.prepare('DELETE FROM contest_finals').run();
  if (hasTable('contest_materials')) db.prepare('DELETE FROM contest_materials').run();
  if (hasTable('problems')) db.prepare('DELETE FROM problems').run();
  if (hasTable('contests')) db.prepare('DELETE FROM contests').run();
  if (hasTable('users')) db.prepare("DELETE FROM users WHERE role!='superadmin'").run();

  if (hasTable('users')) {
    const admin = db
      .prepare("SELECT id FROM users WHERE username='admin' AND role='superadmin'")
      .get();
    if (!admin) {
      const passwordHash = bcrypt.hashSync(DEFAULT_SUPERADMIN_PASSWORD, 10);
      db.prepare(
        "INSERT INTO users(username,password,role,real_name) VALUES(?,?,?,?)"
      ).run('admin', passwordHash, 'superadmin', '超级管理员');
    }
  }
});

tx();
db.close();

if (fs.existsSync(sessionsPath)) {
  try {
    fs.rmSync(sessionsPath, { force: true });
  } catch (error) {
    if (error && error.code !== 'EBUSY') throw error;
    console.warn('[reset-db] sessions.db is in use, skip deleting this time.');
  }
}

console.log('[reset-db] Done. Database only keeps superadmin account.');
