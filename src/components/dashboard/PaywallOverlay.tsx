import { ReactNode, useState } from 'react';
import { UpgradeModal } from '../auth/UpgradeModal.tsx';
import type { RazorpayPlan } from '../../lib/razorpay.ts';

interface Props {
  isPaid: boolean;
  teaser: string;
  feature: string;
  children: ReactNode;
  inline?: boolean;
  // Provided by App.tsx via profile
  userEmail?: string;
  currentPlan?: string;
  getIdToken?: () => Promise<string | null>;
  onUpgraded?: (plan: RazorpayPlan) => void;
}

export function PaywallOverlay({
  isPaid, teaser, feature, children, inline = false,
  userEmail = '', currentPlan = 'free', getIdToken, onUpgraded,
}: Props) {
  const [showModal, setShowModal] = useState(false);

  if (isPaid) return <>{children}</>;

  function handleUpgradeClick() {
    setShowModal(true);
  }

  const upgradeButton = (
    <button
      className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
      onClick={handleUpgradeClick}
    >
      Upgrade to Growth — ₹999/mo
    </button>
  );

  if (inline) {
    return (
      <>
        <div className="relative group">
          <div className="opacity-40 pointer-events-none">{children}</div>
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={handleUpgradeClick}
              className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg hover:border-emerald-300 hover:text-emerald-700 transition-colors"
            >
              🔒 Growth plan
            </button>
          </div>
        </div>
        {showModal && getIdToken && onUpgraded && (
          <UpgradeModal
            userEmail={userEmail}
            currentPlan={currentPlan}
            getIdToken={getIdToken}
            onUpgraded={(plan) => { onUpgraded(plan); setShowModal(false); }}
            onClose={() => setShowModal(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="relative rounded-xl overflow-hidden">
        <div className="pointer-events-none select-none" style={{ filter: 'blur(3px)', opacity: 0.6 }}>
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-white/50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 text-center max-w-xs mx-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-red-600 mb-1">{teaser}</p>
            <p className="text-xs text-slate-500 mb-4">
              Upgrade to Growth to unlock {feature}, full GST audit, SKU breakdown, and CSV export.
            </p>
            <div className="space-y-2">
              {upgradeButton}
              <p className="text-[10px] text-slate-400">Cancel anytime · Razorpay · INR billing</p>
            </div>
          </div>
        </div>
      </div>
      {showModal && getIdToken && onUpgraded && (
        <UpgradeModal
          userEmail={userEmail}
          currentPlan={currentPlan}
          getIdToken={getIdToken}
          onUpgraded={(plan) => { onUpgraded(plan); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
