const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
const { preserveUploadFileName } = require('./uploadFilename');
const { requireLogin, requireRole } = require('./middleware');
const { resolveBaseDir } = require('./runtimePaths');

const router = express.Router();

const UPLOADS_ROOT = path.join(resolveBaseDir(), 'uploads');
/** 比赛资料：uploads/contest_materials/{比赛代号}/，与学生代码 uploads/{比赛代号}/ 隔离 */
const CONTEST_MATERIALS_ROOT = path.join(UPLOADS_ROOT, 'contest_materials');

const MATERIAL_EXTS = new Set([
  '.pdf', '.zip', '.doc', '.docx', '.rar', '.7z', '.ppt', '.pptx', '.txt', '.xls', '.xlsx',
]);

// defParamCharset: 与学生代码上传一致，multipart 文件名为 UTF-8，默认 latin1 会错解
const uploadMaterials = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  defParamCharset: 'utf8',
});

function assertContestAccess(me, contest) {
  if (!me || !contest) return false;
  if (me.role === 'superadmin') return true;
  if (me.role === 'student' && contest.teacher_id !== me.teacher_id) return false;
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return false;
  return true;
}

/** 老师结束比赛：该老师名下所有学生在本比赛记为已提交 */
function bulkInsertContestFinals(contestId) {
  db.prepare(`
    INSERT OR IGNORE INTO contest_finals(student_id, contest_id)
    SELECT u.id, ?
    FROM users u
    WHERE u.role = 'student' AND u.teacher_id = (SELECT teacher_id FROM contests WHERE id = ?)
  `).run(contestId, contestId);
}

function clearContestFinalsForContest(contestId) {
  db.prepare('DELETE FROM contest_finals WHERE contest_id=?').run(contestId);
}

/** 比赛代号变更：重命名 uploads/{代号}、contest_materials/{代号}，并修正 submissions / contest_materials 绝对路径 */
function migrateContestCodeOnDisk(contestId, oldCode, newCode) {
  const oldRoot = path.join(UPLOADS_ROOT, oldCode);
  const newRoot = path.join(UPLOADS_ROOT, newCode);
  const oldMatRoot = path.join(CONTEST_MATERIALS_ROOT, oldCode);
  const newMatRoot = path.join(CONTEST_MATERIALS_ROOT, newCode);
  if (path.normalize(oldRoot) === path.normalize(newRoot)) return;

  if (fs.existsSync(newRoot)) {
    const err = new Error('DIR_EXISTS');
    err.code = 'DIR_EXISTS';
    throw err;
  }
  if (fs.existsSync(newMatRoot)) {
    const err = new Error('DIR_EXISTS');
    err.code = 'DIR_EXISTS';
    throw err;
  }
  if (fs.existsSync(oldRoot)) {
    fs.renameSync(oldRoot, newRoot);
  }

  const oldNorm = path.normalize(oldRoot);
  const newNorm = path.normalize(newRoot);

  const subs = db.prepare('SELECT id, file_path FROM submissions WHERE contest_id=?').all(contestId);
  const updSub = db.prepare('UPDATE submissions SET file_path=? WHERE id=?');
  for (const s of subs) {
    const fp = path.normalize(s.file_path);
    if (fp === oldNorm) continue;
    if (fp.startsWith(oldNorm + path.sep)) {
      const rel = path.relative(oldNorm, fp);
      if (!rel || rel.startsWith('..')) continue;
      updSub.run(path.join(newNorm, rel), s.id);
    }
  }

  // 历史数据：资料曾放在 uploads/{代号}/_materials/，重命名比赛代号时需同步路径
  const mats = db.prepare('SELECT id, stored_path FROM contest_materials WHERE contest_id=?').all(contestId);
  const updMat = db.prepare('UPDATE contest_materials SET stored_path=? WHERE id=?');
  for (const m of mats) {
    const fp = path.normalize(m.stored_path);
    if (fp === oldNorm) continue;
    if (fp.startsWith(oldNorm + path.sep)) {
      const rel = path.relative(oldNorm, fp);
      if (!rel || rel.startsWith('..')) continue;
      updMat.run(path.join(newNorm, rel), m.id);
    }
  }

  const oldMatNorm = path.normalize(oldMatRoot);
  const newMatNorm = path.normalize(newMatRoot);
  if (oldMatNorm !== newMatNorm && fs.existsSync(oldMatRoot)) {
    fs.renameSync(oldMatRoot, newMatRoot);
  }
  const matsUnderCodeDir = db.prepare('SELECT id, stored_path FROM contest_materials WHERE contest_id=?').all(contestId);
  for (const m of matsUnderCodeDir) {
    const fp = path.normalize(m.stored_path);
    if (fp === oldMatNorm) continue;
    if (fp.startsWith(oldMatNorm + path.sep)) {
      const rel = path.relative(oldMatNorm, fp);
      if (!rel || rel.startsWith('..')) continue;
      updMat.run(path.join(newMatNorm, rel), m.id);
    }
  }
}

