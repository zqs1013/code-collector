import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import {
  ChevronLeft, ChevronDown, ChevronRight, Download, Eye, FileCode,
  CheckCircle, Clock, Users, Search, FolderOpen,
} from 'lucide-react';
import CodeMirrorEditor from '../../components/CodeMirrorEditor';

/** 列表与预览标题：仅展示代码文件名，不含路径与异常长内容 */
function displaySubmissionFileName(originalName: string, maxLen = 48) {
  const base = (originalName || '').split(/[/\\]/).pop() || originalName || '—';
  const cleaned = base.replace(/[\r\n\x00-\x1f]/g, '').trim() || '—';
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1)}…`;
}

interface Sub {
  id: number;
  student_id: number;
  student_name: string;
  student_username: string;
  problem_number: number;
  problem_title: string;
  original_name: string;
  file_size: number;
  submitted_at: string;
  finalized: number | null;
}

export default function ReviewPage() {
  const { contestId } = useParams();
  const nav = useNavigate();
  const [contest, setContest] = useState<any>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [preview, setPreview] = useState<{ content: string; filename: string } | null>(null);
  const [filterStudent, setFilterStudent] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const loadSubs = useCallback(() => {
    if (!contestId) return;
    api.get(`/teacher/contests/${contestId}/submissions`).then(r => setSubs(r.data || []));
  }, [contestId]);

  useEffect(() => {
    if (!contestId) return;
    api.get(`/contests/${contestId}`).then(r => setContest(r.data));
    loadSubs();
  }, [contestId, loadSubs]);

  // 每 10 秒刷新提交列表
  useEffect(() => {
    const timer = setInterval(loadSubs, 10000);
    return () => clearInterval(timer);
  }, [loadSubs]);

  const problemTotal = contest?.problems?.length || 0;

  const byStudent = useMemo(() => {
    const map: Record<string, Sub[]> = {};
    subs.forEach(s => {
      const key = `${s.student_id}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    Object.values(map).forEach(list => list.sort((a, b) => a.problem_number - b.problem_number));
    return map;
  }, [subs]);

  const studentIds = useMemo(() => {
    return Object.keys(byStudent)
      .filter(sid => {
        if (!filterStudent) return true;
        const grp = byStudent[sid];
        return grp[0].student_name.includes(filterStudent) || grp[0].student_username.includes(filterStudent);
      })
      .sort((a, b) => byStudent[a][0].student_name.localeCompare(byStudent[b][0].student_name, 'zh-CN'));
  }, [byStudent, filterStudent]);

  const uploadedStudentCount = Object.keys(byStudent).length;
  const finalizedStudentCount = useMemo(() => {
    return Object.values(byStudent).filter(g => !!g[0]?.finalized).length;
  }, [byStudent]);

  const toggleExpand = (sid: string) => {
    setExpanded(prev => ({ ...prev, [sid]: !prev[sid] }));
  };

  const handlePreview = async (subId: number) => {
    const res = await api.get(`/preview/${subId}`);
    setPreview({
      content: res.data.content,
      filename: displaySubmissionFileName(res.data.filename || ''),
    });
  };

  const downloadSubmission = (subId: number) => {
    window.open(`/api/download/submission/${subId}`, '_blank');
  };

  const downloadStudent = (studentId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`/api/download/student/${contestId}/${studentId}`, '_blank');
  };

  const downloadAll = () => {
    window.open(`/api/download/contest/${contestId}`, '_blank');
  };

  const openContestFolder = async () => {
    try {
      await api.post(`/teacher/contests/${contestId}/open-folder`);
    } catch (err: any) {
      alert(err.response?.data?.error || '打开目录失败');
    }
  };

  if (!contest) return <div className="p-8 text-gray-400">加载中...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button type="button" onClick={() => nav('/teacher/contests')} className="btn btn-secondary py-1.5">
          <ChevronLeft size={16} /> 返回
        </button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-bold">{contest.name} — 学生提交查看</h1>
          <p className="text-sm text-gray-500 mt-1">
            已有 <span className="font-semibold text-blue-600">{uploadedStudentCount}</span> 名学生提交过代码，
            <span className="font-semibold text-green-600"> {finalizedStudentCount}</span> 名学生已确认提交
            <span className="text-gray-400 text-xs ml-2">（每 10 秒自动刷新）</span>
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={openContestFolder}>
          <FolderOpen size={15} /> 打开比赛目录
        </button>
        <button type="button" className="btn btn-primary" onClick={downloadAll}>
          <Download size={15} /> 下载全部代码
        </button>
      </div>

      <div className="card mb-4 flex items-center gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pr-9"
            placeholder="搜索学生姓名或账号"
            value={filterStudent}
            onChange={e => setFilterStudent(e.target.value)}
          />
        </div>
        <span className="text-sm text-gray-400">列表 {studentIds.length} 人</span>
      </div>

      {studentIds.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无学生提交</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table>
            <thead>
              <tr>
                <th className="w-10"></th>
                <th>学生</th>
                <th>账号</th>
                <th>已交题数</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {studentIds.map(sid => {
                const group = byStudent[sid];
                const s0 = group[0];
                const isFinalized = !!s0.finalized;
                const isOpen = !!expanded[sid];
                const submittedCount = group.length;
                return (
                  <React.Fragment key={sid}>
                    <tr
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleExpand(sid)}
                    >
                      <td className="text-gray-400">
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                            {s0.student_name[0]}
                          </div>
                          <span className="font-semibold">{s0.student_name}</span>
                        </div>
                      </td>
                      <td className="text-gray-400 text-sm">{s0.student_username}</td>
                      <td>
                        <span className="font-medium text-blue-600">
                          {submittedCount}{problemTotal ? ` / ${problemTotal}` : ''} 题
                        </span>
                      </td>
                      <td>
                        {isFinalized ? (
                          <span className="badge badge-green inline-flex items-center gap-1">
                            <CheckCircle size={11} />已确认提交
                          </span>
                        ) : (
                          <span className="badge badge-gray inline-flex items-center gap-1">
                            <Clock size={11} />未确认
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary py-1 text-xs"
                          onClick={e => downloadStudent(Number(sid), e)}
                        >
                          <Download size={13} /> 下载全部
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={6} className="p-0">
                          <div className="px-4 py-3 border-t border-gray-100">
                            <table>
                              <thead>
                                <tr>
                                  <th>题号</th>
                                  <th>题目名称</th>
                                  <th>文件名</th>
                                  <th>大小</th>
                                  <th>上传时间</th>
                                  <th>操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.map(sub => (
                                  <tr key={sub.id}>
                                    <td className="font-bold text-blue-600">#{sub.problem_number}</td>
                                    <td>{sub.problem_title}</td>
                                    <td>
                                      <div className="flex items-center gap-1.5">
                                        <FileCode size={14} className="text-gray-400" />
                                        <span className="font-mono text-xs" title={sub.original_name}>
                                          {displaySubmissionFileName(sub.original_name)}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="text-gray-400 text-xs">{(sub.file_size / 1024).toFixed(1)} KB</td>
                                    <td className="text-gray-400 text-xs">{new Date(sub.submitted_at).toLocaleString('zh-CN')}</td>
                                    <td>
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          className="btn btn-secondary py-1 text-xs"
                                          onClick={() => handlePreview(sub.id)}
                                        >
                                          <Eye size={12} /> 预览
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-secondary py-1 text-xs"
                                          onClick={() => downloadSubmission(sub.id)}
                                        >
                                          <Download size={12} /> 下载
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <CodeMirrorEditor
          content={preview.content}
          filename={preview.filename}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
