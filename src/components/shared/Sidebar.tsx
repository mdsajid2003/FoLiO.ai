import { useState } from 'react';
import { UpgradeModal } from '../auth/UpgradeModal.tsx';
import type { RazorpayPlan } from '../../lib/razorpay.ts';
import type { CSSProperties, ReactNode } from 'react';
import { UserProfile } from '../../types';

export type AppPage = 'dashboard' | 'upload' | 'actions' | 'reconciliation' | 'analyse' | 'taxsummary' | 'askai' | 'export' | 'audit' | 'profitsim';

interface Props {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  onSignOut: () => void;
  onUpgrade?: () => void;
  onUpgradePlan?: (plan: import('../../types/index.ts').Plan) => void;
  getIdToken?: () => Promise<string | null>;
  profile: UserProfile | null;
  hasReport: boolean;
  issueCount?: number;
  recoveryActionCount?: number;
}

const s: Record<string, CSSProperties> = {
  sidebar: {
    width: 200, minWidth: 200, background: '#0e0e0c',
    display: 'flex', flexDirection: 'column', height: '100vh',
    position: 'fixed', left: 0, top: 0, zIndex: 40,
  },
  logo: { padding: '20px 16px 14px', borderBottom: '1px solid #1e1e1a' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' },
  logoIcon: {
    width: 28, height: 28, background: '#2d5a27', borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  logoText: { fontFamily: '"Georgia", serif', fontWeight: 700, fontSize: 15, color: '#ffffff', letterSpacing: '-0.3px' },
  logoSub: { fontSize: 10, color: '#5a5a50', marginTop: 3, letterSpacing: '0.2px' },
  nav: { flex: 1, padding: '12px 0', overflowY: 'auto' },
  section: {
    padding: '10px 16px 4px', fontSize: 9, fontWeight: 700, color: '#3a3a32',
    letterSpacing: '0.8px', textTransform: 'uppercase',
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 16px',
    cursor: 'pointer', fontSize: 12.5, color: '#7a7a6e', borderRadius: 0,
    position: 'relative', transition: 'background 0.15s, color 0.15s',
    userSelect: 'none', margin: '1px 0',
  },
  navItemActive: { color: '#ffffff', background: '#1a1a16' },
  navIcon: { width: 14, height: 14, flexShrink: 0 },
  badge: {
    marginLeft: 'auto', background: '#e53e3e', color: '#fff', fontSize: 9,
    fontWeight: 700, borderRadius: 8, padding: '1px 5px', minWidth: 16, textAlign: 'center',
  },
  bottom: { borderTop: '1px solid #1e1e1a', padding: '14px 16px' },
  userRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  avatar: {
    width: 26, height: 26, borderRadius: '50%', background: '#2d5a27',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  userName: { fontSize: 12, color: '#c8c8bc', fontWeight: 500 },
  planBox: { background: '#1a1a16', borderRadius: 8, padding: '8px 10px', marginBottom: 8 },
  planLabel: { fontSize: 11, color: '#7a7a6e', marginBottom: 2 },
  planValue: { fontSize: 12, color: '#c8c8bc', fontWeight: 600 },
  upgradeBtn: {
    width: '100%', background: '#2d5a27', color: '#fff', border: 'none',
    borderRadius: 7, padding: '8px 0', fontSize: 11.5, fontWeight: 600,
    cursor: 'pointer', textAlign: 'center', letterSpacing: '0.1px',
  },
};

function NavItem({ icon, label, page, current, onClick, badge, disabled }: {
  icon: ReactNode; label: string; page: AppPage; current: AppPage;
  onClick: (p: AppPage) => void; badge?: number; disabled?: boolean;
}) {
  const isActive = current === page;
  return (
    <div
      style={{ ...s.navItem, ...(isActive ? s.navItemActive : {}), opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer' }}
      onClick={() => !disabled && onClick(page)}
    >
      <span style={{ ...s.navIcon, color: isActive ? '#9dc88d' : '#4a4a42' }}>{icon}</span>
      <span>{label}</span>
      {badge !== undefined && badge > 0 && <span style={s.badge}>{badge}</span>}
    </div>
  );
}

export function Sidebar({ currentPage, onNavigate, onSignOut, onUpgrade, onUpgradePlan, getIdToken, profile, hasReport, issueCount = 0, recoveryActionCount = 0 }: Props) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const initials = profile?.email ? profile.email.slice(0, 2).toUpperCase() : 'RS';
  const displayName = profile?.email?.split('@')[0] ?? 'Rahul Sharma';

  return (
    <aside style={s.sidebar}>
      <div style={s.logo}>
        <div style={s.logoRow} onClick={() => onNavigate('dashboard')}>
          <div style={s.logoIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" strokeWidth="0"/>
            </svg>
          </div>
          <div><div style={s.logoText}>FoLiOAI</div></div>
        </div>
        <div style={s.logoSub}>Money recovery engine</div>
      </div>

      <nav style={s.nav}>
        <div style={s.section}>Overview</div>
        <NavItem icon={<DashboardIcon />} label="Dashboard" page="dashboard" current={currentPage} onClick={onNavigate} disabled={!hasReport} />
        <NavItem icon={<UploadIcon />} label="Upload" page="upload" current={currentPage} onClick={onNavigate} />
        <NavItem icon={<RecoveryIcon />} label="Recovery" page="actions" current={currentPage} onClick={onNavigate} badge={hasReport && recoveryActionCount > 0 ? recoveryActionCount : undefined} disabled={!hasReport} />

        <div style={{ ...s.section, marginTop: 8 }}>Analysis</div>
        <NavItem icon={<ReconIcon />} label="Reconciliation" page="reconciliation" current={currentPage} onClick={onNavigate} badge={hasReport ? issueCount : undefined} disabled={!hasReport} />
        <NavItem icon={<AnalyseIcon />} label="Analyse" page="analyse" current={currentPage} onClick={onNavigate} disabled={!hasReport} />
        <NavItem icon={<TaxIcon />} label="Tax Summary" page="taxsummary" current={currentPage} onClick={onNavigate} disabled={!hasReport} />
        <NavItem icon={<AuditIcon />} label="Audit" page="audit" current={currentPage} onClick={onNavigate} disabled={!hasReport} />
        <NavItem icon={<ProfitIcon />} label="Profit simulator" page="profitsim" current={currentPage} onClick={onNavigate} />
        <NavItem icon={<ChatIcon />} label="Ask AI" page="askai" current={currentPage} onClick={onNavigate} disabled={!hasReport} />

        <div style={{ ...s.section, marginTop: 8 }}>Export</div>
        <NavItem icon={<ExportIcon />} label="Export Reports" page="export" current={currentPage} onClick={onNavigate} disabled={!hasReport} />
      </nav>

      <div style={s.bottom}>
        <div style={s.userRow}>
          <div style={s.avatar}>{initials}</div>
          <span style={s.userName}>{displayName}</span>
        </div>
        <div style={s.planBox}>
          <div style={s.planLabel}>Plan</div>
          <div style={s.planValue}>{profile?.plan === 'growth' ? 'Growth' : profile?.plan === 'pro' ? 'Pro' : 'Free'}</div>
        </div>
        <button type="button" style={{ ...s.upgradeBtn, background: '#1a1a16', fontSize: 10.5, letterSpacing: '0.3px' }} onClick={() => setShowUpgradeModal(true)}>
          Early Access — Full Features
        </button>
        <button
          type="button"
          onClick={() => onSignOut()}
          style={{ width: '100%', marginTop: 8, background: 'transparent', color: '#7a7a6e', border: '1px solid #3a3a32', borderRadius: 7, padding: '7px 0', fontSize: 11, cursor: 'pointer' }}
        >
          Sign out
        </button>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'center' }}>
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: '#5a5a50', textDecoration: 'none' }}>Terms</a>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: '#5a5a50', textDecoration: 'none' }}>Privacy</a>
        </div>
      </div>

      {showUpgradeModal && onUpgradePlan && getIdToken && (
        <UpgradeModal
          userEmail={profile?.email ?? ''}
          currentPlan={profile?.plan ?? 'free'}
          getIdToken={getIdToken}
          onUpgraded={(plan: RazorpayPlan) => { onUpgradePlan(plan); setShowUpgradeModal(false); }}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}
    </aside>
  );
}

function DashboardIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>);
}
function UploadIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>);
}
function ReconIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l-4-4 4-4M15 10l4 4-4 4M11 6l2 12"/></svg>);
}
function AnalyseIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-8 4 4 4-12"/></svg>);
}
function TaxIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>);
}
function ChatIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>);
}
function ExportIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>);
}
function RecoveryIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>);
}
function AuditIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>);
}
function ProfitIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>);
}
