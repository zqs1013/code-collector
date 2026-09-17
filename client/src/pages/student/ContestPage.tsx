import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import {
  Upload,
  Eye,
  CheckCircle,
  AlertCircle,
  FileCode,
  X,
  ChevronLeft,
  Lock,
  Download,
  Megaphone,
  FolderArchive,
} from 'lucide-react';
import CodeMirrorEditor from '../../components/CodeMirrorEditor';

interface Problem {
  id: number;
  number: number;
  title: string;
  code: string;
  description?: string;
}

interface Submission {
  id: number;
  problem_id: number;
  problem_number: number;
  problem_title: string;
  problem_code?: string;
  original_name: string;
  file_size: number;
  submitted_at: string;
}

interface ContestMaterial {
  id: number;
  original_name: string;
  file_size: number;
}

type MainSection = 'notice' | 'materials' | 'upload';

function formatContestTime(iso?: string | null) {
  if (!iso) return '未设置';
  return new Date(iso).toLocaleString('zh-CN');
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return '已截止';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ContestPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [contest, setContest] = useState<any>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pkgInfo, setPkgInfo] = useState<{ original_name: string; file_size: number; submitted_at: string } | null>(null);
  const [finalized, setFinalized] = useState(false);
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [preview, setPreview] = useState<{ content: string; filename: string } | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [forceEnded, setForceEnded] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [materials, setMaterials] = useState<ContestMaterial[]>([]);
  const [section, setSection] = useState<MainSection>('upload');
  const [selectedFiles, setSelectedFiles] = useState<Record<number, File | null>>({});
  const [tick, setTick] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [activeProblemId, setActiveProblemId] = useState<number | null>(null);
  const [zipUploading, setZipUploading] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const cRes = await api.get(`/contests/${id}`);
      setContest(cRes.data);
      setMaterials(cRes.data.materials || []);
      const sData = await api.get(`/contests/${id}/my-submissions`);
      setSubmissions(sData.data.submissions || []);
      setPkgInfo(sData.data.package || null);
      const isEnded = cRes.data.status === 'ended';
      const isExpired = cRes.data.end_time && new Date(cRes.data.end_time) < new Date();
      const autoFinalized = sData.data.finalized || isEnded || isExpired;
      setFinalized(!!autoFinalized);
      setForceEnded(!!(isEnded || isExpired));

      const noticeKey = `contestEndedNotice:${id}`;
      if (isEnded && !sessionStorage.getItem(noticeKey)) {
        sessionStorage.setItem(noticeKey, '1');
        setMsg({
          type: 'ok',
          text: '比赛已由教师结束，已自动提交，无法再修改代码。',
        });
      }
    } catch (err) {
      console.error('加载比赛数据失败', err);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!id || !contest?.end_time) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [id, contest?.end_time]);

  useEffect(() => {
    if (!id) return;
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      loadData();
    };
    const iv = window.setInterval(poll, 30000);
    const onVis = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [id, loadData]);

  useEffect(() => {
    if (!confirmFinalize) return;
    setCountdown(20);
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [confirmFinalize]);

  const getSubmission = (problemId: number) => submissions.find(s => s.problem_id === problemId);

  const handleSelectClick = (problemId: number) => {
    if (finalized) return;
    setActiveProblemId(problemId);
    requestAnimationFrame(() => fileInputRef.current?.click());
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const pid = activeProblemId;
    e.target.value = '';
    if (!file || pid == null) return;
    setSelectedFiles(prev => ({ ...prev, [pid]: file }));
    setMsg({ type: 'ok', text: `已选择：${file.name}（题目 ${pid}，请点击「上传」）` });
  };

  const handleUploadProblem = async (problemId: number) => {
    const file = selectedFiles[problemId];
    if (!file || finalized) return;
    setUploading(u => ({ ...u, [problemId]: true }));
    setMsg(null);
    const form = new FormData();
    // 第三个参数显式指定 multipart 中的 filename，服务端只读该部件，不再依赖额外文本字段
    form.append('file', file, file.name);
    try {
      await api.post(`/contests/${id}/problems/${problemId}/upload`, form);
      setMsg({ type: 'ok', text: `上传成功：${file.name}` });
      setSelectedFiles(prev => ({ ...prev, [problemId]: null }));
      await loadData();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '上传失败' });
    } finally {
      setUploading(u => ({ ...u, [problemId]: false }));
    }
  };

  const handleZipSelectClick = () => {
    if (finalized || forceEnded || zipUploading) return;
    zipInputRef.current?.click();
  };

  const handleZipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !id) return;
    if (!/\.zip$/i.test(file.name)) {
      setMsg({ type: 'err', text: '请选择 .zip 压缩包' });
      return;
    }
    setZipUploading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const { data } = await api.post(`/contests/${id}/upload-zip`, form);
      setMsg({
        type: 'ok',
        text: `总压缩包上传成功：${data.filename || file.name}`,
      });
      await loadData();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '压缩包上传失败' });
    } finally {
      setZipUploading(false);
    }
  };

  const handlePreview = async (submissionId: number) => {
    try {
      const res = await api.get(`/preview/${submissionId}`);
      setPreview(res.data);
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '预览失败' });
    }
  };

  const handleFinalize = async () => {
    try {
      await api.post(`/contests/${id}/finalize`);
      setFinalized(true);
      setConfirmFinalize(false);
      setMsg({ type: 'ok', text: '已成功提交比赛！' });
      await loadData();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '提交失败' });
    }
  };

  if (!contest) return <div className="p-8 text-gray-400">加载中...</div>;

  const uploadedCount = contest.problems?.filter((p: Problem) => getSubmission(p.id)).length || 0;
  const totalCount = contest.problems?.length || 0;

  const endMs = contest.end_time ? new Date(contest.end_time).getTime() - Date.now() : null;
  void tick;
  const countdownLabel =
    contest.status === 'ended'
      ? '比赛已结束'
      : endMs == null
        ? '未设置截止'
        : formatCountdown(endMs);

  const navItem = (key: MainSection, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setSection(key)}
      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
        section === key
          ? 'bg-orange-50 text-orange-800 font-medium border-l-4 border-orange-500 -ml-0.5 pl-2.5'
          : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col lg:flex-row bg-gray-50">
      <aside className="lg:w-56 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white p-4 flex flex-col gap-4">
        <button type="button" onClick={() => nav(-1)} className="btn btn-secondary py-1.5 text-xs w-full justify-center">
          <ChevronLeft size={14} /> 返回
        </button>
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-center">
          <div className="text-lg font-mono font-bold text-orange-600 tabular-nums">{countdownLabel}</div>
          <div className="text-xs text-gray-500 mt-1 truncate" title={user?.real_name || ''}>
            {user?.real_name || '学生'}
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {navItem('notice', '考生须知', <Megaphone size={18} className="shrink-0 text-gray-500" />)}
          {navItem('materials', '试题下载', <FolderArchive size={18} className="shrink-0 text-gray-500" />)}
          {navItem('upload', '代码上传', <Upload size={18} className="shrink-0 text-gray-500" />)}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 p-4 lg:p-8 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {section === 'notice' && '考生须知'}
            {section === 'materials' && '试题下载'}
            {section === 'upload' && '代码上传'}
          </h1>
          {section === 'notice' && (
            <div className="card mt-4 space-y-3 text-sm text-gray-700">
              <p>
                <span className="font-semibold">{contest.name}</span>
                <span className="text-gray-400 font-mono ml-2">({contest.code})</span>
              </p>
              <p>开始时间：{formatContestTime(contest.start_time)}</p>
              <p>结束时间：{formatContestTime(contest.end_time)}</p>
              {contest.description ? (
                <div className="pt-2 border-t border-gray-100 whitespace-pre-wrap">{contest.description}</div>
              ) : (
                <p className="text-gray-400">暂无补充说明</p>
              )}
            </div>
          )}

          {section === 'materials' && (
            <div className="card mt-4">
              {materials.length === 0 ? (
                <p className="text-sm text-gray-400">暂无比赛资料</p>
              ) : (
                <ul className="space-y-2">
                  {materials.map(m => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 text-sm border border-gray-100 rounded-lg px-3 py-2"
                    >
                      <span className="font-mono truncate">{m.original_name}</span>
                      <span className="text-gray-400 shrink-0">{formatFileSize(m.file_size)}</span>
                      <button
                        type="button"
                        className="btn btn-secondary py-1 text-xs shrink-0"
                        onClick={() => window.open(`/api/contests/${id}/materials/${m.id}/download`, '_blank')}
                      >
                        <Download size={12} /> 下载
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {section === 'upload' && (
            <>
              <div className="mt-3 space-y-1 text-sm text-orange-600 flex flex-col gap-1">
                <p className="flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  每次仅上传一个文件；建议使用.cpp扩展名；上传后可在表格中查看文件名与大小。
                </p>
                <p className="flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  操作步骤：先点击「选择」选中文件，再点击「上传」完成本题上传。
                </p>
              </div>

              {msg && (
                <div
                  className={`mt-4 px-4 py-3 rounded-lg flex items-center gap-2 text-sm ${
                    msg.type === 'ok'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-600 border border-red-200'
                  }`}
                >
                  {msg.type === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {msg.text}
                  <button type="button" onClick={() => setMsg(null)} className="ml-auto">
                    <X size={14} />
                  </button>
                </div>
              )}

              {forceEnded && (
                <div className="mt-4 bg-red-50 border-2 border-red-300 rounded-lg px-4 py-3 text-red-700 text-sm flex items-center gap-2">
                  <Lock size={16} />
                  比赛已结束，无法再修改代码文件。
                </div>
              )}
              {!forceEnded && finalized && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-700 text-sm flex items-center gap-2">
                  <Lock size={16} />
                  您已完成提交，无法再修改代码文件。
                </div>
              )}

              <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2.5 w-12">序号</th>
                      <th className="px-3 py-2.5 min-w-[140px]">试题名称</th>
                      <th className="px-3 py-2.5 w-24">上传状态</th>
                      <th className="px-3 py-2.5 min-w-[120px]">上传文件名</th>
                      <th className="px-3 py-2.5 w-24">大小</th>
                      <th className="px-3 py-2.5 min-w-[140px]">上传时间</th>
                      <th className="px-3 py-2.5 text-right min-w-[200px]">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contest.problems?.map((p: Problem, idx: number) => {
                      const sub = getSubmission(p.id);
                      const isUploading = uploading[p.id];
                      const pending = selectedFiles[p.id];
                      const locked = finalized || forceEnded;
                      return (
                        <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/80">
                          <td className="px-3 py-3 text-gray-500">{idx + 1}</td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-gray-800">{p.title}</div>
                            <div className="text-xs text-gray-400 font-mono mt-0.5">{p.code}</div>
                          </td>
                          <td className="px-3 py-3">
                            {sub ? (
                              <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                                <CheckCircle size={12} /> 已上传
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">未上传</span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-gray-700 break-all">
                            {sub ? sub.original_name : pending ? pending.name : '—'}
                          </td>
                          <td className="px-3 py-3 text-gray-600 tabular-nums">
                            {sub ? formatFileSize(sub.file_size) : pending ? formatFileSize(pending.size) : '—'}
                          </td>
                          <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">
                            {sub ? new Date(sub.submitted_at).toLocaleString('zh-CN') : '—'}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {sub && (
                                <button
                                  type="button"
                                  className="btn btn-secondary py-1 px-2 text-xs"
                                  onClick={() => handlePreview(sub.id)}
                                >
                                  <Eye size={12} /> 查看
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-secondary py-1 px-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={locked || isUploading}
                                onClick={() => handleSelectClick(p.id)}
                              >
                                <Upload size={12} /> 选择
                              </button>
                              <button
                                type="button"
                                className={`btn py-1 px-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed ${
                                  pending && !locked && !isUploading ? 'btn-primary' : 'btn-secondary'
                                }`}
                                disabled={locked || isUploading || !pending}
                                onClick={() => handleUploadProblem(p.id)}
                              >
                                <Upload size={12} /> 上传
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(!contest.problems || contest.problems.length === 0) && (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    <FileCode className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    暂无题目
                  </div>
                )}
              </div>

              {contest.problems?.length > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 px-4 py-3">
                  <div className="text-sm text-gray-600 min-w-0">
                    <p className="font-medium text-gray-800">总压缩包上传</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      将姓名或准考证号文件夹打包压缩后上传
                    </p>
                    {pkgInfo && (
                      <p className="text-xs text-green-700 mt-1 font-mono break-all">
                        已上传：{pkgInfo.original_name}（{formatFileSize(pkgInfo.file_size)}）
                        · {new Date(pkgInfo.submitted_at).toLocaleString('zh-CN')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={finalized || forceEnded || zipUploading}
                    onClick={handleZipSelectClick}
                  >
                    <FolderArchive size={15} />
                    {zipUploading ? '上传中…' : pkgInfo ? '重新上传压缩包' : '上传压缩包'}
                  </button>
                </div>
              )}

              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  className="btn btn-lg px-6 justify-center text-center bg-gray-700 hover:bg-gray-800 text-white border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={finalized || forceEnded}
                  onClick={() => setConfirmFinalize(true)}
                >
                  <CheckCircle size={18} className="mr-2" />
                  确认提交代码
                </button>
              </div>

              <p className="text-center text-xs text-gray-400 mt-2">
                已上传 {uploadedCount} / {totalCount} 题
              </p>
            </>
          )}
        </div>
      </main>

      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleZipFileChange}
      />

      {confirmFinalize && (
        <div className="modal-overlay" onClick={() => setConfirmFinalize(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 text-red-600">确定要完成提交吗？</h2>
            <div className="bg-red-50 border-2 border-red-300 rounded-lg px-4 py-3 text-red-700 text-sm mb-4 font-medium">
              <p className="font-bold text-red-800 mb-1">提交后无法撤回，无法再次上传！</p>
              <p>• 提交后不能再修改代码文件</p>
              <p>• 提交后不能再重新上传</p>
              <p>• 请务必确认所有题目代码已上传完毕</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-700 text-sm mb-6">
              当前已上传 <strong className="text-amber-900">{uploadedCount}</strong> / {totalCount} 道题目
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmFinalize(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn bg-red-600 hover:bg-red-700 text-white border-red-600"
                onClick={handleFinalize}
                disabled={countdown > 0}
                title={countdown > 0 ? `请等待 ${countdown} 秒` : ''}
              >
                {countdown > 0 ? `确认提交（${countdown}秒）` : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <CodeMirrorEditor content={preview.content} filename={preview.filename} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
