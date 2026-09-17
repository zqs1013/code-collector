import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, LogOut, Home, Trophy, Users, KeyRound } from 'lucide-react';
import api from '../api';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

const navItems: NavItem[] = [
  { to: '/', label: '首页', icon: <Home size={18} />, roles: ['superadmin', 'teacher', 'student'] },
  { to: '/contests', label: '我的比赛', icon: <Trophy size={18} />, roles: ['student'] },
  { to: '/teacher/contests', label: '比赛管理', icon: <Trophy size={18} />, roles: ['teacher', 'superadmin'] },
  { to: '/teacher/students', label: '学生管理', icon: <Users size={18} />, roles: ['teacher'] },
  { to: '/admin/teachers', label: '教师管理', icon: <Users size={18} />, roles: ['superadmin'] },
  { to: '/admin/contests', label: '比赛总览', icon: <Trophy size={18} />, roles: ['superadmin'] },
  { to: '/admin/students', label: '学生总览', icon: <Users size={18} />, roles: ['superadmin'] },
];

function navLinkActive(to: string, pathname: string) {
  return pathname === to || (to !== '/' && pathname.startsWith(to));
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!user) return <>{children}</>;

  const myNavs = navItems.filter(n => n.roles.includes(user.role));

  const roleLabel = { superadmin: '超级管理员', teacher: '教师', student: '学生' }[user.role];
  const roleColor = { superadmin: 'badge-red', teacher: 'badge-blue', student: 'badge-green' }[user.role];
  const resetPwdModal = () => {
    setOldPwd('');
    setNewPwd('');
    setPwdMsg(null);
  };
  const closePwdModal = () => {
    setShowPwdModal(false);
    resetPwdModal();
  };
  const changeMyPassword = async () => {
    if (!oldPwd || !newPwd) {
      setPwdMsg({ type: 'err', text: '请填写旧密码和新密码' });
      return;
    }
    try {
      await api.put('/auth/change-password', { old_password: oldPwd, new_password: newPwd });
      setPwdMsg({ type: 'ok', text: '密码修改成功，请使用新密码重新登录' });
      setTimeout(async () => {
        closePwdModal();
        await logout();
      }, 800);
    } catch (e: any) {
      setPwdMsg({ type: 'err', text: e?.response?.data?.error || '修改失败' });
    }
  };

  if (user.role === 'student') {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="shrink-0 h-16 border-b border-gray-200 bg-white flex items-stretch px-4 gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0 self-center">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white">
              <BookOpen size={16} />
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="font-semibold text-xs text-gray-900">比赛代码</div>
              <div className="font-semibold text-xs text-gray-500">收集系统</div>
            </div>
          </Link>

          <nav className="flex items-stretch gap-0 flex-1 min-w-0 overflow-x-auto justify-start md:justify-center">
            {myNavs.map(item => {
              const active = navLinkActive(item.to, location.pathname);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-3 sm:px-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    active
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-200'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 border-l border-gray-100 pl-3 sm:pl-4">
            <div className="hidden md:flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-700 shrink-0">
                {user.real_name[0]}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate max-w-[8rem]">{user.real_name}</div>
                <span className={`badge ${roleColor} text-xs`}>{roleLabel}</span>
              </div>
            </div>
            <div className="flex md:hidden items-center">
              <span className={`badge ${roleColor} text-xs`}>{roleLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => { setShowPwdModal(true); resetPwdModal(); }}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm py-1.5 px-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
            >
              <KeyRound size={16} />
              <span className="hidden sm:inline">修改密码</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm py-1.5 px-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">退出登录</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
        {showPwdModal && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="card max-w-md w-full space-y-3">
              <h2 className="text-lg font-bold">修改我的密码</h2>
              <p className="text-xs text-gray-500">新密码至少 10 位，且包含大小写字母、数字和特殊字符。</p>
              {pwdMsg && <div className={pwdMsg.type === 'ok' ? 'alert-ok' : 'alert-error'}>{pwdMsg.text}</div>}
              <input className="input" type="password" placeholder="旧密码" value={oldPwd} onChange={e => setOldPwd(e.target.value)} />
              <input className="input" type="password" placeholder="新密码" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button className="btn btn-secondary" onClick={closePwdModal}>取消</button>
                <button className="btn btn-primary" onClick={changeMyPassword}>保存</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* 侧边栏 */}
      <aside className="w-60 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center">
              <BookOpen size={18} />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">比赛代码</div>
              <div className="font-semibold text-sm leading-tight text-gray-300">收集系统</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {myNavs.map(item => {
            const active = navLinkActive(item.to, location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* 用户信息 */}
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center text-sm font-bold">
              {user.real_name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.real_name}</div>
              <span className={`badge ${roleColor} text-xs`}>{roleLabel}</span>
            </div>
          </div>
          <div className="text-xs text-gray-400 px-1 py-1">
            Bug反馈：请联系管理员
          </div>
          <button
            onClick={() => { setShowPwdModal(true); resetPwdModal(); }}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-xs w-full py-1 px-1 rounded transition-colors"
          >
            <KeyRound size={14} />
            修改密码
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-xs w-full py-1 px-1 rounded transition-colors"
          >
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      {showPwdModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="card max-w-md w-full space-y-3">
            <h2 className="text-lg font-bold">修改我的密码</h2>
            <p className="text-xs text-gray-500">新密码至少 10 位，且包含大小写字母、数字和特殊字符。</p>
            {pwdMsg && <div className={pwdMsg.type === 'ok' ? 'alert-ok' : 'alert-error'}>{pwdMsg.text}</div>}
            <input className="input" type="password" placeholder="旧密码" value={oldPwd} onChange={e => setOldPwd(e.target.value)} />
            <input className="input" type="password" placeholder="新密码" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={closePwdModal}>取消</button>
              <button className="btn btn-primary" onClick={changeMyPassword}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
