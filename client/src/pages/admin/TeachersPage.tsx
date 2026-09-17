import React, { useEffect, useState } from 'react';
import api from '../../api';
import { Plus, Trash2, Key, X, Search, Edit2 } from 'lucide-react';

interface Teacher {
  id: number;
  username: string;
  real_name: string;
  created_at: string;
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showPwd, setShowPwd] = useState<Teacher | null>(null);
  const [showEdit, setShowEdit] = useState<Teacher | null>(null);
  const [form, setForm] = useState({ username: '', password: '', real_name: '' });
  const [editForm, setEditForm] = useState({ username: '', real_name: '' });
  const [newPwd, setNewPwd] = useState('');
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = () => api.get('/users/teachers').then(r => setTeachers(r.data));
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.username || !form.password || !form.real_name) { setMsg({ type: 'err', text: '请填写完整信息' }); return; }
    try {
      await api.post('/users/teachers', form);
      setMsg({ type: 'ok', text: '教师已添加' });
      setShowAdd(false);
      setForm({ username: '', password: '', real_name: '' });
      load();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '添加失败' });
    }
  };

  const handleDelete = async (t: Teacher) => {
    if (!confirm(`确认删除教师 "${t.real_name}" (${t.username})？`)) return;
    try {
      await api.delete(`/users/teachers/${t.id}`);
      setMsg({ type: 'ok', text: '已删除' });
      load();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '删除失败' });
    }
  };

  const openEdit = (t: Teacher) => {
    setShowEdit(t);
    setEditForm({ username: t.username, real_name: t.real_name });
  };

  const handleSaveEdit = async () => {
    if (!showEdit) return;
    if (!editForm.real_name.trim() || !editForm.username.trim()) {
      setMsg({ type: 'err', text: '姓名与账号不能为空' }); return;
    }
    try {
      await api.put(`/users/teachers/${showEdit.id}`, {
        real_name: editForm.real_name.trim(),
        username: editForm.username.trim(),
      });
      setMsg({ type: 'ok', text: '教师信息已更新' });
      setShowEdit(null);
      load();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '更新失败' });
    }
  };

  const handleChangePwd = async () => {
    if (!newPwd) { setMsg({ type: 'err', text: '请输入新密码' }); return; }
    try {
      await api.put(`/users/teachers/${showPwd!.id}/password`, { password: newPwd });
      setMsg({ type: 'ok', text: '密码修改成功' });
      setShowPwd(null);
      setNewPwd('');
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '修改失败' });
    }
  };

  const filtered = teachers.filter(t =>
    t.real_name.includes(search) || t.username.includes(search)
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">教师管理</h1>
          <p className="text-gray-400 text-sm mt-1">管理所有教师账号</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> 新增教师
        </button>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="card mb-4">
        <div className="relative max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pr-9" placeholder="搜索姓名或账号" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table>
          <thead>
            <tr>
              <th>姓名</th>
              <th>账号</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4} className="text-center text-gray-400 py-8">暂无教师</td></tr>
            ) : filtered.map(t => (
              <tr key={t.id}>
                <td className="font-medium">{t.real_name}</td>
                <td className="font-mono text-gray-500">{t.username}</td>
                <td className="text-gray-400 text-xs">{new Date(t.created_at).toLocaleDateString('zh-CN')}</td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-secondary py-1 text-xs" onClick={() => openEdit(t)}>
                      <Edit2 size={12} /> 编辑
                    </button>
                    <button className="btn btn-secondary py-1 text-xs" onClick={() => { setShowPwd(t); setNewPwd(''); }}>
                      <Key size={12} /> 改密码
                    </button>
                    <button className="btn btn-danger py-1 text-xs" onClick={() => handleDelete(t)}>
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
              <h2 className="text-lg font-bold">新增教师</h2>
              <button onClick={() => setShowAdd(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">真实姓名</label>
                <input className="input" placeholder="教师姓名" value={form.real_name} onChange={e => setForm(f => ({ ...f, real_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">账号</label>
                <input className="input" placeholder="登录账号" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">初始密码</label>
                <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleAdd}>添加</button>
            </div>
          </div>
        </div>
      )}

      {showPwd && (
        <div className="modal-overlay" onClick={() => setShowPwd(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">修改密码 — {showPwd.real_name}</h2>
              <button onClick={() => setShowPwd(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            <input className="input" type="password" placeholder="新密码" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            <div className="flex gap-3 justify-end mt-4">
              <button className="btn btn-secondary" onClick={() => setShowPwd(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleChangePwd}>确认修改</button>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">编辑教师信息</h2>
              <button onClick={() => setShowEdit(null)}><X size={20} className="text-gray-400" /></button>
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
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button className="btn btn-secondary" onClick={() => setShowEdit(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleSaveEdit}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
