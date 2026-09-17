import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { Trophy, Trash2, X, Search, Edit2, Lock, FileCode, Eye, FolderOpen } from 'lucide-react';

interface Contest {
  id: number;
  name: string;
  code: string;
  teacher_id: number;
  teacher_name: string;
  status: 'active' | 'ended';
  description?: string;
  start_time?: string;
  end_time?: string;
  created_at: string;
}

interface TeacherOption {
  id: number;
  real_name: string;
}

export default function AdminContestsPage() {
  const nav = useNavigate();
  const [contests, setContests] = useState<Contest[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [search, setSearch] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [editTarget, setEditTarget] = useState<Contest | null>(null);
  const [form, setForm] = useState({ name: '', code: '', description: '', start_time: '', end_time: '' });
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadTeachers = () => api.get('/users/teachers').then(r => setTeachers(r.data || []));
  const loadContests = () => api.get('/contests/all', {
    params: { q: search.trim(), teacher_id: teacherFilter || undefined },
  }).then(r => setContests(r.data || []));

  useEffect(() => { loadTeachers(); }, []);
  useEffect(() => { loadContests(); }, [search, teacherFilter]);

  const openEdit = (c: Contest) => {
    setEditTarget(c);
    setForm({
      name: c.name || '',
      code: c.code || '',
      description: c.description || '',
      start_time: c.start_time ? c.start_time.slice(0, 16) : '',
      end_time: c.end_time ? c.end_time.slice(0, 16) : '',
    });
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      await api.put(`/contests/${editTarget.id}`, form);
      setMsg({ type: 'ok', text: '比赛已更新' });
      setEditTarget(null);
      loadContests();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '更新失败' });
    }
  };

  const handleEnd = async (c: Contest) => {
    if (c.status === 'ended') return;
    if (!confirm(`确认结束比赛 "${c.name}"？`)) return;
    try {
      await api.post(`/contests/${c.id}/end`);
      setMsg({ type: 'ok', text: '比赛已结束' });
      loadContests();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '操作失败' });
    }
  };

  const handleDelete = async (c: Contest) => {
    if (!confirm(`确认删除比赛 "${c.name}"？删除后所有题目和提交记录将清空。`)) return;
    try {
      await api.delete(`/contests/${c.id}`);
      setMsg({ type: 'ok', text: '比赛已删除' });
      loadContests();
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

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-2">比赛总览</h1>
      <p className="text-gray-400 text-sm mb-6">管理全部比赛并按教师筛选</p>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pr-9" placeholder="搜索比赛名称或代号" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">创建教师</label>
          <select className="input py-1.5 text-sm min-w-[180px]" value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)}>
            <option value="">全部教师</option>
            {teachers.map(t => (
              <option key={t.id} value={String(t.id)}>{t.real_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table>
          <thead>
            <tr>
              <th>比赛名称</th>
              <th>代号</th>
              <th>创建教师</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {contests.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-gray-400 py-8">暂无比赛</td></tr>
            ) : contests.map(c => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td className="font-mono text-xs text-gray-500">{c.code}</td>
                <td>{c.teacher_name}</td>
                <td>
                  <span className={`badge ${c.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                    {c.status === 'active' ? '进行中' : '已结束'}
                  </span>
                </td>
                <td className="text-gray-400 text-xs">{new Date(c.created_at).toLocaleDateString('zh-CN')}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-secondary py-1 text-xs" onClick={() => openEdit(c)}>
                      <Edit2 size={12} /> 编辑
                    </button>
                    <button type="button" className="btn btn-secondary py-1 text-xs" onClick={() => nav(`/teacher/contests/${c.id}/problems`)}>
                      <FileCode size={12} /> 题目
                    </button>
                    <button type="button" className="btn btn-secondary py-1 text-xs" onClick={() => nav(`/teacher/contests/${c.id}/review`)}>
                      <Eye size={12} /> 查看提交
                    </button>
                    <button type="button" className="btn btn-secondary py-1 text-xs" onClick={() => openContestFolder(c)}>
                      <FolderOpen size={12} /> 打开目录
                    </button>
                    <button className="btn btn-warning py-1 text-xs" disabled={c.status === 'ended'} onClick={() => handleEnd(c)}>
                      <Lock size={12} /> 结束
                    </button>
                    <button className="btn btn-danger py-1 text-xs" onClick={() => handleDelete(c)}>
                      <Trash2 size={12} /> 删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="modal-box max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">编辑比赛</h2>
              <button onClick={() => setEditTarget(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">比赛名称</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">比赛代号</label>
                <input className="input font-mono" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <textarea className="input resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button className="btn btn-secondary" onClick={() => setEditTarget(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleEdit}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
