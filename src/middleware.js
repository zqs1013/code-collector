// 中间件：要求已登录
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: '请先登录' });
  }
  next();
}

// 中间件：要求特定角色（超级管理员自动拥有教师权限）
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: '请先登录' });
    }
    // 每次鉴权从数据库同步角色，避免旧会话角色导致误拒
    try {
      const db = require('./db');
      const row = db.prepare('SELECT role, real_name, teacher_id, username FROM users WHERE id=?').get(req.session.user.id);
      if (!row) {
        return res.status(401).json({ error: '请先登录' });
      }
      req.session.user.role = String(row.role || '').trim();
      req.session.user.real_name = row.real_name;
      req.session.user.teacher_id = row.teacher_id;
      req.session.user.username = row.username;
    } catch (_) {
      // DB 异常时退回会话内角色
    }
    const role = String(req.session.user.role || '').trim();
    if (roles.includes(role)) return next();
    // 老师能访问的接口，管理员也可访问
    if (role === 'superadmin' && roles.includes('teacher')) return next();
    return res.status(403).json({
      error: '权限不足',
      role: role || null,
      need: roles,
    });
  };
}

module.exports = { requireLogin, requireRole };
