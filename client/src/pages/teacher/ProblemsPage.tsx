import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import { Plus, Trash2, Edit2, X, ChevronLeft, FileCode, Lock, AlertCircle, Wand2 } from 'lucide-react';

interface Problem {
  id: number;
  number: number;
  title: string;
  code: string;
  description?: string;
}

interface ParsedProblem {
  title: string;
  code: string;
  description?: string;
  raw: string;
  ok: boolean;
  error?: string;
}

/** 清洗英文名：只保留字母数字下划线 */
function sanitizeCode(s: string) {
  return String(s || '').replace(/[^a-zA-Z0-9_]/g, '');
}

function looksLikeCode(token: string) {
  const t = token.trim();
  if (!t) return false;
  // 纯英文标识，或含下划线的标识
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(t) || /^[A-Za-z0-9_]+$/.test(t) && /[A-Za-z_]/.test(t);
}

/**
 * 预处理粘贴文本，每行/每块解析为一题。
 * 支持：
 * - title\tcode / title,code / title|code
 * - 1 title code / A. title code
 * - title (code)
 * - 两行一块：第一行标题，第二行英文名（空行分隔）
 */
export function preprocessProblemPaste(text: string): ParsedProblem[] {
  const normalized = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
  const results: ParsedProblem[] = [];
  const usedCodes = new Set<string>();

  const pushItem = (title: string, codeRaw: string, raw: string) => {
    const titleClean = title.replace(/^[0-9]+[\.、:：\)]\s*/, '').replace(/^[A-Za-z][\.、:：\)]\s*/, '').trim();
    const code = sanitizeCode(codeRaw);
    if (!titleClean && !code) return;
    if (!titleClean) {
      results.push({ title: '', code, raw, ok: false, error: '缺少题目名称' });
      return;
    }
    if (!code) {
      results.push({ title: titleClean, code: '', raw, ok: false, error: '缺少英文名' });
      return;
    }
    if (usedCodes.has(code.toLowerCase())) {
      results.push({ title: titleClean, code, raw, ok: false, error: '英文名重复' });
      return;
    }
    usedCodes.add(code.toLowerCase());
    results.push({ title: titleClean, code, raw, ok: true });
  };

  // 优先：按空行分块（两行标题+英文名）
  const blocks = normalized.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const useBlocks = blocks.length > 1 || (blocks.length === 1 && blocks[0].split('\n').length === 2 && !/[\t|,|]/.test(blocks[0].split('\n')[0]));

  if (useBlocks && blocks.every(b => {
    const bl = b.split('\n').map(x => x.trim()).filter(Boolean);
    return bl.length >= 2 && looksLikeCode(bl[bl.length - 1].replace(/[()（）]/g, ''));
  })) {
    for (const block of blocks) {
      const bl = block.split('\n').map(x => x.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
      if (bl.length < 2) continue;
      const codeLine = bl[bl.length - 1].replace(/[()（）]/g, '').trim();
      const titleLine = bl.slice(0, -1).join(' ');
      pushItem(titleLine, codeLine, block);
    }
    return results;
  }

  for (const line of lines) {
    // title (code) / title（code）
    const paren = line.match(/^(.+?)\s*[\(（]\s*([A-Za-z0-9_]+)\s*[\)）]\s*$/);
    if (paren) {
      pushItem(paren[1], paren[2], line);
      continue;
    }

    // 分隔符：tab / | / ， / ,
    if (/[\t|,，]/.test(line)) {
      const parts = line.split(/[\t|,，]/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // 可能是 number, title, code
        if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
          pushItem(parts[1], parts[parts.length - 1], line);
        } else {
          pushItem(parts.slice(0, -1).join(' '), parts[parts.length - 1], line);
        }
        continue;
      }
    }

    // 空格分隔：末尾 token 像英文名
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2 && looksLikeCode(tokens[tokens.length - 1])) {
      let start = 0;
      if (/^\d+$/.test(tokens[0]) || /^[A-Za-z]$/.test(tokens[0])) start = 1;
      // A. title code
      if (/^[A-Za-z][\.、)]$/.test(tokens[0]) || /^\d+[\.、)]$/.test(tokens[0])) start = 1;
      const titleParts = tokens.slice(start, -1);
      if (!titleParts.length && start === 0) {
        // 只有两个词且都像 code：第一个当 title
        pushItem(tokens[0], tokens[tokens.length - 1], line);
      } else {
        pushItem(titleParts.join(' ') || tokens[0], tokens[tokens.length - 1], line);
      }
      continue;
    }

    results.push({ title: line, code: '', raw: line, ok: false, error: '无法识别英文名，请用「标题 英文名」或「标题\t英文名」' });
  }

  return results;
}

