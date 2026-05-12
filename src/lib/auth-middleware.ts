/**
 * Server-side Firebase Auth middleware.
 *
 * Verifies the Firebase ID token sent by the client in the
 * Authorization header (Bearer <token>) and attaches the decoded
 * claims to res.locals.uid and res.locals.email.
 *
 * Falls back to anonymous mode when:
 *   - GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID is not set
 *   - The token is missing (guest / self-hosted users without Firebase)
 *
 * Usage:
 *   import { requireAuth } from './src/lib/auth-middleware.ts';
 *   app.post('/api/reconcile', requireAuth, async (req, res) => { ... });
 */

import type { Request, Response, NextFunction } from 'express';
import { logEvent } from './logger.ts';

// Lazy-import firebase-admin so the server still boots when the package is
// not installed (self-hosted / no Firebase deployments).
let adminAuth: import('firebase-admin/auth').Auth | null = null;
let adminInitAttempted = false;

async function getAdminAuth(): Promise<import('firebase-admin/auth').Auth | null> {
  if (adminInitAttempted) return adminAuth;
  adminInitAttempted = true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    logEvent('warn', 'firebase_admin_skip', {
      reason: 'FIREBASE_PROJECT_ID not set — running in guest/no-auth mode',
    });
    return null;
  }

  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');

    if (getApps().length === 0) {
      // GOOGLE_APPLICATION_CREDENTIALS env var points to your service account JSON.
      // Alternatively, on GCP/Cloud Run this is auto-detected via ADC.
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (credPath) {
        const { readFileSync } = await import('fs');
        const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
        initializeApp({ credential: cert(serviceAccount), projectId });
      } else {
        // ADC (Application Default Credentials) — works on GCP automatically
        const { applicationDefault } = await import('firebase-admin/app');
        initializeApp({ credential: applicationDefault(), projectId });
      }
    }

    adminAuth = getAuth();
    logEvent('info', 'firebase_admin_ready', { projectId });
    return adminAuth;
  } catch (err) {
    logEvent('warn', 'firebase_admin_init_failed', {
      error: err instanceof Error ? err.message : String(err),
      hint: 'Install firebase-admin: npm i firebase-admin',
    });
    return null;
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const fbAuth = await getAdminAuth();

  // No Firebase configured — allow through in guest mode.
  // #8 fix: do NOT read userId from req.body or req.headers — any client could
  // impersonate any other user by crafting those fields. Fall back to IP only.
  if (!fbAuth) {
    res.locals.uid = req.ip || 'anonymous';
    res.locals.email = 'guest';
    res.locals.plan = 'free';
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header. Expected: Bearer <Firebase ID token>' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = await fbAuth.verifyIdToken(token);
    res.locals.uid = decoded.uid;
    res.locals.email = decoded.email ?? 'unknown';
    // Custom claims: set plan via Firebase Admin SDK or Cloud Function after payment
    res.locals.plan = (decoded as Record<string, unknown>).plan ?? 'free';
    return next();
  } catch (err) {
    logEvent('warn', 'firebase_token_invalid', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(401).json({ error: 'Invalid or expired Firebase ID token. Please sign in again.' });
    return;
  }
}

// ── Plan guard ────────────────────────────────────────────────────────────────
// Use after requireAuth to gate paid features.
// Example: app.get('/api/export', requireAuth, requirePlan('growth'), handler)

export function requirePlan(...allowedPlans: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const plan: string = res.locals.plan ?? 'free';
    if (allowedPlans.includes(plan)) return next();
    res.status(403).json({
      error: `This feature requires a ${allowedPlans.join(' or ')} plan.`,
      currentPlan: plan,
      upgradeUrl: '/upgrade',
    });
  };
}
