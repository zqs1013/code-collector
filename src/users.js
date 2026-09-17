const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { requireRole } = require('./middleware');
const router = express.Router();
const deleteSubmissionsByStudent = db.prepare('DELETE FROM submissions WHERE student_id=?');
const deleteFinalsByStudent = db.prepare('DELETE FROM contest_finals WHERE student_id=?');
const deleteStudentByIdStmt = db.prepare("DELETE FROM users WHERE id=? AND role='student'");

function normalizeClassName(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  return v ? v : null;
}

function removeStudentRelatedData(studentId) {
  // 先删依赖表，避免外键约束导致删除 users 失败
  deleteSubmissionsByStudent.run(studentId);
  deleteFinalsByStudent.run(studentId);
}

// ========== 超级管理员：管理老师 ==========

// 获取所有老师
router.get('/teachers', requireRole('superadmin'), (req, res) => {
  const rows = db.prepare("SELECT id,username,real_name,created_at FROM users WHERE role='teacher' ORDER BY id DESC").all();
  res.json(rows);
});

// 新增老师
router.post('/teachers', requireRole('superadmin'), (req, res) => {
  const { username, password, real_name } = req.body;
  if (!username || !password || !real_name) return res.status(400).json({ error: '参数不完整' });
  if (username.length > 18) return res.status(400).json({ error: '账号长度不能超过18位' });

  const exists = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (exists) return res.status(409).json({ error: '账号已存在' });

  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare("INSERT INTO users(username,password,role,real_name) VALUES(?,?,?,?)").run(username, hash, 'teacher', real_name);
  res.json({ ok: true, id: r.lastInsertRowid });
});

// 修改老师密码
router.put('/teachers/:id/password', requireRole('superadmin'), (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: '请提供新密码' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password=? WHERE id=? AND role=?').run(hash, req.params.id, 'teacher');
  res.json({ ok: true });
});

// 修改老师姓名 / 登录账号
router.put('/teachers/:id', requireRole('superadmin'), (req, res) => {
  const { real_name, username } = req.body;
  const teacher = db.prepare("SELECT id, username, real_name FROM users WHERE id=? AND role='teacher'").get(req.params.id);
  if (!teacher) return res.status(404).json({ error: '教师不存在' });
  if (real_name === undefined && username === undefined) {
    return res.status(400).json({ error: '请提供 real_name 或 username' });
  }

  let nextReal = teacher.real_name;
  let nextUser = teacher.username;
  if (real_name !== undefined) {
    const rn = String(real_name).trim();
    if (!rn) return res.status(400).json({ error: '姓名不能为空' });
    nextReal = rn;
  }
  if (username !== undefined) {
    const u = String(username).trim();
    if (!u) return res.status(400).json({ error: '账号不能为空' });
    if (u.length > 18) return res.status(400).json({ error: '账号长度不能超过18位' });
    const taken = db.prepare('SELECT id FROM users WHERE username=? AND id!=?').get(u, req.params.id);
    if (taken) return res.status(409).json({ error: '账号已存在' });
    nextUser = u;
  }

  db.prepare('UPDATE users SET real_name=?, username=? WHERE id=?').run(nextReal, nextUser, req.params.id);
  res.json({ ok: true });
});

// 删除老师
router.delete('/teachers/:id', requireRole('superadmin'), (req, res) => {
  db.prepare("DELETE FROM users WHERE id=? AND role='teacher'").run(req.params.id);
  res.json({ ok: true });
});

// ========== 老师：管理学生 ==========

// 获取本老师的学生
router.get('/students', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const q = String(req.query.q || '').trim().toLowerCase();
  const className = normalizeClassName(req.query.class_name);
  let rows;
  if (me.role === 'superadmin') {
    const teacherIdRaw = req.query.teacher_id;
    const teacherId = teacherIdRaw !== undefined && teacherIdRaw !== '' ? Number(teacherIdRaw) : null;
    if (teacherIdRaw !== undefined && teacherIdRaw !== '' && !Number.isInteger(teacherId)) {
      return res.status(400).json({ error: 'teacher_id 非法' });
    }
    rows = db.prepare(`
      SELECT u.id,u.username,u.real_name,u.class_name,u.created_at,u.teacher_id,t.real_name as teacher_name
      FROM users u
      LEFT JOIN users t ON u.teacher_id=t.id
      WHERE u.role='student'
        AND (? IS NULL OR u.teacher_id=?)
        AND (? IS NULL OR u.class_name=?)
        AND (?='' OR lower(u.real_name) LIKE '%' || ? || '%' OR lower(u.username) LIKE '%' || ? || '%')
      ORDER BY u.id DESC
    `).all(teacherId, teacherId, className, className, q, q, q);
  } else {
    rows = db.prepare(`
      SELECT id,username,real_name,class_name,created_at
      FROM users
      WHERE role='student' AND teacher_id=?
        AND (? IS NULL OR class_name=?)
        AND (?='' OR lower(real_name) LIKE '%' || ? || '%' OR lower(username) LIKE '%' || ? || '%')
      ORDER BY id DESC
    `).all(me.id, className, className, q, q, q);
  }
  res.json(rows);
});

