const path = require('path');

const MAX_BASENAME_LEN = 255;

/**
 * UTF-8 字节被误当作 latin1 读成 JS 字符串时，每个 charCode 均 ≤255。
 * 回写为 Buffer 再按 UTF-8 解码可恢复中文等；已是正常 Unicode（含中文）的串不修改。
 */
function maybeFixMojibakeFilename(s) {
  if (typeof s !== 'string' || s.length === 0) return s;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 255) return s;
  }
  let recovered;
  try {
    recovered = Buffer.from(s, 'latin1').toString('utf8');
  } catch {
    return s;
  }
  if (recovered.includes('\uFFFD')) return s;
  if (recovered === s) return s;
  return recovered;
}

/**
 * 仅使用 multipart 中「文件」部件的 filename（前端建议 append 时传入第三个参数 file.name）。
 * 禁止换行/过长；不做大小写或合法字符改写（与学生端、资料端一致）。
 */
function preserveUploadFileName(originalname) {
  if (originalname == null || typeof originalname !== 'string') {
    return { ok: false, error: '文件名无效' };
  }
  let base = path.basename(originalname.replace(/\\/g, '/')).trim();
  base = maybeFixMojibakeFilename(base);
  if (!base || base === '.' || base === '..') return { ok: false, error: '文件名无效' };
  if (base.length > MAX_BASENAME_LEN) return { ok: false, error: '文件名过长' };
  if (/[\r\n\x00]/.test(base)) return { ok: false, error: '文件名无效' };
  if (/[/\\]/.test(base)) return { ok: false, error: '文件名无效' };
  return { ok: true, name: base };
}

module.exports = { preserveUploadFileName, MAX_BASENAME_LEN };
