const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const iconv = require('iconv-lite');
const db = require('./db');
const { preserveUploadFileName } = require('./uploadFilename');
const { requireLogin, requireRole } = require('./middleware');
const { resolveBaseDir } = require('./runtimePaths');
const router = express.Router();

const UPLOADS_ROOT = path.join(resolveBaseDir(), 'uploads');

/** 下载文件名：姓名-题目英文名-原文件名 */
function buildDownloadFileName(studentName, problemCode, originalName) {
  const safe = (s) => String(s || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'unknown';
  const base = path.basename(String(originalName || 'code.cpp'));
  return `${safe(studentName)}-${safe(problemCode)}-${safe(base)}`;
}

function openPathInFileManager(targetPath) {
  const { exec } = require('child_process');
  const quoted = `"${targetPath}"`;
  if (process.platform === 'win32') {
    exec(`explorer ${quoted}`);
  } else if (process.platform === 'darwin') {
    exec(`open ${quoted}`);
  } else {
    exec(`xdg-open ${quoted}`);
  }
}

function assertCanUpload(me, contest, contestId) {
  if (!contest) return { ok: false, status: 404, error: '比赛不存在' };
  if (contest.status === 'ended') return { ok: false, status: 403, error: '比赛已结束' };
  if (contest.end_time && new Date(contest.end_time) < new Date()) return { ok: false, status: 403, error: '比赛已截止' };
  if (me.role === 'student') {
    if (contest.teacher_id !== me.teacher_id) return { ok: false, status: 403, error: '无权访问' };
    const finalized = db.prepare('SELECT id FROM contest_finals WHERE student_id=? AND contest_id=?').get(me.id, contestId);
    if (finalized) return { ok: false, status: 403, error: '已提交比赛，不能再上传' };
  }
  return { ok: true };
}

/** 保存/覆盖某题提交文件 */
function saveProblemSubmission(me, contest, problem, fileBuffer, originalName) {
  const preserved = preserveUploadFileName(originalName);
  if (!preserved.ok) return { ok: false, error: preserved.error };
  const safeName = preserved.name;
  const dir = path.join(UPLOADS_ROOT, contest.code, me.real_name, problem.code);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, safeName);
  fs.writeFileSync(filePath, fileBuffer);

  const old = db.prepare('SELECT file_path FROM submissions WHERE student_id=? AND problem_id=?').get(me.id, problem.id);
  if (old && old.file_path && path.resolve(old.file_path) !== path.resolve(filePath)) {
    try { fs.unlinkSync(old.file_path); } catch (e) {}
  }

  db.prepare(`
    INSERT INTO submissions (student_id, problem_id, contest_id, file_path, original_name, file_size, submitted_at)
    VALUES (@student_id, @problem_id, @contest_id, @file_path, @original_name, @file_size, CURRENT_TIMESTAMP)
    ON CONFLICT (student_id, problem_id) DO UPDATE SET
      file_path = excluded.file_path,
      original_name = excluded.original_name,
      file_size = excluded.file_size,
      submitted_at = excluded.submitted_at
  `).run({
    student_id: me.id,
    problem_id: problem.id,
    contest_id: contest.id,
    file_path: filePath,
    original_name: safeName,
    file_size: fileBuffer.length,
  });
  return { ok: true, filename: safeName, size: fileBuffer.length, problem_id: problem.id, problem_code: problem.code };
}

// 自定义存储：先保存到内存，拿到原始文件名后再写到磁盘
const storage = multer.memoryStorage();

// defParamCharset: 浏览器 multipart 文件名多为 UTF-8；默认 latin1 会错解并表现为「改名」
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  defParamCharset: 'utf8',
});

const uploadZip = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  defParamCharset: 'utf8',
});

// ====== 上传代码 ======
router.post('/contests/:contestId/problems/:problemId/upload', requireRole('student', 'teacher'), upload.single('file'), (req, res) => {
  const me = req.session.user;
  const { contestId, problemId } = req.params;

  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(contestId);
  const problem = db.prepare('SELECT * FROM problems WHERE id=? AND contest_id=?').get(problemId, contestId);
  if (!contest || !problem) return res.status(404).json({ error: '比赛或题目不存在' });

  const gate = assertCanUpload(me, contest, contestId);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  if (!req.file) return res.status(400).json({ error: '请选择文件' });

  const saved = saveProblemSubmission(me, contest, problem, req.file.buffer, req.file.originalname);
  if (!saved.ok) return res.status(400).json({ error: saved.error });

  res.json({ ok: true, filename: saved.filename, size: saved.size });
});

