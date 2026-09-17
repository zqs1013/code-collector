const bcrypt = require('bcryptjs');
const db = require('./db');
const { requireRole } = require('./middleware');

function postStudentsBulk(req, res) {
  const me = req.session.user;
  const { students, teacher_id } = req.body;
  if (!Array.isArray(students)) return res.status(400).json({ error: 'students 须为数组' });
  if (students.length === 0) return res.status(400).json({ error: '请至少提供一条学生数据' });
  if (students.length > 500) return res.status(400).json({ error: '单次最多导入 500 条' });

  const insert = db.prepare("INSERT INTO users(username,password,role,real_name,class_name,teacher_id) VALUES(?,?,?,?,?,?)");
  const teacherExists = db.prepare("SELECT id FROM users WHERE id=? AND role='teacher'");
  let created = 0;
  const errors = [];

  students.forEach((row, index) => {
    const r = row && typeof row === 'object' ? row : {};
    const username = (r.username != null ? String(r.username) : r['账号'] != null ? String(r['账号']) : '').trim();
    const password = r.password != null ? String(r.password) : r['密码'] != null ? String(r['密码']) : '';
    const real_name = (r.real_name != null ? String(r.real_name) : r['姓名'] != null ? String(r['姓名']) : '').trim();
    const classNameRaw = r.class_name != null ? r.class_name : r['班级'];
    const className = classNameRaw == null ? null : (String(classNameRaw).trim() || null);
    const rawTeacherId = r.teacher_id != null ? r.teacher_id : teacher_id;
    const teacherId = me.role === 'teacher'
      ? me.id
      : (rawTeacherId === undefined || rawTeacherId === null || rawTeacherId === ''
        ? me.id
        : Number(rawTeacherId));

    if (!username || !password || !real_name) {
      errors.push({ index, username: username || '(空)', error: '参数不完整（需 username、password、real_name）' });
      return;
    }
    if (me.role === 'superadmin') {
      if (!Number.isInteger(teacherId) || teacherId <= 0) {
        errors.push({ index, username: username || '(空)', error: '缺少有效 teacher_id（请选择归属教师）' });
        return;
      }
      // 可指定自己，或任意教师
      if (teacherId !== me.id && !teacherExists.get(teacherId)) {
        errors.push({ index, username: username || '(空)', error: 'teacher_id 对应教师不存在' });
        return;
      }
    }
    if (username.length > 18) {
      errors.push({ index, username, error: '账号长度不能超过18位' });
      return;
    }
    const exists = db.prepare('SELECT id FROM users WHERE username=?').get(username);
    if (exists) {
      errors.push({ index, username, error: '账号已存在' });
      return;
    }
    try {
      const hash = bcrypt.hashSync(password, 10);
      insert.run(username, hash, 'student', real_name, className, teacherId);
      created++;
    } catch (e) {
      errors.push({ index, username, error: e.message || '插入失败' });
    }
  });

  res.json({ ok: true, created, failed: errors.length, errors });
}

/** 挂在主 app 上，避免子 Router 下部分路径无法匹配 */
function mountStudentsBulkRoutes(app) {
  app.post('/api/users/students/bulk', requireRole('teacher', 'superadmin'), postStudentsBulk);
  app.post('/api/users/students-bulk', requireRole('teacher', 'superadmin'), postStudentsBulk);
}

module.exports = { mountStudentsBulkRoutes, postStudentsBulk };
