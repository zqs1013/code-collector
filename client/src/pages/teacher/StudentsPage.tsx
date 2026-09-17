import React, { useEffect, useState } from 'react';
import api from '../../api';
import { Plus, Trash2, Key, X, Search, Upload, Edit2, Download } from 'lucide-react';

interface Student {
  id: number;
  username: string;
  real_name: string;
  class_name?: string | null;
  created_at: string;
}

interface BulkErrorRow {
  index: number;
  username: string;
  error: string;
}

function normalizeCell(s: string): string {
  let t = s.replace(/^\ufeff/, '').trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    t = t.slice(1, -1).replace(/""/g, '"');
  }
  return t.trim();
}

/** 拆分一行，支持引号内出现分隔符（与 Excel 导出 CSV 一致） */
function splitDataLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (!inQ && c === delim) {
      out.push(normalizeCell(cur));
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(normalizeCell(cur));
  return out;
}

function detectDelimiter(line: string): string {
  if (line.includes('\t')) {
    const n = splitDataLine(line, '\t').filter(Boolean).length;
    if (n >= 3) return '\t';
  }
  if (splitDataLine(line, ';').filter(Boolean).length >= 3) return ';';
  return ',';
}

function headerLooksLikeLabels(cells: string[]): boolean {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  return cells.some(c => {
    const x = norm(c);
    return ['姓名', '真实姓名', '账号', '学号', '用户名', '密码', '初始密码'].includes(c.replace(/\s+/g, ''))
      || x === 'real_name' || x === 'username' || x === 'password' || x === 'name';
  });
}

function mapHeaderIndices(headerCells: string[]): { iName: number; iUser: number; iPwd: number; iClass: number } | null {
  const lower = headerCells.map(c => c.replace(/\s+/g, '').toLowerCase());
  let iName = -1;
  let iUser = -1;
  let iPwd = -1;
  let iClass = -1;
  headerCells.forEach((h, i) => {
    const hm = h.replace(/\s+/g, '');
    const lo = lower[i];
    if (hm === '姓名' || hm === '真实姓名' || lo === 'real_name' || lo === 'name') iName = i;
    if (hm === '账号' || hm === '学号' || hm === '用户名' || lo === 'username') iUser = i;
    if (hm === '密码' || hm === '初始密码' || lo === 'password') iPwd = i;
    if (hm === '班级' || lo === 'class_name' || lo === 'classname') iClass = i;
  });
  if (iName >= 0 && iUser >= 0 && iPwd >= 0) return { iName, iUser, iPwd, iClass };
  return null;
}

function parseCsvToStudents(csv: string): { students: Array<{ real_name: string; username: string; password: string; class_name?: string }>; error?: string } {
  let text = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/，/g, ',').replace(/；/g, ';');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (!lines.length) return { students: [], error: '内容为空' };

  const delim = detectDelimiter(lines[0]);
  const headerCells = splitDataLine(lines[0], delim);
  const mapped = mapHeaderIndices(headerCells);

  let iName = -1;
  let iUser = -1;
  let iPwd = -1;
  let iClass = -1;
  let dataStart = 1;

  if (mapped) {
    ({ iName, iUser, iPwd, iClass } = mapped);
  } else if (headerCells.length === 3 && !headerLooksLikeLabels(headerCells)) {
    iName = 0;
    iUser = 1;
    iPwd = 2;
    dataStart = 0;
  } else if (headerCells.length === 4 && !headerLooksLikeLabels(headerCells)) {
    iName = 0;
    iUser = 1;
    iPwd = 2;
    iClass = 3;
    dataStart = 0;
  } else {
    return {
      students: [],
      error:
        '无法识别列：请使用表头「姓名,账号,密码,班级（可选）」或「real_name,username,password,class_name（可选）」；分隔符支持英文逗号、分号或 Tab。Excel 请用「另存为 → CSV UTF-8（逗号分隔）」。若无表头，请每行三或四列：姓名,账号,密码[,班级]。',
    };
  }

  const students: Array<{ real_name: string; username: string; password: string; class_name?: string }> = [];
  for (let r = dataStart; r < lines.length; r++) {
    const cells = splitDataLine(lines[r], delim);
    if (cells.length < Math.max(iName, iUser, iPwd) + 1) continue;
    students.push({
      real_name: cells[iName] || '',
      username: cells[iUser] || '',
      password: cells[iPwd] || '',
      class_name: iClass >= 0 ? (cells[iClass] || '') : '',
    });
  }
  return { students };
}