export default function TeacherProblemsPage() {
  const { contestId } = useParams();
  const nav = useNavigate();
  const [contest, setContest] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editTarget, setEditTarget] = useState<Problem | null>(null);
  const [form, setForm] = useState({ number: '', title: '', code: '', description: '' });
  const [bulkText, setBulkText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const load = async () => {
    const res = await api.get(`/contests/${contestId}`);
    setContest(res.data);
  };
  useEffect(() => { load(); }, [contestId]);

  useEffect(() => {
    if (!confirmEnd) return;
    setCountdown(10);
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(timer); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [confirmEnd]);

  const nextNumber = useMemo(() => {
    const list: Problem[] = contest?.problems || [];
    if (!list.length) return 1;
    return Math.max(...list.map(p => Number(p.number) || 0)) + 1;
  }, [contest]);

  const parsedBulk = useMemo(() => preprocessProblemPaste(bulkText), [bulkText]);
  const okBulk = parsedBulk.filter(p => p.ok);
  const badBulk = parsedBulk.filter(p => !p.ok);

  const handleEnd = async () => {
    try {
      await api.post(`/contests/${contestId}/end`);
      setConfirmEnd(false);
      setMsg({ type: 'ok', text: '比赛已结束，学生无法再提交' });
      load();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '操作失败' });
    }
  };

  const openAdd = () => {
    setShowAdd(true);
    setForm({ number: String(nextNumber), title: '', code: '', description: '' });
  };

  const handleAdd = async () => {
    if (!form.title) { setMsg({ type: 'err', text: '题目名称不能为空' }); return; }
    if (!form.code) { setMsg({ type: 'err', text: '题目英文名不能为空' }); return; }
    try {
      await api.post(`/contests/${contestId}/problems`, {
        title: form.title,
        code: form.code,
        description: form.description,
      });
      setMsg({ type: 'ok', text: '题目已添加' });
      setShowAdd(false);
      setForm({ number: '', title: '', code: '', description: '' });
      load();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '添加失败' });
    }
  };

  const handleBulkAdd = async () => {
    if (!okBulk.length) {
      setMsg({ type: 'err', text: '没有可添加的有效题目' });
      return;
    }
    setBulkSaving(true);
    try {
      const { data } = await api.post(`/contests/${contestId}/problems/bulk`, {
        problems: okBulk.map(p => ({ title: p.title, code: p.code })),
      });
      const n = data.created?.length || 0;
      const errN = data.errors?.length || 0;
      setMsg({
        type: errN ? 'err' : 'ok',
        text: errN
          ? `成功添加 ${n} 题，失败 ${errN} 题：${(data.errors || []).map((e: any) => e.error).join('；')}`
          : `已自动添加 ${n} 道题目`,
      });
      if (n > 0) {
        setShowBulk(false);
        setBulkText('');
        load();
      }
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '批量添加失败' });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      await api.put(`/contests/${contestId}/problems/${editTarget.id}`, form);
      setMsg({ type: 'ok', text: '已更新' });
      setEditTarget(null);
      load();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '更新失败' });
    }
  };

  const handleDelete = async (p: Problem) => {
    if (!confirm(`确认删除题目 ${p.number}：${p.title}？`)) return;
    try {
      await api.delete(`/contests/${contestId}/problems/${p.id}`);
      setMsg({ type: 'ok', text: '已删除' });
      load();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || '删除失败' });
    }
  };

  if (!contest) return <div className="p-8 text-gray-400">加载中...</div>;

  const isEnded = contest.status === 'ended';

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button type="button" onClick={() => nav('/teacher/contests')} className="btn btn-secondary py-1.5">
          <ChevronLeft size={16} /> 返回
        </button>
        <div className="flex-1 min-w-[160px]">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{contest.name} — 题目管理</h1>
            {isEnded && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">
                <Lock size={11} /> 已结束
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">代号：{contest.code}</p>
        </div>
        {!isEnded && (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowBulk(true); setBulkText(''); }}>
              <Wand2 size={15} /> 自动加题
            </button>
            <button type="button" className="btn btn-primary" onClick={openAdd}>
              <Plus size={15} /> 添加题目
            </button>
            <button type="button" className="btn bg-red-600 hover:bg-red-700 text-white border-red-600" onClick={() => setConfirmEnd(true)}>
              <Lock size={15} /> 结束比赛
            </button>
          </>
        )}
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg.text}
          <button type="button" onClick={() => setMsg(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {isEnded && (
        <div className="mb-4 bg-red-50 border-2 border-red-300 rounded-lg px-4 py-3 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          此比赛已结束，所有学生无法再提交代码。
        </div>
      )}

      <div className="space-y-3">
        {contest.problems?.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            <FileCode className="w-10 h-10 mx-auto mb-2 opacity-30" />
            暂无题目，可点击「自动加题」批量粘贴添加
          </div>
        ) : contest.problems?.map((p: Problem) => (
          <div key={p.id} className="card flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold flex-shrink-0">
              {p.number}
            </div>
            <div className="flex-1">
              <div className="font-medium">{p.code}</div>
              <div className="text-sm text-gray-400">{p.title}</div>
            </div>
            {!isEnded && (
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary py-1 text-xs" onClick={() => { setEditTarget(p); setForm({ number: String(p.number), title: p.title, code: p.code || '', description: p.description || '' }); }}>
                  <Edit2 size={13} /> 编辑
                </button>
                <button type="button" className="btn btn-danger py-1 text-xs" onClick={() => handleDelete(p)}>
                  <Trash2 size={13} /> 删除
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {(showAdd || editTarget) && (
        <div className="modal-overlay" onClick={() => { setShowAdd(false); setEditTarget(null); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{showAdd ? '添加题目' : '编辑题目'}</h2>
              <button type="button" onClick={() => { setShowAdd(false); setEditTarget(null); }}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">题号</label>
                <input className="input bg-gray-50" type="number" value={showAdd ? nextNumber : form.number} disabled />
                {showAdd && <p className="text-xs text-gray-400 mt-1">自动生成，无需填写</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">题目英文名 *</label>
                <input className="input font-mono" placeholder="如：add_two_numbers" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') }))} disabled={!!editTarget} />
                <p className="text-xs text-gray-400 mt-1">用于文件存储路径，只允许英文字母、数字和下划线，创建后不可修改</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">题目名称 *</label>
                <input className="input" placeholder="如：A+B Problem" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">题目描述</label>
                <textarea className="input resize-none" rows={3} placeholder="题目简介（可选）" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button type="button" className="btn btn-secondary" onClick={() => { setShowAdd(false); setEditTarget(null); }}>取消</button>
              <button type="button" className="btn btn-primary" onClick={showAdd ? handleAdd : handleEdit}>{showAdd ? '添加' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {showBulk && (
        <div className="modal-overlay" onClick={() => setShowBulk(false)}>
          <div className="modal-box max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">自动加题</h2>
              <button type="button" onClick={() => setShowBulk(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              粘贴题目信息后自动识别。题号从 <span className="font-semibold text-blue-600">{nextNumber}</span> 起连续编号。
            </p>
            <div className="text-xs text-gray-400 mb-2 space-y-0.5">
              <div>支持格式示例：</div>
              <pre className="bg-gray-50 rounded-lg p-2 font-mono text-[11px] text-gray-600 overflow-x-auto">{`A+B Problem\taplusb
最大公约数 gcd
两数之和 (two_sum)
1 排序 sort
标题
english_code`}</pre>
            </div>
            <textarea
              className="input resize-y font-mono text-sm min-h-[160px]"
              placeholder="在此粘贴题目名称与英文名…"
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
            />
            {parsedBulk.length > 0 && (
              <div className="mt-3 border border-gray-100 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                <table>
                  <thead>
                    <tr>
                      <th>预览题号</th>
                      <th>题目名称</th>
                      <th>英文名</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let previewNo = nextNumber;
                      return parsedBulk.map((p, i) => {
                        const no = p.ok ? previewNo++ : null;
                        return (
                          <tr key={`${p.raw}-${i}`}>
                            <td className="text-blue-600 font-medium">{no ?? '—'}</td>
                            <td>{p.title || '—'}</td>
                            <td className="font-mono text-xs">{p.code || '—'}</td>
                            <td>
                              {p.ok ? (
                                <span className="badge badge-green">可添加</span>
                              ) : (
                                <span className="text-xs text-red-500">{p.error}</span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
              <span className="text-xs text-gray-400">
                有效 {okBulk.length} 题{badBulk.length ? `，无法识别 ${badBulk.length} 行` : ''}
              </span>
              <div className="flex gap-3">
                <button type="button" className="btn btn-secondary" onClick={() => setShowBulk(false)}>取消</button>
                <button type="button" className="btn btn-primary" disabled={bulkSaving || !okBulk.length} onClick={handleBulkAdd}>
                  {bulkSaving ? '添加中…' : `确认添加 ${okBulk.length} 题`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmEnd && (
        <div className="modal-overlay" onClick={() => setConfirmEnd(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 text-red-600">⚠️ 确定要结束比赛吗？</h2>
            <div className="bg-red-50 border-2 border-red-300 rounded-lg px-4 py-3 text-red-700 text-sm mb-4 font-medium">
              <p className="font-bold text-red-800 mb-1">⚠️ 结束后所有学生将无法再提交代码！</p>
              <p>• 比赛结束后无法恢复</p>
              <p>• 所有学生强制锁定</p>
              <p>• 教师仍可查看学生提交情况</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmEnd(false)}>取消</button>
              <button
                type="button"
                className="btn bg-red-600 hover:bg-red-700 text-white border-red-600"
                onClick={handleEnd}
                disabled={countdown > 0}
                title={countdown > 0 ? `请等待 ${countdown} 秒` : ''}
              >
                {countdown > 0 ? `结束比赛（${countdown}秒）` : '结束比赛'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
