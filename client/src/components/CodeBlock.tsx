import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    py: 'python', c: 'c', cpp: 'cpp', cxx: 'cpp', h: 'cpp',
    java: 'java', js: 'javascript', ts: 'typescript',
    jsx: 'jsx', tsx: 'tsx',
    txt: 'plaintext',
  };
  return map[ext] || 'plaintext';
}

interface Props {
  content: string;
  filename: string;
}

export default function CodeBlock({ content, filename }: Props) {
  const lang = getLanguage(filename);
  
  const BG = '#282a36';          // Dracula 背景色
  const GUTTER_BG = '#21222c';  // 行号栏背景
  const GUTTER_COLOR = '#6272a4'; // 行号颜色
  const GUTTER_BORDER = '#44475a'; // 分隔线

  return (
    <div style={{
      backgroundColor: BG,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
      fontSize: '13px',
      lineHeight: '1.6',
      overflow: 'auto',
      height: '100%',
      color: '#f8f8f2',
      border: '1px solid #44475a',
      borderRadius: '4px',
    }}>
      <SyntaxHighlighter
        language={lang}
        style={dracula}
        showLineNumbers={true}
        lineNumberStyle={{
          color: GUTTER_COLOR,
          backgroundColor: GUTTER_BG,
          paddingRight: '12px',
          paddingLeft: '8px',
          borderRight: `1px solid ${GUTTER_BORDER}`,
          fontSize: '12px',
          userSelect: 'none'
        }}
        customStyle={{
          margin: 0,
          padding: '0',
          backgroundColor: BG,
          borderRadius: '0'
        }}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  );
}
