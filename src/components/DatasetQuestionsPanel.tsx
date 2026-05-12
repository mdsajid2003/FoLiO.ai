import { useState, CSSProperties } from 'react';
import type { DatasetQuestion } from '../types';

interface Props {
  questions: DatasetQuestion[];
}

const IMPORTANCE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' },
  high:     { bg: '#fffbeb', text: '#92400e', border: '#fcd34d' },
  medium:   { bg: '#eff6ff', text: '#1e40af', border: '#93c5fd' },
};

const C: Record<string, CSSProperties> = {
  wrap:    { background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: '16px 18px', marginBottom: 14 },
  heading: { fontSize: 13, fontWeight: 700, color: '#1a1a14', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 },
  sub:     { fontSize: 11, color: '#6b6b5e', marginBottom: 14, lineHeight: 1.5 },
  qWrap:   { marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #f0ede4' },
  qTitle:  { fontSize: 12, fontWeight: 600, color: '#1a1a14', marginBottom: 4, lineHeight: 1.4 },
  context: { fontSize: 11, color: '#6b6b5e', marginBottom: 8, lineHeight: 1.5, fontStyle: 'italic' },
  optRow:  { display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginTop: 4 },
  optBtn:  { fontSize: 11, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', border: '1px solid #d0cdc4', background: '#f5f2eb', color: '#3a3a2e', transition: 'all 0.15s' },
  optSel:  { fontSize: 11, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', border: '1px solid #2d5a27', background: '#f0fdf4', color: '#166534', fontWeight: 600 },
  badge:   { display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginLeft: 6 },
  reason:  { fontSize: 10, color: '#9a9a8e', marginTop: 6, fontFamily: 'monospace' },
};

export function DatasetQuestionsPanel({ questions }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(true);

  if (!questions || questions.length === 0) return null;

  const answeredCount = Object.keys(answers).length;

  function pick(id: string, option: string) {
    setAnswers(prev => ({ ...prev, [id]: option }));
  }

  return (
    <div style={C.wrap}>
      <div style={C.heading}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2d5a27" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        Confirm data context for better accuracy
        <span style={{ ...C.badge, background: '#e0fce8', color: '#166534', border: '1px solid #86efac' }}>
          {answeredCount}/{questions.length} answered
        </span>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginLeft: 'auto', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: '#9a9a8e' }}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      <div style={C.sub}>
        FoLiOAI detected gaps in your data. Confirming these helps avoid incorrect GST/TCS/fee calculations.
        Your answers are stored locally and not sent to any server.
      </div>

      {expanded && (
        <div>
          {questions.map((q, idx) => {
            const color = IMPORTANCE_COLOR[q.importance];
            const isLast = idx === questions.length - 1;
            return (
              <div key={q.id} style={{ ...C.qWrap, ...(isLast ? { borderBottom: 'none', marginBottom: 0, paddingBottom: 0 } : {}) }}>
                <div style={C.qTitle}>
                  {q.question}
                  <span style={{ ...C.badge, background: color.bg, color: color.text, border: `1px solid ${color.border}` }}>
                    {q.importance}
                  </span>
                </div>
                <div style={C.context}>{q.context}</div>
                <div style={C.optRow}>
                  {q.options.map(opt => (
                    <button
                      key={opt}
                      style={answers[q.id] === opt ? C.optSel : C.optBtn}
                      onClick={() => pick(q.id, opt)}
                    >
                      {answers[q.id] === opt ? '✓ ' : ''}{opt}
                    </button>
                  ))}
                </div>
                <div style={C.reason}>Detected: {q.detectedReason}</div>
              </div>
            );
          })}

          {answeredCount > 0 && answeredCount < questions.length && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#9a9a8e' }}>
              {questions.length - answeredCount} question(s) remaining — answers help improve report accuracy.
            </div>
          )}
          {answeredCount === questions.length && (
            <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: '#166534', background: '#f0fdf4', borderRadius: 6, padding: '6px 10px' }}>
              All questions answered. Your report calculations will use this context when you re-upload or request a re-analysis.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
