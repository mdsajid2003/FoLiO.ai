import { useEffect } from 'react';

interface Props {
  onGetStarted: () => void;
  onTryDemo: () => void;
}

const HOME_HTML = '/guardian_ai_landing_page.html';

/**
 * Marketing homepage: static HTML in /public; CTAs in the shell and inside the iframe post to the parent.
 */
export function LandingPage({ onGetStarted, onTryDemo }: Props) {
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || d.source !== 'guardianai-landing') return;
      if (d.kind === 'try') onTryDemo();
      else if (d.kind === 'start') onGetStarted();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onGetStarted, onTryDemo]);

  return (
    <div
      className="landing-html-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
        background: '#f5f2eb',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600&display=swap');
        .landing-html-bar {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 20px;
          border-bottom: 1px solid rgba(14, 14, 12, 0.12);
          background: #f5f2eb;
          z-index: 2;
        }
        .landing-html-brand {
          font-family: 'Instrument Serif', serif;
          font-size: 20px;
          color: #0e0e0c;
          letter-spacing: -0.3px;
        }
        .landing-html-brand span {
          color: #1a5c3a;
          font-style: italic;
        }
        .landing-html-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .landing-html-btn {
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
          padding: 10px 18px;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .landing-html-btn-ghost {
          background: transparent;
          color: #0e0e0c;
          border: 1px solid rgba(14, 14, 12, 0.18);
        }
        .landing-html-btn-ghost:hover {
          border-color: #0e0e0c;
        }
        .landing-html-btn-primary {
          background: #0e0e0c;
          color: #f5f2eb;
          border: none;
        }
        .landing-html-btn-primary:hover {
          background: #1a5c3a;
        }
        .landing-html-frame-wrap {
          flex: 1;
          min-height: 0;
          position: relative;
          background: #e8e5dc;
        }
        .landing-html-frame {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: none;
        }
      `}</style>

      <header className="landing-html-bar">
        <div className="landing-html-brand">
          Guardian<span>AI</span>
        </div>
        <div className="landing-html-actions">
          <button type="button" className="landing-html-btn landing-html-btn-ghost" onClick={onTryDemo}>
            Try free
          </button>
          <button type="button" className="landing-html-btn landing-html-btn-primary" onClick={onGetStarted}>
            Start
          </button>
        </div>
      </header>

      <div className="landing-html-frame-wrap">
        <iframe className="landing-html-frame" title="Guardian AI — home" src={HOME_HTML} />
      </div>
    </div>
  );
}
