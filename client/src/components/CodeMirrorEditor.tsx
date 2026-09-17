import React, { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, drawSelection, rectangularSelection, crosshairCursor, dropCursor } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

// 自定义亮色主题
const lightTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: '#ffffff',
    color: '#333333'
  },
  '.cm-content': {
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", "Courier New", monospace',
    fontSize: '13px',
    lineHeight: '1.6'
  },
  '.cm-gutters': {
    backgroundColor: '#f5f5f5',
    color: '#666666',
    border: 'none'
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#e8e8e8'
  },
  '.cm-activeLine': {
    backgroundColor: '#f0f0f0'
  },
  '.cm-cursor': {
    borderLeftColor: '#333333'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#b3d9ff'
  },
  '.cm-searchMatch': {
    backgroundColor: '#ffeb3b',
    outline: '1px solid #ffc107'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: '#ffc107'
  }
});

function getLanguage(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, any> = {
    py: python,
    c: cpp,
    cpp: cpp,
    cxx: cpp,
    h: cpp,
    java: java,
    js: javascript,
    ts: javascript,
    jsx: javascript,
    tsx: javascript,
  };
  return map[ext] || null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

interface CodeMirrorEditorProps {
  content: string;
  filename: string;
  onClose: () => void;
}

export default function CodeMirrorEditor({ content, filename, onClose }: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const defaultSize = useCallback(() => {
    const w = Math.min(900, Math.floor(window.innerWidth * 0.88));
    const h = Math.min(640, Math.floor(window.innerHeight * 0.72));
    return { w, h };
  }, []);

  useLayoutEffect(() => {
    const el = shellRef.current;
    const { w, h } = defaultSize();
    if (el) {
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
    setPos({
      x: clamp((window.innerWidth - w) / 2, 12, window.innerWidth - 120),
      y: clamp((window.innerHeight - h) / 2, 12, window.innerHeight - 80),
    });
  }, [content, filename, defaultSize]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!editorRef.current) return;

    const language = getLanguage(filename);
    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      keymap.of(defaultKeymap),
      theme === 'dark' ? oneDark : lightTheme,
      syntaxHighlighting(defaultHighlightStyle),
      language ? language() : [],
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          // 这里可以添加保存逻辑
        }
      }),
    ];

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    const ro = new ResizeObserver(() => {
      view.requestMeasure();
    });
    ro.observe(editorRef.current);

    return () => {
      ro.disconnect();
      view.destroy();
    };
  }, [content, filename, theme]);

  /** 窗口尺寸变化时把弹窗拉回视口内 */
  useEffect(() => {
    const onResize = () => {
      const el = shellRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setPos(p => ({
        x: clamp(p.x, 12, Math.max(12, window.innerWidth - w + 48)),
        y: clamp(p.y, 12, Math.max(12, window.innerHeight - 80)),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const copyCode = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = pos.x;
    const origY = pos.y;

    const move = (ev: PointerEvent) => {
      const el = shellRef.current;
      const bw = el?.offsetWidth ?? 400;
      const bh = el?.offsetHeight ?? 300;
      const nx = origX + (ev.clientX - startX);
      const ny = origY + (ev.clientY - startY);
      setPos({
        x: clamp(nx, 12 - bw + 120, window.innerWidth - 80),
        y: clamp(ny, 0, window.innerHeight - 64),
      });
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* 半透明遮罩：不铺满纯黑，仅轻微压暗背后页面 */}
      <button
        type="button"
        aria-label="关闭预览"
        className="absolute inset-0 cursor-default border-0 p-0"
        style={{ background: 'rgba(55, 65, 81, 0.38)' }}
        onClick={onClose}
      />

      <div
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-label="代码预览"
        className="absolute z-[51] flex flex-col rounded-lg shadow-2xl border border-gray-600 bg-gray-900 text-gray-100 min-w-[280px] min-h-[200px] max-w-[min(95vw,1200px)] max-h-[min(92vh,900px)] overflow-hidden"
        style={{
          left: pos.x,
          top: pos.y,
          resize: 'both',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-700 bg-gray-800 px-3 py-2.5 cursor-grab active:cursor-grabbing select-none sm:px-4"
          onPointerDown={handleHeaderPointerDown}
        >
          <div className="min-w-0 flex-1 pr-2">
            <div className="truncate text-sm font-medium text-gray-100" title={filename}>
              {filename}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5 hidden sm:block">拖动标题栏移动 · 右下角拖动调整大小</div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`rounded px-2 py-1 text-xs border transition-colors ${
                  theme === 'dark'
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                深色
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`rounded px-2 py-1 text-xs border transition-colors ${
                  theme === 'light'
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                浅色
              </button>
            </div>

            <button
              type="button"
              onClick={copyCode}
              className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-600 transition-colors"
            >
              {copied ? '已复制' : '复制代码'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-600 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 relative">
          <div ref={editorRef} className="absolute inset-0" />
        </div>
      </div>
    </div>
  );
}