// ========== 老师：管理比赛 ==========

// 创建比赛（管理员可指定归属教师）
router.post('/', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const { name, code, description, start_time, end_time, teacher_id } = req.body;
  if (!name || !code) return res.status(400).json({ error: '比赛名称和代号不能为空' });

  if (!/^[a-zA-Z0-9_-]+$/.test(code)) return res.status(400).json({ error: '比赛代号只允许英文字母、数字、下划线和短横线' });

  const exists = db.prepare('SELECT id FROM contests WHERE code=?').get(code);
  if (exists) return res.status(409).json({ error: '比赛代号已存在' });

  let ownerId = me.id;
  if (me.role === 'superadmin') {
    // 未指定归属教师时默认归自己；也可指定自己或其他教师
    if (teacher_id === undefined || teacher_id === null || teacher_id === '') {
      ownerId = me.id;
    } else {
      const tid = Number(teacher_id);
      if (!Number.isInteger(tid) || tid <= 0) return res.status(400).json({ error: '请选择归属教师' });
      if (tid === me.id) {
        ownerId = me.id;
      } else {
        const teacher = db.prepare("SELECT id FROM users WHERE id=? AND role='teacher'").get(tid);
        if (!teacher) return res.status(404).json({ error: '教师不存在' });
        ownerId = tid;
      }
    }
  }

  const r = db.prepare('INSERT INTO contests(teacher_id,name,code,description,start_time,end_time) VALUES(?,?,?,?,?,?)').run(ownerId, name, code, description || null, start_time || null, end_time || null);
  res.json({ ok: true, id: r.lastInsertRowid });
});

// 老师获取自己的比赛列表（管理员返回全部）
router.get('/mine', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  if (me.role === 'superadmin') {
    const rows = db.prepare(`
      SELECT c.*, u.real_name as teacher_name
      FROM contests c
      JOIN users u ON c.teacher_id = u.id
      ORDER BY c.id DESC
    `).all();
    return res.json(rows);
  }
  const rows = db.prepare('SELECT * FROM contests WHERE teacher_id=? ORDER BY id DESC').all(me.id);
  res.json(rows);
});

// 学生获取自己老师的比赛列表
router.get('/available', requireRole('student'), (req, res) => {
  const me = req.session.user;
  const rows = db.prepare("SELECT c.* FROM contests c WHERE c.teacher_id=? AND c.status='active' ORDER BY c.id DESC").all(me.teacher_id);
  res.json(rows);
});

