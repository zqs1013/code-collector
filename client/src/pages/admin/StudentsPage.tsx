import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Trash2, Key, X, Search, Edit2, Upload, Download } from 'lucide-react';

interface Student {
  id: number;
  username: string;
  real_name: string;
  class_name?: string | null;
  teacher_id: number;
  teacher_name?: string;
  created_at: string;
}

interface TeacherOption {
  id: number;
  real_name: string;
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
    return ['姓名', '真实姓名', '账号', '学号', '用户名', '密码', '初始密码', '班级'].includes(c.replace(/\s+/g, ''))
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
      error: '无法识别列：请使用表头「姓名,账号,密码,班级（可选）」；无表头时每行三或四列。',
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
      /* ignore */
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

export default function AdminStudentsPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showEdit, setShowEdit] = useState<Student | null>(null);
  const [showPwd, setShowPwd] = useState<Student | null>(null);
  const [search, setSearch] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', real_name: '', class_name: '', teacher_id: '' });
  const [editForm, setEditForm] = useState({ username: '', real_name: '', class_name: '' });
  const [bulkText, setBulkText] = useState('');
  const [bulkTeacherId, setBulkTeacherId] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ created: number; failed: number; errors: BulkErrorRow[] } | null>(null);
  const [newPwd, setNewPwd] = useState('');

  const teacherOptions = useMemo(() => {
    const list = [...teachers];
    if (user && !list.some(t => t.id === user.id)) {
      list.unshift({ id: user.id, real_name: `${user.real_name || '管理员'}（自己）` });
    }
    return list;
  }, [teachers, user]);

  const loadTeachers = () => api.get('/users/teachers').then(r => setTeachers(r.data || []));
  const loadStudents = () => api.get('/users/students', {
    params: { q: search.trim(), teacher_id: teacherFilter || undefined, class_name: classFilter.trim() || undefined },
  }).then(r => {
    setStudents(r.data || []);
    setSelectedIds(new Set());
  });
  const loadClassOptions = () => api.get('/users/student-classes', {
    params: { teacher_id: teacherFilter || undefined },
  }).then(r => setClassOptions(r.data || []));

  useEffect(() => { loadTeachers(); }, []);
  useEffect(() => { loadStudents(); }, [search, teacherFilter, classFilter]);
  useEffect(() => { loadClassOptions(); }, [teacherFilter]);

  const allSelected = students.length > 0 && students.every(s => selectedIds.has(s.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(students.map(s => s.id)));
  };
  const toggleSelectOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selfId = user ? String(user.id) : '';

  const openAdd = () => {
    setAddError(null);
    setShowAdd(true);
    setForm({ username: '', password: '', real_name: '', class_name: '', teacher_id: selfId });
  };

  const handleAdd = async () => {
    const teacherId = form.teacher_id || selfId;
    const username = form.username.trim();
    const real_name = form.real_name.trim();
    const password = form.password;
    if (!username || !password || !real_name || !teacherId) {
      setAddError('请填写完整信息（姓名、账号、密码）');
      return;
    }
    try {
      await api.post('/users/students', {
        username,
        password,
        real_name,
        class_name: form.class_name.trim(),
        teacher_id: Number(teacherId),
      });
      setMsg({ type: 'ok', text: '学生添加成功' });
      setAddError(null);
      setShowAdd(false);
      setForm({ username: '', password: '', real_name: '', class_name: '', teacher_id: selfId });
      // 若当前按其他教师筛选，切到新学生所属教师，避免“添加成功但列表看不到”
      if (teacherFilter && teacherFilter !== String(teacherId)) {
        setTeacherFilter(String(teacherId));
      } else {
        loadStudents();
      }
      loadClassOptions();
    } catch (err: any) {
      setAddError(err.response?.data?.error || '添加失败');
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
      loadStudents();
      loadClassOptions();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '更新失败' });
    }
  };

  const handleDelete = async (s: Student) => {
    if (!confirm(`确认删除学生 "${s.real_name}" (${s.username})？`)) return;
    try {
      await api.delete(`/users/students/${s.id}`);
      setMsg({ type: 'ok', text: '已删除' });
      loadStudents();
      loadClassOptions();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '删除失败' });
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!confirm(`确认批量删除已选的 ${ids.length} 名学生？`)) return;
    try {
      const { data } = await api.post('/users/students/bulk-delete', { ids });
      setMsg({ type: 'ok', text: `已批量删除 ${data.deleted ?? ids.length} 名学生` });
      setSelectedIds(new Set());
      loadStudents();
      loadClassOptions();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '批量删除失败' });
    }
  };

  const handleChangePwd = async () => {
    if (!showPwd) return;
    if (!newPwd) { setMsg({ type: 'err', text: '请输入新密码' }); return; }
    try {
      await api.put(`/users/students/${showPwd.id}/password`, { password: newPwd });
      setMsg({ type: 'ok', text: '密码修改成功' });
      setShowPwd(null);
      setNewPwd('');
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '修改失败' });
    }
  };

  const closeBulk = () => {
    setShowBulk(false);
    setBulkText('');
    setBulkResult(null);
    setBulkError(null);
    setBulkLoading(false);
  };

  const handleBulkFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      if (res instanceof ArrayBuffer) setBulkText(decodeTextFile(res));
      else if (typeof res === 'string') setBulkText(res);
      setBulkResult(null);
      setBulkError(null);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleBulkSubmit = async () => {
    const tid = bulkTeacherId || selfId;
    if (!tid) {
      setBulkError('请先选择归属教师');
      return;
    }
    const { students: rows, error } = parseCsvToStudents(bulkText);
    if (error) {
      setBulkError(error);
      return;
    }
    if (!rows.length) {
      setBulkError('没有可导入的数据行（除表头外至少一行）');
      return;
    }
    setBulkLoading(true);
    setBulkResult(null);
    setBulkError(null);
    try {
      const { data } = await api.post('/users/students-bulk', {
        teacher_id: Number(tid),
        students: rows,
      });
      setMsg({
        type: data.failed ? 'err' : 'ok',
        text: `批量导入完成：成功 ${data.created} 条，失败 ${data.failed} 条`,
      });
      if (data.created > 0) {
        if (teacherFilter && teacherFilter !== String(tid)) {
          setTeacherFilter(String(tid));
        } else {
          loadStudents();
        }
        loadClassOptions();
      }
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
      setBulkError(err.response?.data?.error || err.message || '导入请求失败');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">学生总览</h1>
          <p className="text-gray-400 text-sm mt-1">管理所有学生账号（支持批量导入）</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => { setShowBulk(true); setBulkText(''); setBulkResult(null); setBulkError(null); setBulkTeacherId(selfId); }}>
            <Upload size={16} /> 批量导入
          </button>
          <button type="button" className="btn btn-primary" onClick={openAdd}>
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
          <label className="block text-xs text-gray-400 mb-1">所属教师</label>
          <select className="input py-1.5 text-sm min-w-[180px]" value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)}>
            <option value="">全部教师</option>
            {teacherOptions.map(t => (
              <option key={t.id} value={String(t.id)}>{t.real_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">班级筛选</label>
          <input
            className="input py-1.5 text-sm min-w-[180px]"
            placeholder="输入或选择班级"
            list="admin-student-class-options"
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
          />
          <datalist id="admin-student-class-options">
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
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              </th>
              <th>姓名</th>
              <th>账号</th>
              <th>班级</th>
              <th>所属教师</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-gray-400 py-8">暂无学生</td></tr>
            ) : students.map(s => (
              <tr key={s.id}>
                <td className="text-center">
                  <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelectOne(s.id)} />
                </td>
                <td className="font-medium">{s.real_name}</td>
                <td className="font-mono text-xs text-gray-500">{s.username}</td>
                <td>{s.class_name || '—'}</td>
                <td>{s.teacher_name || '—'}</td>
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
        <div className="modal-overlay" onClick={() => { setShowAdd(false); setAddError(null); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">新增学生</h2>
              <button type="button" onClick={() => { setShowAdd(false); setAddError(null); }}><X size={20} className="text-gray-400" /></button>
            </div>
            {addError && (
              <div className="mb-3 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-600 border border-red-200">
                {addError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">所属教师 *</label>
                <select className="input" value={form.teacher_id || selfId} onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}>
                  {teacherOptions.map(t => (
                    <option key={t.id} value={String(t.id)}>{t.real_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">真实姓名</label>
                <input className="input" placeholder="学生姓名" value={form.real_name} onChange={e => { setAddError(null); setForm(f => ({ ...f, real_name: e.target.value })); }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">账号</label>
                <input className="input font-mono" maxLength={18} value={form.username} onChange={e => { setAddError(null); setForm(f => ({ ...f, username: e.target.value })); }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">初始密码</label>
                <input className="input" type="password" value={form.password} onChange={e => { setAddError(null); setForm(f => ({ ...f, password: e.target.value })); }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">班级（可选）</label>
                <input
                  className="input"
                  placeholder="输入或选择班级"
                  list="admin-student-class-options-add"
                  value={form.class_name}
                  onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))}
                />
                <datalist id="admin-student-class-options-add">
                  {classOptions.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button type="button" className="btn btn-secondary" onClick={() => { setShowAdd(false); setAddError(null); }}>取消</button>
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
            {bulkError && (
              <div className="mb-3 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-600 border border-red-200">
                {bulkError}
              </div>
            )}
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1.5">归属教师 *</label>
              <select className="input" value={bulkTeacherId || selfId} onChange={e => setBulkTeacherId(e.target.value)}>
                {teacherOptions.map(t => (
                  <option key={t.id} value={String(t.id)}>{t.real_name}</option>
                ))}
              </select>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              表头：姓名,账号,密码,班级（可选）。支持 CSV / 粘贴；账号全局唯一，最长 18 位。
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
              onChange={e => { setBulkText(e.target.value); setBulkResult(null); setBulkError(null); }}
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
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">真实姓名</label>
                <input className="input" value={editForm.real_name} onChange={e => setEditForm(f => ({ ...f, real_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">账号（最长18位）</label>
                <input className="input font-mono" maxLength={18} value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">班级（可选）</label>
                <input
                  className="input"
                  placeholder="输入或选择班级"
                  list="admin-student-class-options-edit"
                  value={editForm.class_name}
                  onChange={e => setEditForm(f => ({ ...f, class_name: e.target.value }))}
                />
                <datalist id="admin-student-class-options-edit">
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