// 获取学生班级候选（去重、去空）
router.get('/student-classes', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const teacherIdRaw = req.query.teacher_id;
  if (me.role === 'teacher') {
    const rows = db.prepare(`
      SELECT DISTINCT class_name
      FROM users
      WHERE role='student' AND teacher_id=? AND class_name IS NOT NULL AND trim(class_name)!=''
      ORDER BY class_name COLLATE NOCASE
    `).all(me.id);
    return res.json(rows.map(r => r.class_name));
  }
  let teacherId = null;
  if (teacherIdRaw !== undefined && teacherIdRaw !== '') {
    teacherId = Number(teacherIdRaw);
    if (!Number.isInteger(teacherId)) return res.status(400).json({ error: 'teacher_id 非法' });
  }
  const rows = db.prepare(`
    SELECT DISTINCT class_name
    FROM users
    WHERE role='student' AND class_name IS NOT NULL AND trim(class_name)!=''
      AND (? IS NULL OR teacher_id=?)
    ORDER BY class_name COLLATE NOCASE
  `).all(teacherId, teacherId);
  res.json(rows.map(r => r.class_name));
});

// 批量导入已迁至 server.js + src/studentsBulk.js（主 app 注册完整路径）

// 新增学生
router.post('/students', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const { username, password, real_name, teacher_id, class_name } = req.body;
  if (!username || !password || !real_name) return res.status(400).json({ error: '参数不完整' });
  if (username.length > 18) return res.status(400).json({ error: '账号长度不能超过18位（支持身份证号/手机号/学号）' });

  const exists = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (exists) return res.status(409).json({ error: '账号已存在' });

  let targetTeacherId = me.id;
  if (me.role === 'superadmin') {
    if (teacher_id === undefined || teacher_id === null || teacher_id === '') {
      targetTeacherId = me.id;
    } else {
      const tid = Number(teacher_id);
      if (!Number.isInteger(tid) || tid <= 0) return res.status(400).json({ error: '请提供有效的 teacher_id' });
      if (tid === me.id) {
        targetTeacherId = me.id;
      } else {
        const teacher = db.prepare("SELECT id FROM users WHERE id=? AND role='teacher'").get(tid);
        if (!teacher) return res.status(404).json({ error: '教师不存在' });
        targetTeacherId = tid;
      }
    }
  }

  const hash = bcrypt.hashSync(password, 10);
  const className = normalizeClassName(class_name);
  const r = db.prepare("INSERT INTO users(username,password,role,real_name,class_name,teacher_id) VALUES(?,?,?,?,?,?)").run(
    username,
    hash,
    'student',
    real_name,
    className,
    targetTeacherId
  );
  res.json({ ok: true, id: r.lastInsertRowid });
});

// 修改学生密码
router.put('/students/:id/password', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: '请提供新密码' });

  const student = db.prepare("SELECT id,teacher_id FROM users WHERE id=? AND role='student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  if (me.role === 'teacher' && student.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.params.id);
  res.json({ ok: true });
});

// 修改学生姓名 / 登录账号
router.put('/students/:id', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const { real_name, username, class_name } = req.body;

  const student = db.prepare("SELECT id, teacher_id, username, real_name, class_name FROM users WHERE id=? AND role='student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  if (me.role === 'teacher' && student.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });

  if (real_name === undefined && username === undefined && class_name === undefined) {
    return res.status(400).json({ error: '请提供 real_name、username 或 class_name' });
  }

  let nextReal = student.real_name;
  let nextUser = student.username;
  let nextClass = student.class_name || null;

  if (real_name !== undefined) {
    const rn = String(real_name).trim();
    if (!rn) return res.status(400).json({ error: '姓名不能为空' });
    nextReal = rn;
  }
  if (username !== undefined) {
    const u = String(username).trim();
    if (!u) return res.status(400).json({ error: '账号不能为空' });
    if (u.length > 18) return res.status(400).json({ error: '账号长度不能超过18位' });
    const taken = db.prepare('SELECT id FROM users WHERE username=? AND id!=?').get(u, req.params.id);
    if (taken) return res.status(409).json({ error: '账号已存在' });
    nextUser = u;
  }
  if (class_name !== undefined) {
    nextClass = normalizeClassName(class_name);
  }

  db.prepare('UPDATE users SET real_name=?, username=?, class_name=? WHERE id=?').run(nextReal, nextUser, nextClass, req.params.id);
  res.json({ ok: true });
});

// 删除学生
router.delete('/students/:id', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const student = db.prepare("SELECT id,teacher_id FROM users WHERE id=? AND role='student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  if (me.role === 'teacher' && student.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });

  removeStudentRelatedData(student.id);
  deleteStudentByIdStmt.run(student.id);
  res.json({ ok: true });
});

// 批量删除学生（仅删除账号与数据库记录，不删除磁盘文件）
router.post('/students/bulk-delete', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  if (!ids) return res.status(400).json({ error: 'ids 须为数组' });
  const normalizedIds = [...new Set(ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];
  if (normalizedIds.length === 0) return res.status(400).json({ error: '请至少选择一个有效学生' });
  if (normalizedIds.length > 500) return res.status(400).json({ error: '单次最多删除 500 个学生' });

  const placeholders = normalizedIds.map(() => '?').join(',');
  const whereTeacher = me.role === 'teacher' ? ' AND teacher_id=?' : '';
  const params = me.role === 'teacher' ? [...normalizedIds, me.id] : normalizedIds;
  const students = db
    .prepare(`SELECT id FROM users WHERE role='student' AND id IN (${placeholders})${whereTeacher}`)
    .all(...params);
  if (students.length === 0) return res.status(404).json({ error: '未找到可删除的学生' });

  const deleteMany = db.transaction((rows) => {
    let deleted = 0;
    for (const row of rows) {
      removeStudentRelatedData(row.id);
      const r = deleteStudentByIdStmt.run(row.id);
      deleted += r.changes || 0;
    }
    return deleted;
  });

  const deleted = deleteMany(students);
  res.json({ ok: true, deleted });
});

module.exports = router;