function decodeTextFile(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const badUtf = (utf8.match(/\uFFFD/g) || []).length;
  if (badUtf > 0) {
    try {
      const gbk = new TextDecoder('gbk').decode(bytes);
      const badGbk = (gbk.match(/\uFFFD/g) || []).length;
      if (badGbk < badUtf) return gbk;
    } catch {
      /* TextDecoder gbk 不可用时保留 utf-8 */
    }
  }
  return utf8;
}

function downloadTemplate() {
  const bom = '\ufeff';
  const csv = `${bom}姓名,账号,密码,班级\n张三,2023001,请修改为安全密码,高一1班\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '学生导入模板.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showEdit, setShowEdit] = useState<Student | null>(null);
  const [showPwd, setShowPwd] = useState<Student | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [form, setForm] = useState({ username: '', password: '', real_name: '', class_name: '' });
  const [editForm, setEditForm] = useState({ username: '', real_name: '', class_name: '' });
  const [bulkText, setBulkText] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; failed: number; errors: BulkErrorRow[] } | null>(null);
  const [newPwd, setNewPwd] = useState('');

  const load = () => api.get('/users/students', {
    params: { q: search.trim(), class_name: classFilter.trim() || undefined },
  }).then(r => setStudents(r.data));
  const loadClassOptions = () => api.get('/users/student-classes').then(r => setClassOptions(r.data || []));
  useEffect(() => {
    load();
  }, [search, classFilter]);
  useEffect(() => {
    loadClassOptions();
  }, []);

  const handleAdd = async () => {
    if (!form.username || !form.password || !form.real_name) {
      setMsg({ type: 'err', text: '请填写完整信息' }); return;
    }
    try {
      await api.post('/users/students', form);
      setMsg({ type: 'ok', text: '学生添加成功' });
      setShowAdd(false);
      setForm({ username: '', password: '', real_name: '', class_name: '' });
      load();
      loadClassOptions();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '添加失败' });
    }
  };

  const openEdit = (s: Student) => {
    setShowEdit(s);
    setEditForm({ username: s.username, real_name: s.real_name, class_name: s.class_name || '' });
  };

  const handleSaveEdit = async () => {
    if (!showEdit) return;
    if (!editForm.real_name.trim() || !editForm.username.trim()) {
      setMsg({ type: 'err', text: '姓名与账号不能为空' }); return;
    }
    try {
      await api.put(`/users/students/${showEdit.id}`, {
        real_name: editForm.real_name.trim(),
        username: editForm.username.trim(),
        class_name: editForm.class_name.trim(),
      });
      setMsg({ type: 'ok', text: '学生信息已更新' });
      setShowEdit(null);
      load();
      loadClassOptions();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '更新失败' });
    }
  };

  const handleBulkFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      if (res instanceof ArrayBuffer) {
        setBulkText(decodeTextFile(res));
      } else if (typeof res === 'string') {
        setBulkText(res);
      }
      setBulkResult(null);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleBulkSubmit = async () => {
    const { students: rows, error } = parseCsvToStudents(bulkText);
    if (error) {
      setMsg({ type: 'err', text: error });
      return;
    }
    if (!rows.length) {
      setMsg({ type: 'err', text: '没有可导入的数据行（除表头外至少一行）' });
      return;
    }
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const { data } = await api.post('/users/students-bulk', { students: rows });
      setMsg({
        type: data.failed ? 'err' : 'ok',
        text: `批量导入完成：成功 ${data.created} 条，失败 ${data.failed} 条`,
      });
      load();
      loadClassOptions();
      // 全部成功则自动关闭弹窗；有失败时保留弹窗查看明细
      if (!data.failed) {
        closeBulk();
      } else {
        setBulkResult({
          created: data.created,
          failed: data.failed,
          errors: data.errors || [],
        });
      }
    } catch (err: any) {
      const d = err.response?.data;
      const detail = typeof d === 'string' ? d : d?.error;
      setMsg({
        type: 'err',
        text: detail || err.message || '导入请求失败（请确认已登录且网络正常）',
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const closeBulk = () => {
    setShowBulk(false);
    setBulkText('');
    setBulkResult(null);
  };

  const handleDelete = async (s: Student) => {
    if (!confirm(`确认删除学生 "${s.real_name}" (${s.username})？`)) return;
    try {
      await api.delete(`/users/students/${s.id}`);
      setMsg({ type: 'ok', text: '已删除' });
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
      load();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '删除失败' });
    }
  };

  const handleChangePwd = async () => {
    if (!newPwd) { setMsg({ type: 'err', text: '请输入新密码' }); return; }
    try {
      await api.put(`/users/students/${showPwd!.id}/password`, { password: newPwd });
      setMsg({ type: 'ok', text: '密码修改成功' });
      setShowPwd(null);
      setNewPwd('');
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '修改失败' });
    }
  };

  const filtered = students;
  const filteredIds = filtered.map(s => s.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));

  const toggleSelectOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach(id => next.delete(id));
      } else {
        filteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = filteredIds.filter(id => selectedIds.has(id));
    if (ids.length === 0) {
      setMsg({ type: 'err', text: '请先勾选要删除的学生' });
      return;
    }
    if (!confirm(`确认批量删除已选的 ${ids.length} 名学生？`)) return;
    try {
      const { data } = await api.post('/users/students/bulk-delete', { ids });
      setMsg({ type: 'ok', text: `已批量删除 ${data.deleted ?? ids.length} 名学生` });
      setSelectedIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      load();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '批量删除失败' });
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">学生管理</h1>
          <p className="text-gray-400 text-sm mt-1">管理您的学生账号</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => { setShowBulk(true); setBulkText(''); setBulkResult(null); }}>
            <Upload size={16} /> 批量导入
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> 新增学生
          </button>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg.text}
          <button type="button" onClick={() => setMsg(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pr-9" placeholder="搜索姓名或账号" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">班级筛选</label>
          <input
            className="input py-1.5 text-sm min-w-[180px]"
            placeholder="输入或选择班级"
            list="teacher-student-class-options"
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
          />
          <datalist id="teacher-student-class-options">
            {classOptions.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="card mb-4 flex items-center justify-between gap-3">
          <span className="text-sm text-gray-600">已勾选 {selectedIds.size} 名学生</span>
          <button type="button" className="btn btn-danger py-1.5 text-sm" onClick={handleBulkDelete}>
            <Trash2 size={14} /> 批量删除
          </button>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table>
          <thead>
            <tr>
              <th className="w-10 text-center">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} />
              </th>
              <th>姓名</th>
              <th>账号（身份证/手机/学号）</th>
              <th>班级</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-gray-400 py-8">暂无学生</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id}>
                <td className="text-center">
                  <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelectOne(s.id)} />
                </td>
                <td className="font-medium">{s.real_name}</td>
                <td className="font-mono text-gray-500">{s.username}</td>
                <td>{s.class_name || '—'}</td>
                <td className="text-gray-400 text-xs">{new Date(s.created_at).toLocaleDateString('zh-CN')}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-secondary py-1 text-xs" onClick={() => openEdit(s)}>
                      <Edit2 size={12} /> 编辑
                    </button>
                    <button type="button" className="btn btn-secondary py-1 text-xs" onClick={() => { setShowPwd(s); setNewPwd(''); }}>
                      <Key size={12} /> 改密码
                    </button>
                    <button type="button" className="btn btn-danger py-1 text-xs" onClick={() => handleDelete(s)}>
                      <Trash2 size={12} /> 删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">新增学生</h2>
              <button type="button" onClick={() => setShowAdd(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">真实姓名</label>
                <input className="input" placeholder="学生真实姓名" value={form.real_name} onChange={e => setForm(f => ({ ...f, real_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">账号（身份证号/手机号/学号，最长18位）</label>
                <input className="input font-mono" placeholder="例：13812345678" maxLength={18} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">初始密码</label>
                <input className="input" type="password" placeholder="设置初始密码" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">班级（可选）</label>
                <input
                  className="input"
                  placeholder="输入或选择班级"
                  list="teacher-student-class-options-add"
                  value={form.class_name}
                  onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))}
                />
                <datalist id="teacher-student-class-options-add">
                  {classOptions.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>取消</button>
              <button type="button" className="btn btn-primary" onClick={handleAdd}>添加</button>
            </div>
          </div>
        </div>
      )}

      {showBulk && (
        <div className="modal-overlay" onClick={closeBulk}>
          <div className="modal-box max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">批量导入学生</h2>
              <button type="button" onClick={closeBulk}><X size={20} className="text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              推荐使用 Excel「另存为 → CSV UTF-8（逗号分隔）」。表头为「姓名,账号,密码」或「real_name,username,password」；分隔符支持逗号、分号或 Tab。若文件为系统默认 ANSI 编码，将尝试自动识别。也可无表头，每行恰好三列：姓名,账号,密码。账号全局唯一，最长 18 位。
            </p>
            <div className="flex gap-2 mb-3">
              <button type="button" className="btn btn-secondary text-sm py-1.5" onClick={downloadTemplate}>
                <Download size={14} /> 下载模板
              </button>
              <label className="btn btn-secondary text-sm py-1.5 cursor-pointer">
                <Upload size={14} /> 选择 CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleBulkFile} />
              </label>
            </div>
            <textarea
              className="input font-mono text-sm w-full min-h-[200px]"
              placeholder="粘贴 CSV 内容…"
              value={bulkText}
              onChange={e => { setBulkText(e.target.value); setBulkResult(null); }}
            />
            {bulkResult && bulkResult.errors.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto border border-red-100 rounded-lg bg-red-50/50 text-sm">
                <div className="px-2 py-1 font-medium text-red-800 border-b border-red-100">失败明细</div>
                <ul className="p-2 space-y-1 text-red-700">
                  {bulkResult.errors.map((e, i) => (
                    <li key={i}>第 {e.index + 1} 条（{e.username}）：{e.error}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-3 justify-end mt-6">
              <button type="button" className="btn btn-secondary" onClick={closeBulk}>关闭</button>
              <button type="button" className="btn btn-primary" disabled={bulkLoading} onClick={handleBulkSubmit}>
                {bulkLoading ? '导入中…' : '开始导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">编辑学生信息</h2>
              <button type="button" onClick={() => setShowEdit(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-4">
              修改登录账号须全局唯一；修改后学生需使用新账号登录。
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">真实姓名</label>
                <input className="input" value={editForm.real_name} onChange={e => setEditForm(f => ({ ...f, real_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">账号（最长 18 位）</label>
                <input className="input font-mono" maxLength={18} value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">班级（可选）</label>
                <input
                  className="input"
                  placeholder="输入或选择班级"
                  list="teacher-student-class-options-edit"
                  value={editForm.class_name}
                  onChange={e => setEditForm(f => ({ ...f, class_name: e.target.value }))}
                />
                <datalist id="teacher-student-class-options-edit">
                  {classOptions.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEdit(null)}>取消</button>
              <button type="button" className="btn btn-primary" onClick={handleSaveEdit}>保存</button>
            </div>
          </div>
        </div>
      )}

      {showPwd && (
        <div className="modal-overlay" onClick={() => setShowPwd(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">修改密码 — {showPwd.real_name}</h2>
              <button type="button" onClick={() => setShowPwd(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            <input className="input" type="password" placeholder="新密码" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            <div className="flex gap-3 justify-end mt-4">
              <button type="button" className="btn btn-secondary" onClick={() => setShowPwd(null)}>取消</button>
              <button type="button" className="btn btn-primary" onClick={handleChangePwd}>确认修改</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
