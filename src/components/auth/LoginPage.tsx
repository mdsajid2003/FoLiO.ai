interface Props {
  onSignIn: () => void;
}

export function LoginPage({ onSignIn }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-xl font-semibold text-slate-800">FoLiOAI</span>
          </div>
          <p className="text-slate-500 text-sm">Seller Finance Intelligence</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-800 mb-1">Sign in to your account</h1>
          <p className="text-sm text-slate-500 mb-6">
            Detect Amazon revenue leakage, reconcile GST, and recover what's yours.
          </p>

          <button
            onClick={onSignIn}
            className="w-full flex items-center justify-center gap-3 bg-emerald-600 rounded-xl px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            Get Started
          </button>

          <p className="text-xs text-slate-400 text-center mt-6">
            By signing in, you agree to our terms. Your data is stored securely and never sold.
          </p>
        </div>

        {/* Features */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '🔍', label: 'Leakage detection' },
            { icon: '📊', label: 'GST reconciliation' },
            { icon: '💰', label: 'TCS recovery' },
          ].map((f) => (
            <div key={f.label} className="bg-white rounded-xl border border-slate-100 p-3">
              <div className="text-lg mb-1">{f.icon}</div>
              <div className="text-xs text-slate-500">{f.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
