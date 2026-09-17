import React, { useEffect, useMemo, useState, useRef, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Trophy, Plus, Edit2, Trash2, X, Eye, FileCode, Search, Paperclip, FolderOpen } from 'lucide-react';

interface Contest {
  id: number;
  name: string;
  code: string;
  description?: string;
  status: string;
  created_at: string;
  start_time?: string;
  end_time?: string;
  teacher_name?: string;
}

interface MaterialRow {
  id: number;
  original_name: string;
  file_size: number;
  created_at?: string;
}

interface TeacherOption {
  id: number;
  real_name: string;
}

export default function TeacherContestsPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'superadmin';
  const [contests, setContests] = useState<Contest[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Contest | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({ name: '', code: '', description: '', start_time: '', end_time: '', teacher_id: '' });
  const [filterQuery, setFilterQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'ended'>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [pendingMaterialFiles, setPendingMaterialFiles] = useState<File[]>([]);
  const [detailMaterials, setDetailMaterials] = useState<MaterialRow[]>([]);
  const [materialPickHint, setMaterialPickHint] = useState<string | null>(null);
  const [savingContest, setSavingContest] = useState(false);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const materialsInputId = useId();

  const load = () => {
    const url = isAdmin ? '/contests/all' : '/contests/mine';
    return api.get(url).then(r => setContests(r.data || [])).catch((err: any) => {
      const d = err.response?.data;
      setMsg({
        type: 'err',
        text: d?.error
          ? `${d.error}${d.role ? `（当前角色：${d.role}）` : ''}`
          : '加载比赛列表失败',
      });
    });
  };
  useEffect(() => {
    if (!user) return;
    load();
  }, [user, isAdmin]);
  useEffect(() => {
    if (!isAdmin || !user) return;
    api.get('/users/teachers').then(r => {
      const list: TeacherOption[] = r.data || [];
      // 归属教师可选自己（管理员）
      if (!list.some(t => t.id === user.id)) {
        list.unshift({ id: user.id, real_name: `${user.real_name || '管理员'}（自己）` });
      }
      setTeachers(list);
    });
  }, [isAdmin, user]);

  const filteredContests = useMemo(() => {
    return contests.filter(c => {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      const q = filterQuery.trim().toLowerCase();
      if (q && !c.name.toLowerCase().includes(q) && !c.code.toLowerCase().includes(q) && !(c.teacher_name || '').toLowerCase().includes(q)) return false;
      if (filterDateFrom) {
        const d0 = new Date(filterDateFrom);
        d0.setHours(0, 0, 0, 0);
        if (new Date(c.created_at) < d0) return false;
      }
      if (filterDateTo) {
        const d1 = new Date(filterDateTo);
        d1.setHours(23, 59, 59, 999);
        if (new Date(c.created_at) > d1) return false;
      }
      return true;
    });
  }, [contests, filterQuery, filterStatus, filterDateFrom, filterDateTo]);

  const resetForm = () => setForm({
    name: '',
    code: '',
    description: '',
    start_time: '',
    end_time: '',
    teacher_id: isAdmin && user ? String(user.id) : '',
  });

  const closeModal = () => {
    setShowAdd(false);
    setEditTarget(null);
    setPendingMaterialFiles([]);
    setDetailMaterials([]);
    setMaterialPickHint(null);
    setSavingContest(false);
    if (materialInputRef.current) materialInputRef.current.value = '';
  };

  const uploadMaterialFiles = async (contestId: number, files: File[]) => {
    if (!files.length) return;
    const fd = new FormData();
    // 与学生代码上传一致：第三个参数显式指定 multipart 中的 filename，避免部分环境下文件名丢失或乱码
    files.forEach(f => fd.append('files', f, f.name));
    // 不要手动设置 Content-Type，否则缺少 boundary，multer 无法解析，上传会失败
    await api.post(`/contests/${contestId}/materials`, fd);
  };

  const handleAdd = async () => {
    if (!form.name || !form.code) { setMsg({ type: 'err', text: '比赛名称和代号不能为空' }); return; }
    const ownerId = isAdmin ? Number(form.teacher_id || user?.id) : undefined;
    if (isAdmin && (!ownerId || ownerId <= 0)) { setMsg({ type: 'err', text: '请选择归属教师' }); return; }
    setSavingContest(true);
    setMsg(null);
    try {
      const payload = isAdmin
        ? { ...form, teacher_id: ownerId }
        : { name: form.name, code: form.code, description: form.description, start_time: form.start_time, end_time: form.end_time };
      const { data } = await api.post('/contests', payload);
      const id = data.id as number;
      if (pendingMaterialFiles.length) {
        try {
          await uploadMaterialFiles(id, pendingMaterialFiles);
        } catch (up: any) {
          setMsg({
            type: 'err',
            text: `比赛已创建，但资料上传失败：${up.response?.data?.error || up.message || '未知错误'}。可在编辑比赛中重新上传。`,
          });
          closeModal();
          resetForm();
          load();
          return;
        }
      }
      setMsg({ type: 'ok', text: pendingMaterialFiles.length ? '比赛创建成功，资料已上传' : '比赛创建成功' });
      closeModal();
      resetForm();
      load();
    } catch (err: any) {
      const d = err.response?.data;
      setMsg({
        type: 'err',
        text: d?.error
          ? `${d.error}${d.role ? `（当前角色：${d.role}）` : ''}`
          : '创建失败',
      });
    } finally {
      setSavingContest(false);
    }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    setSavingContest(true);
    setMsg(null);
    try {
      await api.put(`/contests/${editTarget.id}`, form);
      if (pendingMaterialFiles.length) {
        await uploadMaterialFiles(editTarget.id, pendingMaterialFiles);
      }
      setMsg({ type: 'ok', text: pendingMaterialFiles.length ? '已更新并上传新资料' : '已更新' });
      closeModal();
      resetForm();
      load();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '更新失败' });
    } finally {
      setSavingContest(false);
    }
  };

  const openEdit = async (c: Contest) => {
    setEditTarget(c);
    setForm({
      name: c.name,
      code: c.code,
      description: c.description || '',
      start_time: c.start_time ? c.start_time.slice(0, 16) : '',
      end_time: c.end_time ? c.end_time.slice(0, 16) : '',
      teacher_id: '',
    });
    setPendingMaterialFiles([]);
    if (materialInputRef.current) materialInputRef.current.value = '';
    try {
      const r = await api.get(`/contests/${c.id}`);
      setDetailMaterials(r.data.materials || []);
    } catch {
      setDetailMaterials([]);
    }
  };

  const removeDetailMaterial = async (mid: number) => {
    if (!editTarget || !confirm('确认删除该资料文件？')) return;
    try {
      await api.delete(`/contests/${editTarget.id}/materials/${mid}`);
      setDetailMaterials(m => m.filter(x => x.id !== mid));
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '删除失败' });
    }
  };

  const handleDelete = async (c: Contest) => {
    if (!confirm(`确认删除比赛 "${c.name}"？删除后所有题目和提交记录将清空。`)) return;
    try {
      await api.delete(`/contests/${c.id}`);
      setMsg({ type: 'ok', text: '已删除' });
      load();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '删除失败' });
    }
  };

  const openContestFolder = async (c: Contest) => {
    try {
      await api.post(`/teacher/contests/${c.id}/open-folder`);
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '打开目录失败' });
    }
  };

  const toggleStatus = async (c: Contest) => {
    const newStatus = c.status === 'active' ? 'ended' : 'active';
    await api.put(`/contests/${c.id}`, { status: newStatus });
    load();
  };

  const openMaterialPicker = () => {
    setMaterialPickHint(null);
    materialInputRef.current?.click();
  };

  const onPickMaterials = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    const added = Array.from(list);
    setPendingMaterialFiles(prev => [...prev, ...added]);
    setMaterialPickHint(`已添加 ${added.length} 个文件（点「创建」或「保存」后上传）`);
    e.target.value = '';
  };

  const removePendingAt = (idx: number) => {
    setPendingMaterialFiles(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">比赛管理</h1>
          <p className="text-gray-400 text-sm mt-1">{isAdmin ? '管理全部比赛（含题目、资料与批阅）' : '创建并管理您的比赛'}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => { setShowAdd(true); resetForm(); setPendingMaterialFiles([]); setDetailMaterials([]); setMaterialPickHint(null); if (materialInputRef.current) materialInputRef.current.value = ''; }}>
          <Plus size={16} /> 新建比赛
        </button>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg.text}
          <button type="button" onClick={() => setMsg(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {contests.length > 0 && (
        <div className="card mb-4 p-4 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-gray-500">
            <Search size={16} />
            <span className="text-sm font-medium text-gray-700">筛选</span>
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="block text-xs text-gray-400 mb-1">关键词（名称 / 代号）</label>
            <div className="relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input py-1.5 text-sm pr-9" placeholder="搜索…" value={filterQuery} onChange={e => setFilterQuery(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">状态</label>
            <select className="input py-1.5 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}>
              <option value="all">全部</option>
              <option value="active">进行中</option>
              <option value="ended">已结束</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">创建日期起</label>
            <input type="date" className="input py-1.5 text-sm" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">创建日期止</label>
            <input type="date" className="input py-1.5 text-sm" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </div>
          <span className="text-xs text-gray-400 pb-2">共 {filteredContests.length} 场</span>
        </div>
      )}

      {contests.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无比赛，点击右上角新建</p>
        </div>
      ) : filteredContests.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>没有符合筛选条件的比赛</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContests.map(c => (
            <div key={c.id} className="card flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Trophy className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <span className={`badge ${c.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                    {c.status === 'active' ? '进行中' : '已结束'}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  代号：{c.code}
                  {isAdmin && c.teacher_name ? ` · 教师：${c.teacher_name}` : ''}
                  {' · '}创建于 {new Date(c.created_at).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button type="button" className="btn btn-secondary py-1.5 text-xs" onClick={() => nav(`/teacher/contests/${c.id}/problems`)}>
                  <FileCode size={13} /> 题目
                </button>
                <button type="button" className="btn btn-secondary py-1.5 text-xs" onClick={() => nav(`/teacher/contests/${c.id}/review`)}>
                  <Eye size={13} /> 查看提交
                </button>
                <button type="button" className="btn btn-secondary py-1.5 text-xs" onClick={() => openContestFolder(c)}>
                  <FolderOpen size={13} /> 打开目录
                </button>
                <button type="button" className="btn btn-secondary py-1.5 text-xs" onClick={() => openEdit(c)}>
                  <Edit2 size={13} /> 编辑
                </button>
                <button
                  type="button"
                  className={`btn py-1.5 text-xs ${c.status === 'active' ? 'btn-warning' : 'btn-success'}`}
                  onClick={() => toggleStatus(c)}
                >
                  {c.status === 'active' ? '结束比赛' : '重新开始'}
                </button>
                <button type="button" className="btn btn-danger py-1.5 text-xs" onClick={() => handleDelete(c)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showAdd || editTarget) && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{showAdd ? '新建比赛' : '编辑比赛'}</h2>
              <button type="button" onClick={closeModal}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {showAdd && isAdmin && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">归属教师 *</label>
                  <select className="input" value={form.teacher_id || (user ? String(user.id) : '')} onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}>
                    {teachers.map(t => (
                      <option key={t.id} value={String(t.id)}>{t.real_name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1.5">比赛名称 *</label>
                <input className="input" placeholder="例：2026年春季编程大赛" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">比赛代号（英文） *</label>
                <input className="input font-mono" placeholder="例：spring2026" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') }))} />
                <p className="text-xs text-gray-400 mt-1">
                  {showAdd ? '用于存储目录，只允许字母、数字、下划线和短横线。' : '修改代号将重命名服务器上的提交与资料目录，请谨慎操作。'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">开始时间</label>
                  <input type="datetime-local" className="input" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">结束时间</label>
                  <input type="datetime-local" className="input" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">描述</label>
                <textarea className="input resize-none" rows={2} placeholder="比赛说明（可选）" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div className="relative">
                <div className="block text-sm font-medium mb-1.5 flex items-center gap-2">
                  <Paperclip size={14} /> 比赛资料（PDF、ZIP 等）
                </div>
                {/* 勿用 display:none + label 触发：部分浏览器不会弹出文件框；用按钮调用 input.click() */}
                <input
                  ref={materialInputRef}
                  id={materialsInputId}
                  type="file"
                  multiple
                  aria-label="选择比赛资料文件"
                  className="absolute h-px w-px overflow-hidden opacity-0"
                  tabIndex={-1}
                  accept=".pdf,.zip,.doc,.docx,.rar,.7z,.ppt,.pptx,.txt,.xls,.xlsx,application/pdf,application/zip"
                  onChange={onPickMaterials}
                />
                <button type="button" className="btn btn-secondary text-sm" onClick={openMaterialPicker}>
                  选择文件
                </button>
                <p className="text-xs text-gray-400 mt-1">可选；单个文件最大 100MB，资料单独存储，与学生代码目录无关。{editTarget ? '保存时上传新选择的文件。' : '创建成功后随「创建」一并上传。'}</p>
                {materialPickHint && (
                  <p className="text-xs text-blue-600 mt-1">{materialPickHint}</p>
                )}
                {pendingMaterialFiles.length > 0 && (
                  <ul className="mt-2 text-xs border border-gray-100 rounded-lg divide-y max-h-28 overflow-y-auto">
                    {pendingMaterialFiles.map((f, i) => (
                      <li key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between px-2 py-1.5 gap-2">
                        <span className="truncate font-mono" title={f.name}>{f.name}</span>
                        <span className="text-gray-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                        <button type="button" className="text-red-500 shrink-0" onClick={() => removePendingAt(i)}><X size={14} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {editTarget && detailMaterials.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">已上传资料</label>
                  <ul className="text-xs border border-gray-100 rounded-lg divide-y">
                    {detailMaterials.map(m => (
                      <li key={m.id} className="flex items-center justify-between px-2 py-1.5 gap-2">
                        <span className="truncate font-mono">{m.original_name}</span>
                        <button type="button" className="text-red-500 shrink-0 text-xs" onClick={() => removeDetailMaterial(m.id)}>删除</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button type="button" className="btn btn-secondary" disabled={savingContest} onClick={closeModal}>取消</button>
              <button type="button" className="btn btn-primary" disabled={savingContest} onClick={showAdd ? handleAdd : handleEdit}>
                {savingContest ? (showAdd ? '创建并上传中…' : '保存并上传中…') : (showAdd ? '创建' : '保存')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
