import { useState, useRef, useEffect, useCallback } from 'react';
import { ReconciliationReport } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

interface Props {
  report: ReconciliationReport | null;
  getIdToken?: () => Promise<string | null>;
}

function buildWelcome(report: ReconciliationReport | null): string {
  return report
    ? `I've scanned your ${report.platform} settlement — ${report.rowCount} orders, ₹${Math.round(report.totalRevenue / 1000)}K revenue. You have ₹${report.recoverableLeakage.toLocaleString('en-IN')} in recoverable money and ₹${report.tcsClaimable.toLocaleString('en-IN')} in unclaimed TCS. Ask me how to get it back.`
    : 'Upload a settlement file to start recovering money.';
}

// Stable incrementing IDs that survive re-renders
let _msgSeq = 0;
const newId = () => `m${++_msgSeq}`;

export function AskAIPage({ report, getIdToken }: Props) {
  // Track welcome msg ID so we can exclude it from server history (#17)
  const welcomeIdRef = useRef(newId());
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: buildWelcome(report), id: welcomeIdRef.current },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // #12 — reset messages when a new report arrives
  useEffect(() => {
    const wid = newId();
    welcomeIdRef.current = wid;
    setMessages([{ role: 'assistant', content: buildWelcome(report), id: wid }]);
    setInput('');
  }, [report]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const suggested = report ? buildSuggestions(report) : ['Upload a file first'];

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading || !report) return;

    const userMsg: Message = { role: 'user', content: text, id: newId() };
    // Capture current messages snapshot for history BEFORE setState
    setMessages(prev => {
      // #17 — exclude the synthetic welcome message from server history
      const realHistory = prev
        .filter(m => m.id !== welcomeIdRef.current)
        .slice(-4)
        .map(({ role, content }) => ({ role, content }));

      // We need history outside setMessages; store it in a closure-captured variable
      // (this is fine — setMessages captures it synchronously before async dispatch)
      sendRequest(text, realHistory, userMsg, getIdToken);
      return [...prev, userMsg];
    });
    setInput('');
  }, [loading, report, getIdToken]); // getIdToken must be in deps — omitting it causes stale guest token after sign-in

  async function sendRequest(
    text: string,
    history: { role: string; content: string }[],
    userMsg: Message,
    getIdTokenFn?: () => Promise<string | null>,
  ) {
    setLoading(true);
    const token = getIdTokenFn ? await getIdTokenFn() : null;
    const authHeaders: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    const payload = {
      message: text,
      reportContext: {
        platform: report!.platform,
        totalRevenue: report!.totalRevenue,
        totalExpenses: report!.totalExpenses,
        netProfit: report!.netProfit,
        profitMarginPct: report!.salesAnalytics?.profitMarginPct ?? 0,
        recoverableLeakage: report!.recoverableLeakage,
        tcsCollected: report!.tcsCollected,
        tcsClaimable: report!.tcsClaimable,
        tdsDeducted: report!.tdsSummary?.totalTdsDeducted ?? 0,
        gstMismatchCount: report!.gstMismatchCount,
        gstNetLiability: report!.gstSummary?.netGstLiability ?? 0,
        avgOrderValue: report!.salesAnalytics?.avgOrderValue ?? 0,
        rowCount: report!.rowCount,
        leakageTypes: (report!.leakageBreakdown ?? []).map(l => `${l.type}(₹${l.amount})`).join(', '),
        estimatedTax: report!.incomeTaxEstimate?.netTaxPayable ?? 0,
        itrForm: report!.incomeTaxEstimate?.itrForm ?? 'N/A',
      },
      history,
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', ...authHeaders },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Chat request failed');
      }

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream') && res.body) {
        // Streaming: give the placeholder a stable ID to update in-place (#30)
        const streamId = newId();
        setMessages(prev => [...prev, { role: 'assistant', content: '', id: streamId }]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const chunk = line.slice(6).trim();
            if (chunk === '[DONE]') break;
            try {
              const { text: token } = JSON.parse(chunk) as { text: string };
              accumulated += token;
              // Update by stable ID, not by array position (#30)
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, content: accumulated } : m
              ));
            } catch { /* skip malformed SSE frame */ }
          }
        }
        if (!accumulated) {
          setMessages(prev => prev.map(m =>
            m.id === streamId ? { ...m, content: 'No response received.' } : m
          ));
        }
      } else {
        const data = await res.json() as { reply?: string; error?: string };
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply ?? data.error ?? 'No response received.',
          id: newId(),
        }]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: msg, id: newId() }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: '#3a3a2e', marginBottom: 16 }}>
        Ask about your recoverable money
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', display: 'flex', flexDirection: 'column', minHeight: 420 }}>
        {/* Messages — key by stable id, not index (#30) */}
        <div style={{ flex: 1, padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: 400 }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                background: msg.role === 'user' ? '#2d5a27' : '#f5f2ea',
                color: msg.role === 'user' ? '#fff' : '#2a2a1e',
                fontSize: 13, lineHeight: 1.6,
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex' }}>
              <div style={{ padding: '10px 14px', background: '#f5f2ea', borderRadius: '10px 10px 10px 2px', display: 'flex', gap: 4 }}>
                {[0, 150, 300].map(delay => (
                  <span key={delay} style={{ width: 6, height: 6, borderRadius: '50%', background: '#9a9a8e', display: 'inline-block', animation: `bounce 1.2s ${delay}ms infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ height: 1, background: '#f0ede4', margin: '12px 0 0' }} />

        {/* Dynamic suggested questions */}
        {messages.length <= 2 && (
          <div style={{ padding: '10px 20px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {suggested.map(s => (
              <button key={s} onClick={() => send(s)}
                style={{ fontSize: 11.5, color: '#4a4a3e', background: '#f5f2ea', border: '1px solid #dbd8cf', borderRadius: 20, padding: '4px 12px', cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '10px 16px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            style={{ flex: 1, background: '#f5f2ea', border: '1px solid #dbd8cf', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#1a1a14', outline: 'none' }}
            placeholder="Ask about your data..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading || !report}
            style={{ background: '#1a1a14', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!input.trim() || loading) ? 0.4 : 1 }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function buildSuggestions(report: ReconciliationReport): string[] {
  const suggestions: string[] = [];

  if (report.recoverableLeakage > 0) {
    suggestions.push('How do I recover this money?');
  }
  if (report.tcsClaimable > 0) {
    suggestions.push('Steps to claim my TCS back');
  }
  if (report.gstMismatchCount > 0) {
    suggestions.push('Which GST issues need urgent fixing?');
  }
  if (report.tdsSummary && report.tdsSummary.totalTdsDeducted > 0) {
    suggestions.push('How to verify TDS in Form 26AS?');
  }
  if (report.incomeTaxEstimate) {
    suggestions.push('Am I paying too much income tax?');
  }

  if (suggestions.length < 3) {
    suggestions.push('Where am I losing the most money?');
  }

  return suggestions.slice(0, 4);
}
