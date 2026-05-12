/**
 * Razorpay client-side integration for FoLiOAI.
 *
 * Flow:
 *   1. Client calls createOrder() → server creates Razorpay order → returns order_id
 *   2. Client opens Razorpay checkout with the order_id
 *   3. On payment success, Razorpay calls onSuccess with payment details
 *   4. Client calls verifyPayment() → server verifies signature → upgrades plan
 *
 * Set RAZORPAY_KEY_ID in .env.local (client-visible) and
 * RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET on the server.
 */

export type RazorpayPlan = 'growth' | 'pro';

export interface RazorpayOrderResponse {
  orderId: string;       // Razorpay order ID (order_xxx)
  amount: number;        // in paise
  currency: string;      // INR
  planId: RazorpayPlan;
}

export interface RazorpaySuccessPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

// ── Plan config ───────────────────────────────────────────────────────────────
export const PLANS: Record<RazorpayPlan, { label: string; priceInr: number; features: string[] }> = {
  growth: {
    label: 'Growth',
    priceInr: 999,
    features: [
      'Unlimited reports',
      'Full GST audit',
      'SKU-level breakdown',
      'CSV export',
      'AI chat (50 messages/month)',
    ],
  },
  pro: {
    label: 'Pro',
    priceInr: 2999,
    features: [
      'Everything in Growth',
      'AI narrative reports',
      'PPT export',
      'Priority support',
      'Multi-platform (Amazon + Flipkart)',
    ],
  },
};

// ── Step 1: Create order on server ────────────────────────────────────────────
export async function createRazorpayOrder(
  planId: RazorpayPlan,
  idToken: string | null,
): Promise<RazorpayOrderResponse> {
  const res = await fetch('/api/payments/create-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `Failed to create order (${res.status})`);
  }
  return res.json();
}

// ── Step 2: Open Razorpay checkout ────────────────────────────────────────────
// Dynamically loads the Razorpay script so it's not bundled unnecessarily.
export function openRazorpayCheckout(
  order: RazorpayOrderResponse,
  userEmail: string,
  onSuccess: (payload: RazorpaySuccessPayload) => void,
  onFailure: (err: string) => void,
): void {
  const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
  if (!keyId) {
    onFailure('Razorpay key not configured. Set VITE_RAZORPAY_KEY_ID in .env.local.');
    return;
  }

  // Load Razorpay checkout script if not already loaded
  const existingScript = document.getElementById('razorpay-script');
  const doOpen = () => {
    const plan = PLANS[order.planId];
    // @ts-expect-error — Razorpay is injected globally by their script
    const rzp = new window.Razorpay({
      key: keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'FoLiOAI',
      description: `${plan.label} Plan — ₹${plan.priceInr}/month`,
      order_id: order.orderId,
      prefill: { email: userEmail },
      theme: { color: '#059669' },       // emerald-600 to match the app
      modal: { backdropclose: false },
      handler: onSuccess,
    });
    rzp.on('payment.failed', (response: { error: { description: string } }) => {
      onFailure(response.error?.description ?? 'Payment failed');
    });
    rzp.open();
  };

  if (existingScript) {
    doOpen();
  } else {
    const script = document.createElement('script');
    script.id = 'razorpay-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = doOpen;
    script.onerror = () => onFailure('Failed to load Razorpay checkout. Check your internet connection.');
    document.head.appendChild(script);
  }
}

// ── Step 3: Verify payment on server ─────────────────────────────────────────
export async function verifyRazorpayPayment(
  payload: RazorpaySuccessPayload,
  planId: RazorpayPlan,
  idToken: string | null,
): Promise<{ success: boolean; plan: RazorpayPlan }> {
  const res = await fetch('/api/payments/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ ...payload, planId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Verification failed' }));
    throw new Error(err.error ?? `Payment verification failed (${res.status})`);
  }
  return res.json();
}