// 超管获取所有比赛
router.get('/all', requireRole('superadmin'), (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const teacherIdRaw = req.query.teacher_id;
  const teacherId = teacherIdRaw !== undefined && teacherIdRaw !== '' ? Number(teacherIdRaw) : null;
  if (teacherIdRaw !== undefined && teacherIdRaw !== '' && !Number.isInteger(teacherId)) {
    return res.status(400).json({ error: 'teacher_id 非法' });
  }
  const rows = db.prepare(`
    SELECT c.*,u.real_name as teacher_name
    FROM contests c
    JOIN users u ON c.teacher_id=u.id
    WHERE (? IS NULL OR c.teacher_id=?)
      AND (?='' OR lower(c.name) LIKE '%' || ? || '%' OR lower(c.code) LIKE '%' || ? || '%')
    ORDER BY c.id DESC
  `).all(teacherId, teacherId, q, q, q);
  res.json(rows);
});

// 下载比赛资料（须放在 /:id 之前以免被错误匹配 —— Express 中 /:id 只匹配单段，此处为明确性保留在上）
router.get('/:id/materials/:materialId/download', requireLogin, (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT c.* FROM contests c WHERE c.id=?').get(req.params.id);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (!assertContestAccess(me, contest)) return res.status(403).json({ error: '无权访问' });

  const mat = db.prepare('SELECT * FROM contest_materials WHERE id=? AND contest_id=?').get(req.params.materialId, req.params.id);
  if (!mat) return res.status(404).json({ error: '文件不存在' });
  if (!fs.existsSync(mat.stored_path)) return res.status(404).json({ error: '文件已丢失' });

  res.download(mat.stored_path, mat.original_name);
});

// 获取单个比赛详情（带题目与比赛资料）
router.get('/:id', requireLogin, (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT c.*,u.real_name as teacher_name FROM contests c JOIN users u ON c.teacher_id=u.id WHERE c.id=?').get(req.params.id);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });

  if (me.role === 'student' && contest.teacher_id !== me.teacher_id) return res.status(403).json({ error: '无权访问' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权访问' });
  // superadmin 可访问全部

  const problems = db.prepare('SELECT * FROM problems WHERE contest_id=? ORDER BY number').all(req.params.id);
  const materials = db.prepare(
    'SELECT id, original_name, file_size, created_at FROM contest_materials WHERE contest_id=? ORDER BY id ASC'
  ).all(req.params.id);
  res.json({ ...contest, problems, materials });
});

// 更新比赛（老师）
router.put('/:id', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.id);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });

  const { name, description, start_time, end_time, status, code: bodyCode } = req.body;

  let nextCode = contest.code;
  if (bodyCode !== undefined && bodyCode !== null && String(bodyCode).trim() !== '') {
    const trimmed = String(bodyCode).trim();
    if (trimmed !== contest.code) {
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        return res.status(400).json({ error: '比赛代号只允许英文字母、数字、下划线和短横线' });
      }
      const taken = db.prepare('SELECT id FROM contests WHERE code=? AND id!=?').get(trimmed, req.params.id);
      if (taken) return res.status(409).json({ error: '比赛代号已存在' });
      try {
        migrateContestCodeOnDisk(contest.id, contest.code, trimmed);
      } catch (e) {
        if (e.code === 'DIR_EXISTS') return res.status(409).json({ error: '该代号对应目录已存在，无法重命名' });
        throw e;
      }
      nextCode = trimmed;
    }
  }

  const oldStatus = contest.status;
  const oldEndTime = contest.end_time;

  db.prepare(
    'UPDATE contests SET name=COALESCE(?,name), code=?, description=COALESCE(?,description), start_time=COALESCE(?,start_time), end_time=COALESCE(?,end_time), status=COALESCE(?,status) WHERE id=?'
  ).run(name || null, nextCode, description || null, start_time || null, end_time || null, status || null, req.params.id);

  const next = db.prepare('SELECT status, end_time FROM contests WHERE id=?').get(req.params.id);
  const nowMs = Date.now();

  if (next.status === 'ended' && oldStatus !== 'ended') {
    bulkInsertContestFinals(contest.id);
  }

  if (oldStatus === 'ended' && next.status === 'active') {
    clearContestFinalsForContest(contest.id);
  } else {
    const wasExpiredByTime = oldEndTime && new Date(oldEndTime).getTime() < nowMs;
    const nowOpenByTime = next.end_time && new Date(next.end_time).getTime() > nowMs;
    const endTimeChanged = String(oldEndTime ?? '') !== String(next.end_time ?? '');
    if (wasExpiredByTime && nowOpenByTime && endTimeChanged) {
      clearContestFinalsForContest(contest.id);
    }
  }

  res.json({ ok: true });
});

