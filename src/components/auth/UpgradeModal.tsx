import { useState } from 'react';
import { PLANS, createRazorpayOrder, openRazorpayCheckout, verifyRazorpayPayment, type RazorpayPlan } from '../../lib/razorpay.ts';

interface Props {
  userEmail: string;
  currentPlan: string;
  getIdToken: () => Promise<string | null>;
  onUpgraded: (plan: RazorpayPlan) => void;
  onClose: () => void;
}

export function UpgradeModal({ userEmail, currentPlan, getIdToken, onUpgraded, onClose }: Props) {
  const [loading, setLoading] = useState<RazorpayPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade(planId: RazorpayPlan) {
    setLoading(planId);
    setError(null);

    try {
      const token = await getIdToken();
      const order = await createRazorpayOrder(planId, token);

      openRazorpayCheckout(
        order,
        userEmail,
        async (payload) => {
          try {
            await verifyRazorpayPayment(payload, planId, token);
            onUpgraded(planId);
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Verification failed. Contact support.');
          } finally {
            setLoading(null);
          }
        },
        (errMsg) => {
          setError(errMsg);
          setLoading(null);
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start payment. Please try again.');
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Upgrade your plan</h2>
            <p className="text-xs text-slate-500 mt-0.5">Current: <span className="capitalize font-medium">{currentPlan}</span></p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Plans */}
        <div className="p-6 grid grid-cols-2 gap-4">
          {(Object.entries(PLANS) as [RazorpayPlan, typeof PLANS.growth][]).map(([planId, plan]) => {
            const isCurrentPlan = currentPlan === planId;
            const isLoading = loading === planId;
            return (
              <div key={planId} className={`rounded-xl border p-4 flex flex-col ${planId === 'pro' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-slate-800">{plan.label}</span>
                  {planId === 'pro' && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Best value</span>
                  )}
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-3">
                  ₹{plan.priceInr.toLocaleString('en-IN')}
                  <span className="text-xs font-normal text-slate-400">/mo</span>
                </div>
                <ul className="space-y-1.5 mb-4 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                      <svg className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(planId)}
                  disabled={isCurrentPlan || !!loading}
                  className={`w-full py-2 rounded-xl text-sm font-medium transition-colors ${
                    isCurrentPlan
                      ? 'bg-slate-100 text-slate-400 cursor-default'
                      : planId === 'pro'
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-slate-800 text-white hover:bg-slate-900'
                  } disabled:opacity-60`}
                >
                  {isCurrentPlan ? 'Current plan' : isLoading ? 'Opening checkout…' : `Upgrade to ${plan.label}`}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mx-6 mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="px-6 pb-5 text-center text-[10px] text-slate-400">
          Payments processed by Razorpay · INR billing · Cancel anytime
        </div>
      </div>
    </div>
  );
}
