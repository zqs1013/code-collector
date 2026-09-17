import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { Trophy, ArrowRight } from 'lucide-react';

export default function ContestListPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [contests, setContests] = useState<any[]>([]);

  useEffect(() => {
    api.get('/contests/available').then(r => setContests(r.data));
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">我的比赛</h1>
      {contests.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无进行中的比赛</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contests.map(c => (
            <div key={c.id} className="card hover:shadow-md transition cursor-pointer" onClick={() => nav(`/contests/${c.id}`)}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-blue-600" />
                </div>
                <span className="badge badge-green">进行中</span>
              </div>
              <h3 className="font-semibold text-gray-800 mb-1">{c.name}</h3>
              <p className="text-xs text-gray-400 mb-3">代号：{c.code}</p>
              {c.description && <p className="text-sm text-gray-500 mb-4">{c.description}</p>}
              <button className="btn btn-primary w-full justify-center">
                进入 <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
