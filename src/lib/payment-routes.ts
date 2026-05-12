/**
 * Razorpay server-side payment routes.
 *
 * Mount in server.ts:
 *   import { mountPaymentRoutes } from './src/lib/payment-routes.ts';
 *   mountPaymentRoutes(app);
 *
 * Required env vars:
 *   RAZORPAY_KEY_ID      — from Razorpay dashboard
 *   RAZORPAY_KEY_SECRET  — from Razorpay dashboard (never expose to client)
 *   FIREBASE_PROJECT_ID  — for setting custom claims after payment
 *   GOOGLE_APPLICATION_CREDENTIALS — path to service account JSON (or use ADC)
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { logEvent } from './logger.ts';
import { requireAuth } from './auth-middleware.ts';

type Plan = 'growth' | 'pro';

const PLAN_AMOUNTS_PAISE: Record<Plan, number> = {
  growth: 99900,   // ₹999
  pro:    299900,  // ₹2,999
};

// ── Razorpay HTTP helpers ─────────────────────────────────────────────────────
function razorpayAuth(): string {
  const keyId     = process.env.RAZORPAY_KEY_ID ?? '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

async function razorpayPost(path: string, body: object): Promise<unknown> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: razorpayAuth(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Razorpay ${path} failed (${res.status}): ${errText}`);
  }
  return res.json();
}

// ── Set Firebase custom claim (plan) after payment ───────────────────────────
async function setFirebasePlanClaim(uid: string, plan: Plan): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId || !uid || uid === 'anonymous') return;

  try {
    const { getApps, initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');

    if (getApps().length === 0) {
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (credPath) {
        const { readFileSync } = await import('fs');
        const sa = JSON.parse(readFileSync(credPath, 'utf8'));
        initializeApp({ credential: cert(sa), projectId });
      } else {
        initializeApp({ credential: applicationDefault(), projectId });
      }
    }

    await getAuth().setCustomUserClaims(uid, { plan });

    // Write plan to Firestore so client can read it without waiting for token refresh
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();
      await db.doc(`users/${uid}`).set(
        { plan, planUpdatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (fsErr) {
      logEvent('warn', 'firestore_plan_write_failed', { uid, error: fsErr instanceof Error ? fsErr.message : String(fsErr) });
    }

    logEvent('info', 'firebase_plan_claim_set', { uid, plan });
  } catch (err) {
    // Non-fatal: the client already stores plan in localStorage as fallback
    logEvent('warn', 'firebase_plan_claim_failed', {
      uid,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Payment deduplication ─────────────────────────────────────────────────────
// In-memory cache for the current server session (fast path).
// On verify, we ALSO write to Firestore so deduplication survives restarts.
// This two-layer approach means: in-memory catches same-session replays instantly,
// Firestore catches cross-restart replays.
const seenPaymentIds = new Set<string>();

async function isPaymentAlreadyProcessed(paymentId: string): Promise<boolean> {
  // Fast path: in-memory
  if (seenPaymentIds.has(paymentId)) return true;

  // Slow path: Firestore check (catches post-restart replays)
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return false; // no Firestore configured — in-memory only
  try {
    const { getApps, initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (getApps().length === 0) {
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (credPath) {
        const { readFileSync } = await import('fs');
        const sa = JSON.parse(readFileSync(credPath, 'utf8'));
        initializeApp({ credential: cert(sa), projectId });
      } else {
        initializeApp({ credential: applicationDefault(), projectId });
      }
    }
    const db = getFirestore();
    const doc = await db.doc(`processed_payments/${paymentId}`).get();
    return doc.exists;
  } catch {
    // Firestore unavailable — fall back to in-memory only (safe for single-instance deploys)
    return false;
  }
}

async function markPaymentProcessed(paymentId: string): Promise<void> {
  seenPaymentIds.add(paymentId);
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return;
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    await db.doc(`processed_payments/${paymentId}`).set({ processedAt: new Date().toISOString() });
  } catch (err) {
    logEvent('warn', 'payment_dedup_persist_failed', { paymentId, error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleCreateOrder(req: Request, res: Response): Promise<void> {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    res.status(503).json({
      error: 'Payment service not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.',
    });
    return;
  }

  const planId: Plan = req.body.planId;
  if (planId !== 'growth' && planId !== 'pro') {
    res.status(400).json({ error: 'Invalid planId. Must be "growth" or "pro".' });
    return;
  }

  const amount = PLAN_AMOUNTS_PAISE[planId];
  const receiptId = `folio_${res.locals.uid ?? 'guest'}_${Date.now()}`;

  try {
    const order = await razorpayPost('/orders', {
      amount,
      currency: 'INR',
      receipt: receiptId,
      notes: { planId, uid: res.locals.uid ?? 'guest' },
    }) as { id: string; amount: number; currency: string };

    logEvent('info', 'razorpay_order_created', {
      orderId: order.id,
      planId,
      uid: res.locals.uid,
    });

    res.json({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      planId,
    });
  } catch (err) {
    logEvent('error', 'razorpay_order_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Failed to create payment order. Please try again.' });
  }
}

async function handleVerifyPayment(req: Request, res: Response): Promise<void> {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    res.status(503).json({ error: 'Payment service not configured.' });
    return;
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body as {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    planId: Plan;
  };

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !planId) {
    res.status(400).json({ error: 'Missing payment verification fields.' });
    return;
  }

  // Verify HMAC-SHA256 signature — this is the critical security step.
  // If this fails, the payment is fraudulent or tampered.
  const expectedSig = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSig !== razorpay_signature) {
    logEvent('warn', 'razorpay_signature_mismatch', {
      orderId: razorpay_order_id,
      uid: res.locals.uid,
    });
    res.status(400).json({ error: 'Payment signature verification failed. Payment not credited.' });
    return;
  }

  // Cross-validate planId against the original order's notes — prevents a client
  // from paying for 'growth' then submitting planId:'pro' to get a free upgrade.
  try {
    const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
      headers: { Authorization: razorpayAuth() },
    });
    if (!orderRes.ok) {
      const errText = await orderRes.text();
      throw new Error(`Razorpay order fetch failed (${orderRes.status}): ${errText}`);
    }
    const order = await orderRes.json() as { notes?: { planId?: string } };
    if (order.notes?.planId !== planId) {
      logEvent('warn', 'razorpay_plan_mismatch', {
        orderId: razorpay_order_id,
        claimedPlan: planId,
        actualPlan: order.notes?.planId,
        uid: res.locals.uid,
      });
      res.status(400).json({ error: 'Plan mismatch. Payment not credited.' });
      return;
    }
  } catch (err) {
    logEvent('error', 'razorpay_order_fetch_failed', {
      orderId: razorpay_order_id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Could not verify order details. Please contact support.' });
    return;
  }

  // Reject replayed payment IDs — same payment_id must never upgrade twice,
  // even across server restarts (now backed by Firestore).
  if (await isPaymentAlreadyProcessed(razorpay_payment_id)) {
    logEvent('warn', 'razorpay_payment_replay', {
      paymentId: razorpay_payment_id,
      uid: res.locals.uid,
    });
    res.status(400).json({ error: 'This payment has already been processed.' });
    return;
  }

  // Signature valid — upgrade the user's plan
  const uid: string = res.locals.uid ?? 'anonymous';
  await setFirebasePlanClaim(uid, planId);

  // Persist the payment ID so it can never be replayed (survives restarts)
  await markPaymentProcessed(razorpay_payment_id);

  logEvent('info', 'payment_verified', {
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    planId,
    uid,
  });

  res.json({ success: true, plan: planId });
}

// ── Mount function ────────────────────────────────────────────────────────────
export function mountPaymentRoutes(app: Express): void {
  const razorpayConfigured = !!(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  );

  if (!razorpayConfigured) {
    logEvent('warn', 'razorpay_not_configured', {
      hint: 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable payments.',
    });
  }

  // Both routes are behind requireAuth — uid comes from the verified token
  app.post('/api/payments/create-order', requireAuth, handleCreateOrder);
  app.post('/api/payments/verify',       requireAuth, handleVerifyPayment);

  logEvent('info', 'payment_routes_mounted', { razorpayConfigured });
}