// ====== 上传总压缩包（整包保存，不拆题） ======
router.post('/contests/:contestId/upload-zip', requireRole('student', 'teacher'), uploadZip.single('file'), (req, res) => {
  const me = req.session.user;
  const { contestId } = req.params;

  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(contestId);
  const gate = assertCanUpload(me, contest, contestId);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  if (!req.file) return res.status(400).json({ error: '请选择压缩包' });
  const preserved = preserveUploadFileName(req.file.originalname);
  if (!preserved.ok) return res.status(400).json({ error: preserved.error });
  const safeName = preserved.name;
  const ext = path.extname(safeName).toLowerCase();
  if (ext !== '.zip') return res.status(400).json({ error: '仅支持 .zip 压缩包' });

  const dir = path.join(UPLOADS_ROOT, contest.code, me.real_name, '_package');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, safeName);
  fs.writeFileSync(filePath, req.file.buffer);

  const old = db.prepare('SELECT file_path FROM contest_packages WHERE student_id=? AND contest_id=?').get(me.id, contestId);
  if (old && old.file_path && path.resolve(old.file_path) !== path.resolve(filePath)) {
    try { fs.unlinkSync(old.file_path); } catch (e) {}
  }

  db.prepare(`
    INSERT INTO contest_packages (student_id, contest_id, file_path, original_name, file_size, submitted_at)
    VALUES (@student_id, @contest_id, @file_path, @original_name, @file_size, CURRENT_TIMESTAMP)
    ON CONFLICT (student_id, contest_id) DO UPDATE SET
      file_path = excluded.file_path,
      original_name = excluded.original_name,
      file_size = excluded.file_size,
      submitted_at = excluded.submitted_at
  `).run({
    student_id: me.id,
    contest_id: Number(contestId),
    file_path: filePath,
    original_name: safeName,
    file_size: req.file.size,
  });

  res.json({ ok: true, filename: safeName, size: req.file.size });
});

// ====== 获取学生当前比赛的上传状态 ======
router.get('/contests/:contestId/my-submissions', requireRole('student', 'teacher'), (req, res) => {
  const me = req.session.user;
  const { contestId } = req.params;

  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(contestId);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });

  const userId = me.role === 'student' ? me.id : null;
  if (!userId) return res.json([]);

  const rows = db.prepare(`
    SELECT s.*, p.number as problem_number, p.title as problem_title, p.code as problem_code
    FROM submissions s
    JOIN problems p ON s.problem_id = p.id
    WHERE s.student_id=? AND s.contest_id=?
    ORDER BY p.number
  `).all(userId, contestId);

  const finalized = db.prepare('SELECT id FROM contest_finals WHERE student_id=? AND contest_id=?').get(userId, contestId);
  const pkg = db.prepare(
    'SELECT id, original_name, file_size, submitted_at FROM contest_packages WHERE student_id=? AND contest_id=?'
  ).get(userId, contestId);
  res.json({
    submissions: rows,
    package: pkg || null,
    finalized: !!finalized,
    status: contest.status,
    end_time: contest.end_time,
  });
});

// ====== 预览代码文件内容 ======
router.get('/preview/:submissionId', requireLogin, (req, res) => {
  const me = req.session.user;
  const sub = db.prepare('SELECT s.*, u.teacher_id as student_teacher FROM submissions s JOIN users u ON s.student_id=u.id WHERE s.id=?').get(req.params.submissionId);
  if (!sub) return res.status(404).json({ error: '不存在' });

  // 权限：学生只能看自己的，老师只能看自己学生的
  if (me.role === 'student' && sub.student_id !== me.id) return res.status(403).json({ error: '无权访问' });
  if (me.role === 'teacher') {
    const student = db.prepare('SELECT teacher_id FROM users WHERE id=?').get(sub.student_id);
    if (!student || student.teacher_id !== me.id) return res.status(403).json({ error: '无权访问' });
  }

  try {
    // 优先尝试 UTF-8（现代编辑器和 IDE 默认），如果出现大量替换字符则回退 GBK
    let content = fs.readFileSync(sub.file_path, 'utf8');
    // 如果 UTF-8 解码中出现替换字符，说明可能是 GBK/GB2312 编码
    const utf8Replacements = (content.match(/\uFFFD/g) || []).length;
    if (utf8Replacements > content.length * 0.01) {
      // 替换字符超过 1%，认为是 GBK 编码，用 iconv-lite 解码
      const raw = fs.readFileSync(sub.file_path);
      content = iconv.decode(raw, 'gbk');
    }
    res.json({ content, filename: sub.original_name });
  } catch (e) {
    res.status(500).json({ error: '文件读取失败：' + e.message });
  }
});

// ====== 最终提交比赛 ======
router.post('/contests/:contestId/finalize', requireRole('student', 'teacher'), (req, res) => {
  const me = req.session.user;
  const { contestId } = req.params;

  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(contestId);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });

  if (me.role === 'student') {
    if (contest.teacher_id !== me.teacher_id) return res.status(403).json({ error: '无权访问' });
    const already = db.prepare('SELECT id FROM contest_finals WHERE student_id=? AND contest_id=?').get(me.id, contestId);
    if (already) return res.status(409).json({ error: '已经提交过了' });

    db.prepare('INSERT INTO contest_finals(student_id,contest_id) VALUES(?,?)').run(me.id, contestId);
  }
  res.json({ ok: true });
});

