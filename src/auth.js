const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { requireLogin } = require('./middleware');
const router = express.Router();

function isStrongPassword(password) {
  const s = String(password || '');
  return s.length >= 10
    && /[A-Z]/.test(s)
    && /[a-z]/.test(s)
    && /\d/.test(s)
    && /[^A-Za-z0-9]/.test(s);
}

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请输入账号和密码' });

  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user) return res.status(401).json({ error: '账号或密码错误' });

  const ok = bcrypt.compareSync(password, user.password);
  if (!ok) return res.status(401).json({ error: '账号或密码错误' });

  req.session.user = {
    id: user.id,
    username: user.username,
    role: String(user.role || '').trim(),
    real_name: user.real_name,
    teacher_id: user.teacher_id,
  };
  res.json({ ok: true, user: req.session.user });
});

// 登出
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// 获取当前登录信息（每次从数据库刷新角色，避免会话角色过期/不一致）
router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  const row = db.prepare('SELECT id,username,role,real_name,teacher_id FROM users WHERE id=?').get(req.session.user.id);
  if (!row) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: '未登录' });
  }
  req.session.user = {
    id: row.id,
    username: row.username,
    role: row.role,
    real_name: row.real_name,
    teacher_id: row.teacher_id,
  };
  res.json(req.session.user);
});

// 当前登录用户修改自己的密码
router.put('/change-password', requireLogin, (req, res) => {
  const me = req.session.user;
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) {
    return res.status(400).json({ error: '请提供旧密码和新密码' });
  }
  if (!isStrongPassword(new_password)) {
    return res.status(400).json({ error: '新密码强度不足（至少10位，且包含大小写字母、数字和特殊字符）' });
  }
  if (old_password === new_password) {
    return res.status(400).json({ error: '新密码不能与旧密码相同' });
  }

  const user = db.prepare('SELECT id,password FROM users WHERE id=?').get(me.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const ok = bcrypt.compareSync(String(old_password), user.password);
  if (!ok) return res.status(400).json({ error: '旧密码不正确' });

  const hash = bcrypt.hashSync(String(new_password), 10);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, me.id);
  res.json({ ok: true });
});

module.exports = router;
