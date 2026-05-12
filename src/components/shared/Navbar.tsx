import { UserProfile } from '../../types';

type Page = 'upload' | 'dashboard';

interface Props {
  profile: UserProfile | null;
  onSignOut: () => void;
  onNavigate: (page: Page) => void;
  currentPage: Page;
  hasReport: boolean;
  onGoHome?: () => void;
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free:   { label: 'Free',   color: 'bg-slate-100 text-slate-600' },
  growth: { label: 'Growth', color: 'bg-emerald-100 text-emerald-700' },
  pro:    { label: 'Pro',    color: 'bg-violet-100 text-violet-700' },
};

export function Navbar({ profile, onSignOut, onNavigate, currentPage, hasReport, onGoHome }: Props) {
  const plan = PLAN_LABELS[profile?.plan ?? 'free'];

  return (
    <header className="bg-white border-b border-slate-200 px-4 h-14 flex items-center justify-between">
      {/* Logo */}
      <button onClick={onGoHome} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <span className="font-semibold text-slate-800 text-sm">FoLiOAI</span>
        <span className="text-slate-300 text-sm mx-1 hidden sm:block">|</span>
        <span className="text-slate-400 text-xs hidden sm:block">Money Recovery Engine</span>
      </button>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        <button
          onClick={() => onNavigate('upload')}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            currentPage === 'upload'
              ? 'bg-slate-100 text-slate-800 font-medium'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          Upload
        </button>
        {hasReport && (
          <button
            onClick={() => onNavigate('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              currentPage === 'dashboard'
                ? 'bg-slate-100 text-slate-800 font-medium'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            Dashboard
          </button>
        )}
      </nav>

      {/* User */}
      <div className="flex items-center gap-2.5">
        {profile && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${plan.color}`}>
            {plan.label}
          </span>
        )}
        <span className="text-xs text-slate-500 hidden sm:block truncate max-w-[140px]">
          {profile?.email}
        </span>
        <button
          onClick={onSignOut}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded-lg hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