// ====== 老师查看某比赛所有学生提交 ======
router.get('/teacher/contests/:contestId/submissions', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const { contestId } = req.params;

  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(contestId);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权访问' });

  const rows = db.prepare(`
    SELECT s.id, s.student_id, s.problem_id, s.original_name, s.file_size, s.submitted_at,
           u.real_name as student_name, u.username as student_username,
           p.number as problem_number, p.title as problem_title, p.code as problem_code,
           (SELECT id FROM contest_finals WHERE student_id=s.student_id AND contest_id=s.contest_id) as finalized
    FROM submissions s
    JOIN users u ON s.student_id = u.id
    JOIN problems p ON s.problem_id = p.id
    WHERE s.contest_id=?
    ORDER BY u.real_name, p.number
  `).all(contestId);

  res.json(rows);
});

// ====== 老师查看某学生某比赛的所有提交 ======
router.get('/teacher/contests/:contestId/students/:studentId/submissions', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const { contestId, studentId } = req.params;

  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(contestId);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权访问' });

  const rows = db.prepare(`
    SELECT s.*, p.number as problem_number, p.title as problem_title
    FROM submissions s
    JOIN problems p ON s.problem_id = p.id
    WHERE s.student_id=? AND s.contest_id=?
    ORDER BY p.number
  `).all(studentId, contestId);

  res.json(rows);
});

// ====== 打开比赛代码目录（本机资源管理器） ======
router.post('/teacher/contests/:contestId/open-folder', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.contestId);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权访问' });

  const dir = path.join(UPLOADS_ROOT, contest.code);
  fs.mkdirSync(dir, { recursive: true });
  try {
    openPathInFileManager(dir);
    res.json({ ok: true, path: dir });
  } catch (e) {
    res.status(500).json({ error: '打开目录失败：' + e.message });
  }
});

// ====== 下载：单个题目代码文件 ======
router.get('/download/submission/:submissionId', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const sub = db.prepare(`
    SELECT s.*, u.real_name as student_name, p.number as problem_number, p.code as problem_code, c.teacher_id
    FROM submissions s
    JOIN users u ON s.student_id=u.id
    JOIN problems p ON s.problem_id=p.id
    JOIN contests c ON s.contest_id=c.id
    WHERE s.id=?
  `).get(req.params.submissionId);

  if (!sub) return res.status(404).json({ error: '不存在' });
  if (me.role === 'teacher' && sub.teacher_id !== me.id) return res.status(403).json({ error: '无权访问' });

  if (!fs.existsSync(sub.file_path)) return res.status(404).json({ error: '文件不存在' });
  const downloadName = buildDownloadFileName(sub.student_name, sub.problem_code, sub.original_name);
  res.download(sub.file_path, downloadName);
});

// ====== 下载：单个学生所有代码（zip） ======
router.get('/download/student/:contestId/:studentId', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const { contestId, studentId } = req.params;

  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(contestId);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权访问' });

  const student = db.prepare('SELECT real_name FROM users WHERE id=?').get(studentId);
  const subs = db.prepare(`
    SELECT s.*, p.number as problem_number, p.code as problem_code
    FROM submissions s
    JOIN problems p ON s.problem_id=p.id
    WHERE s.student_id=? AND s.contest_id=?
  `).all(studentId, contestId);

  const studentName = student ? student.real_name : String(studentId);
  const zipName = `${studentName}_${contest.code}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);

  const archive = archiver('zip');
  archive.pipe(res);
  for (const s of subs) {
    if (fs.existsSync(s.file_path)) {
      archive.file(s.file_path, { name: buildDownloadFileName(studentName, s.problem_code, s.original_name) });
    }
  }
  archive.finalize();
});

// ====== 下载：整个比赛所有学生代码（zip） ======
router.get('/download/contest/:contestId', requireRole('teacher', 'superadmin'), (req, res) => {
  const me = req.session.user;
  const { contestId } = req.params;

  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(contestId);
  if (!contest) return res.status(404).json({ error: '比赛不存在' });
  if (me.role === 'teacher' && contest.teacher_id !== me.id) return res.status(403).json({ error: '无权访问' });

  const subs = db.prepare(`
    SELECT s.*, p.number as problem_number, p.code as problem_code, u.real_name as student_name
    FROM submissions s
    JOIN problems p ON s.problem_id=p.id
    JOIN users u ON s.student_id=u.id
    WHERE s.contest_id=?
  `).all(contestId);

  const zipName = `${contest.name}_全部代码.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);

  const archive = archiver('zip');
  archive.pipe(res);
  for (const s of subs) {
    if (fs.existsSync(s.file_path)) {
      archive.file(s.file_path, { name: buildDownloadFileName(s.student_name, s.problem_code, s.original_name) });
    }
  }
  archive.finalize();
});

module.exports = router;
