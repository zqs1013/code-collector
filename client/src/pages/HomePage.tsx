import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import { Trophy, CheckCircle, ArrowRight } from 'lucide-react';

export default function HomePage() {
  const { user } = useAuth();

  if (!user) return null;

  if (user.role === 'student') return <StudentHome />;
  if (user.role === 'teacher') return <TeacherHome />;
  return <AdminHome />;
}

function StudentHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [contests, setContests] = useState<any[]>([]);

  useEffect(() => {
    api.get('/contests/available').then(r => setContests(r.data));
  }, []);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">欢迎，{user?.real_name} 同学！</h1>
        <p className="text-gray-500 mt-1">以下是您可以参加的比赛</p>
      </div>

      {contests.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无进行中的比赛</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contests.map(c => (
            <div key={c.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={() => nav(`/contests/${c.id}`)}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-blue-600" />
                </div>
                <span className="badge badge-green">进行中</span>
              </div>
              <h3 className="font-semibold text-gray-800 mb-1">{c.name}</h3>
              <p className="text-xs text-gray-400 mb-4">代号：{c.code}</p>
              {c.description && <p className="text-sm text-gray-500 mb-4 line-clamp-2">{c.description}</p>}
              <button className="btn btn-primary w-full justify-center text-sm">
                进入比赛 <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeacherHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [stats, setStats] = useState({ contests: 0, students: 0 });

  useEffect(() => {
    Promise.all([
      api.get(user?.role === 'superadmin' ? '/contests/all' : '/contests/mine'),
      api.get('/users/students'),
    ]).then(([c, s]) => {
      setStats({ contests: c.data.length, students: s.data.length });
    }).catch(() => {});
  }, [user?.role]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">欢迎，{user?.real_name} 老师！</h1>
        <p className="text-gray-500 mt-1">管理您的比赛和学生</p>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-8 max-w-md">
        <div className="card text-center">
          <div className="text-3xl font-bold text-blue-600">{stats.contests}</div>
          <div className="text-sm text-gray-500 mt-1">创建的比赛</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-600">{stats.students}</div>
          <div className="text-sm text-gray-500 mt-1">管理的学生</div>
        </div>
      </div>
      <div className="flex gap-3">
        <button className="btn btn-primary" onClick={() => nav('/teacher/contests')}>比赛管理</button>
        <button className="btn btn-secondary" onClick={() => nav('/teacher/students')}>学生管理</button>
      </div>
    </div>
  );
}

function AdminHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">欢迎，{user?.real_name}！</h1>
        <p className="text-gray-500 mt-1">超级管理员控制台（含教师全部权限）</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 max-w-4xl">
        <div className="card cursor-pointer hover:shadow-md transition-shadow" onClick={() => nav('/teacher/contests')}>
          <Trophy className="w-8 h-8 text-blue-500 mb-2" />
          <div className="font-semibold">比赛管理</div>
          <p className="text-sm text-gray-400 mt-1">创建比赛、题目、资料与批阅</p>
        </div>
        <div className="card cursor-pointer hover:shadow-md transition-shadow" onClick={() => nav('/admin/contests')}>
          <Trophy className="w-8 h-8 text-indigo-500 mb-2" />
          <div className="font-semibold">比赛总览</div>
          <p className="text-sm text-gray-400 mt-1">查看所有教师创建的比赛</p>
        </div>
        <div className="card cursor-pointer hover:shadow-md transition-shadow" onClick={() => nav('/admin/teachers')}>
          <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
          <div className="font-semibold">教师管理</div>
          <p className="text-sm text-gray-400 mt-1">添加和管理教师账号</p>
        </div>
        <div className="card cursor-pointer hover:shadow-md transition-shadow" onClick={() => nav('/admin/students')}>
          <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
          <div className="font-semibold">学生总览</div>
          <p className="text-sm text-gray-400 mt-1">管理全部学生账号</p>
        </div>
      </div>
    </div>
  );
}
