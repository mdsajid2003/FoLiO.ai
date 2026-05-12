import { useEffect } from 'react';

interface Props {
  onGetStarted: () => void;
  onTryDemo: () => void;
}

export function LandingPage({ onGetStarted, onTryDemo }: Props) {
  useEffect(() => {
    document.title = 'FoLiOAI — Seller Finance Intelligence';
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: '#f5f2eb',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      color: '#0e0e0c',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .land-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 32px;
          border-bottom: 1px solid rgba(14,14,12,0.1);
          background: #f5f2eb;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .land-brand {
          font-family: 'Instrument Serif', serif;
          font-size: 22px;
          color: #0e0e0c;
          letter-spacing: -0.3px;
        }
        .land-brand span { color: #1a5c3a; font-style: italic; }
        .land-nav-actions { display: flex; gap: 10px; align-items: center; }
        .land-btn {
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
          padding: 10px 20px;
          transition: all 0.15s;
        }
        .land-btn-ghost {
          background: transparent;
          color: #0e0e0c;
          border: 1px solid rgba(14,14,12,0.2);
        }
        .land-btn-ghost:hover { border-color: #0e0e0c; }
        .land-btn-primary {
          background: #0e0e0c;
          color: #f5f2eb;
          border: none;
        }
        .land-btn-primary:hover { background: #1a5c3a; }
        .land-btn-lg {
          font-size: 16px;
          padding: 14px 32px;
          border-radius: 10px;
        }
        .land-hero {
          max-width: 760px;
          margin: 0 auto;
          padding: 96px 32px 80px;
          text-align: center;
        }
        .land-badge {
          display: inline-block;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #1a5c3a;
          background: rgba(26,92,58,0.08);
          border-radius: 100px;
          padding: 5px 14px;
          margin-bottom: 28px;
        }
        .land-h1 {
          font-family: 'Instrument Serif', serif;
          font-size: clamp(36px, 6vw, 60px);
          line-height: 1.1;
          letter-spacing: -0.02em;
          color: #0e0e0c;
          margin-bottom: 24px;
        }
        .land-h1 em { color: #1a5c3a; font-style: italic; }
        .land-sub {
          font-size: 18px;
          line-height: 1.6;
          color: rgba(14,14,12,0.6);
          max-width: 560px;
          margin: 0 auto 40px;
        }
        .land-ctas { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .land-stats {
          display: flex;
          justify-content: center;
          gap: 48px;
          flex-wrap: wrap;
          padding: 48px 32px;
          border-top: 1px solid rgba(14,14,12,0.08);
          border-bottom: 1px solid rgba(14,14,12,0.08);
          background: rgba(14,14,12,0.02);
        }
        .land-stat-val {
          font-family: 'Instrument Serif', serif;
          font-size: 36px;
          color: #1a5c3a;
        }
        .land-stat-label {
          font-size: 13px;
          color: rgba(14,14,12,0.55);
          margin-top: 4px;
        }
        .land-features {
          max-width: 960px;
          margin: 0 auto;
          padding: 80px 32px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 24px;
        }
        .land-card {
          background: #fff;
          border: 1px solid rgba(14,14,12,0.08);
          border-radius: 16px;
          padding: 28px;
        }
        .land-card-icon {
          font-size: 28px;
          margin-bottom: 14px;
        }
        .land-card-title {
          font-family: 'Instrument Serif', serif;
          font-size: 20px;
          margin-bottom: 8px;
        }
        .land-card-desc {
          font-size: 14px;
          line-height: 1.6;
          color: rgba(14,14,12,0.6);
        }
        .land-cta-section {
          text-align: center;
          padding: 80px 32px;
          background: #0e0e0c;
          color: #f5f2eb;
        }
        .land-cta-h2 {
          font-family: 'Instrument Serif', serif;
          font-size: clamp(28px, 4vw, 44px);
          margin-bottom: 16px;
        }
        .land-cta-sub {
          font-size: 16px;
          color: rgba(245,242,235,0.6);
          margin-bottom: 36px;
        }
        .land-footer {
          text-align: center;
          padding: 24px 32px;
          font-size: 12px;
          color: rgba(14,14,12,0.4);
          border-top: 1px solid rgba(14,14,12,0.08);
        }
        .land-footer a { color: rgba(14,14,12,0.5); text-decoration: none; }
        .land-footer a:hover { color: #1a5c3a; }
      `}</style>

      {/* Nav */}
      <nav className="land-nav">
        <div className="land-brand">FoLiO<span>AI</span></div>
        <div className="land-nav-actions">
          <button type="button" className="land-btn land-btn-ghost" onClick={onTryDemo}>Try free</button>
          <button type="button" className="land-btn land-btn-primary" onClick={onGetStarted}>Start</button>
        </div>
      </nav>

      {/* Hero */}
      <section className="land-hero">
        <div className="land-badge">Amazon & Flipkart Sellers</div>
        <h1 className="land-h1">
          Stop losing money to<br /><em>hidden fee leakage</em>
        </h1>
        <p className="land-sub">
          Upload your settlement report and get an instant breakdown of revenue, recoverable leakage, GST mismatches, TCS/TDS — all computed deterministically from your raw data.
        </p>
        <div className="land-ctas">
          <button type="button" className="land-btn land-btn-primary land-btn-lg" onClick={onGetStarted}>
            Analyse my report →
          </button>
          <button type="button" className="land-btn land-btn-ghost land-btn-lg" onClick={onTryDemo}>
            Try with demo data
          </button>
        </div>
      </section>

      {/* Stats */}
      <div className="land-stats">
        {[
          { val: '₹0', label: 'Cost to get started' },
          { val: '5 types', label: 'Leakage categories detected' },
          { val: '100%', label: 'Deterministic — no AI guessing' },
          { val: 'GST + TCS + TDS', label: 'Full tax summary included' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div className="land-stat-val">{s.val}</div>
            <div className="land-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div className="land-features">
        {[
          { icon: '🔍', title: 'Leakage Detection', desc: 'Automatically flags weight slab errors, duplicate charges, missing TCS credits, and more across every order row.' },
          { icon: '📊', title: 'GST Reconciliation', desc: 'Matches your settlement GST against GSTR-1 / GSTR-3B expectations and flags mismatches with exact row references.' },
          { icon: '💰', title: 'TCS & TDS Recovery', desc: 'Computes exactly how much TCS (Sec 52) and TDS (Sec 194-O) you can claim back in your returns.' },
          { icon: '📈', title: 'SKU Profitability', desc: 'See net profit per SKU after all fees, returns, and COGS — ranked so you know which products to double down on.' },
          { icon: '🧾', title: 'Income Tax Estimate', desc: 'FY 2025-26 new regime tax estimate with advance tax schedule and recommended ITR form.' },
          { icon: '🤖', title: 'AI Narrative', desc: 'Plain-English summary of your report — written by AI but grounded entirely in your actual numbers.' },
        ].map(f => (
          <div className="land-card" key={f.title}>
            <div className="land-card-icon">{f.icon}</div>
            <div className="land-card-title">{f.title}</div>
            <div className="land-card-desc">{f.desc}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <section className="land-cta-section">
        <h2 className="land-cta-h2">Ready to recover what's yours?</h2>
        <p className="land-cta-sub">Upload your Amazon or Flipkart settlement CSV — results in under 30 seconds.</p>
        <button type="button" className="land-btn land-btn-lg" style={{ background: '#1a5c3a', color: '#f5f2eb', border: 'none', cursor: 'pointer' }} onClick={onGetStarted}>
          Get started free →
        </button>
      </section>

      {/* Footer */}
      <footer className="land-footer">
        <p>Financial figures are informational only — not CA advice. &nbsp;·&nbsp; <a href="/terms">Terms</a> &nbsp;·&nbsp; <a href="/privacy">Privacy</a></p>
      </footer>
    </div>
  );
}