// 上传比赛资料（可多文件）
router.post('/:id/materials', requireRole('teacher', 'superadmin'), uploadMaterials.array('files', 30), (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.id);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });

  const files = req.files;
  if (!files || !files.length) return res.status(400).json({ error: '请选择文件' });

  for (const f of files) {
    const preserved = preserveUploadFileName(f.originalname);
    if (!preserved.ok) return res.status(400).json({ error: preserved.error });
    const ext = path.extname(preserved.name).toLowerCase();
    if (!MATERIAL_EXTS.has(ext)) {
      return res.status(400).json({ error: `不支持的文件类型：${ext}，允许：${[...MATERIAL_EXTS].join(' ')}` });
    }
  }

  const dir = path.join(CONTEST_MATERIALS_ROOT, contest.code);
  fs.mkdirSync(dir, { recursive: true });

  const insert = db.prepare(
    'INSERT INTO contest_materials(contest_id,stored_path,original_name,mime_type,file_size) VALUES(?,?,?,?,?)'
  );

  const delMat = db.prepare('DELETE FROM contest_materials WHERE id=?');
  const dupRows = db.prepare('SELECT id, stored_path FROM contest_materials WHERE contest_id=? AND original_name=?');

  const created = [];
  for (const f of files) {
    const preserved = preserveUploadFileName(f.originalname);
    if (!preserved.ok) return res.status(400).json({ error: preserved.error });
    const orig = preserved.name;
    const dest = path.join(dir, orig);
    for (const row of dupRows.all(contest.id, orig)) {
      try {
        if (row.stored_path && fs.existsSync(row.stored_path)) fs.unlinkSync(row.stored_path);
      } catch (_) {}
      delMat.run(row.id);
    }
    fs.writeFileSync(dest, f.buffer);
    const r = insert.run(contest.id, dest, orig, f.mimetype || null, f.size);
    created.push({ id: r.lastInsertRowid, original_name: orig, file_size: f.size });
  }
  res.json({ ok: true, materials: created });
});

// 删除比赛资料
router.delete('/:id/materials/:materialId', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.id);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });

  const mat = db.prepare('SELECT * FROM contest_materials WHERE id=? AND contest_id=?').get(req.params.materialId, req.params.id);
  if (!mat) return res.status(404).json({ error: '不存在' });
  try {
    if (fs.existsSync(mat.stored_path)) fs.unlinkSync(mat.stored_path);
  } catch (_) {}
  db.prepare('DELETE FROM contest_materials WHERE id=?').run(mat.id);
  res.json({ ok: true });
});

// 删除比赛
router.delete('/:id', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.id);
  if (!contest) return res.status(404).json({ error: '不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });

  const matDirByCode = path.join(CONTEST_MATERIALS_ROOT, contest.code);
  const matDirById = path.join(CONTEST_MATERIALS_ROOT, String(contest.id));
  for (const matDir of [matDirByCode, matDirById]) {
    try {
      if (fs.existsSync(matDir)) fs.rmSync(matDir, { recursive: true, force: true });
    } catch (_) {}
  }

  db.prepare('DELETE FROM contests WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 结束比赛
router.post('/:id/end', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.id);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });
  if (contest.status === 'ended') return res.status(409).json({ error: '比赛已结束' });

  db.prepare("UPDATE contests SET status='ended' WHERE id=?").run(req.params.id);
  bulkInsertContestFinals(contest.id);
  res.json({ ok: true });
});

// ========== 题目管理 ==========

// 添加题目（题号可省略，自动取当前最大题号+1）
router.post('/:id/problems', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.id);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });

  const { title, code, description } = req.body;
  let { number } = req.body;
  if (!title) return res.status(400).json({ error: '题目名称不能为空' });
  if (!code) return res.status(400).json({ error: '题目英文名不能为空' });

  if (!/^[a-zA-Z0-9_]+$/.test(code)) return res.status(400).json({ error: '题目英文名只允许英文字母、数字和下划线' });

  if (number === undefined || number === null || number === '') {
    const row = db.prepare('SELECT MAX(number) as maxn FROM problems WHERE contest_id=?').get(req.params.id);
    number = (row && row.maxn ? Number(row.maxn) : 0) + 1;
  } else {
    number = Number(number);
    if (!Number.isInteger(number) || number < 1) return res.status(400).json({ error: '题号非法' });
  }

  try {
    const r = db.prepare('INSERT INTO problems(contest_id,number,title,code,description) VALUES(?,?,?,?,?)').run(req.params.id, number, title, code, description || null);
    res.json({ ok: true, id: r.lastInsertRowid, number });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: '题号或英文名已存在' });
    throw e;
  }
});

// 批量添加题目（自动连续编号）
router.post('/:id/problems/bulk', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.id);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });

  const items = Array.isArray(req.body?.problems) ? req.body.problems : null;
  if (!items || !items.length) return res.status(400).json({ error: '请提供题目列表' });

  const row = db.prepare('SELECT MAX(number) as maxn FROM problems WHERE contest_id=?').get(req.params.id);
  let nextNum = (row && row.maxn ? Number(row.maxn) : 0) + 1;

  const insert = db.prepare('INSERT INTO problems(contest_id,number,title,code,description) VALUES(?,?,?,?,?)');
  const created = [];
  const errors = [];

  const tx = db.transaction(() => {
    for (let i = 0; i < items.length; i++) {
      const raw = items[i] || {};
      const title = String(raw.title || '').trim();
      let code = String(raw.code || '').trim();
      const description = raw.description != null ? String(raw.description).trim() : '';
      if (!title) {
        errors.push({ index: i + 1, error: '题目名称为空' });
        continue;
      }
      code = code.replace(/[^a-zA-Z0-9_]/g, '');
      if (!code) {
        errors.push({ index: i + 1, title, error: '题目英文名无效' });
        continue;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(code)) {
        errors.push({ index: i + 1, title, error: '英文名格式错误' });
        continue;
      }
      try {
        const r = insert.run(req.params.id, nextNum, title, code, description || null);
        created.push({ id: r.lastInsertRowid, number: nextNum, title, code });
        nextNum += 1;
      } catch (e) {
        if (String(e.message || '').includes('UNIQUE')) {
          errors.push({ index: i + 1, title, code, error: '题号或英文名已存在' });
        } else {
          throw e;
        }
      }
    }
  });

  try {
    tx();
  } catch (e) {
    return res.status(500).json({ error: e.message || '批量添加失败' });
  }

  res.json({ ok: true, created, errors });
});

// 更新题目
router.put('/:contestId/problems/:problemId', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.contestId);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });

  const { title, code, description } = req.body;
  if (code && !/^[a-zA-Z0-9_]+$/.test(code)) return res.status(400).json({ error: '题目英文名只允许英文字母、数字和下划线' });
  db.prepare('UPDATE problems SET title=COALESCE(?,title), code=COALESCE(?,code), description=COALESCE(?,description) WHERE id=? AND contest_id=?').run(title || null, code || null, description || null, req.params.problemId, req.params.contestId);
  res.json({ ok: true });
});

// 删除题目
router.delete('/:contestId/problems/:problemId', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.contestId);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权操作' });

  db.prepare('DELETE FROM problems WHERE id=? AND contest_id=?').run(req.params.problemId, req.params.contestId);
  res.json({ ok: true });
});

module.exports = router;
