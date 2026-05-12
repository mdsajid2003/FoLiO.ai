import { useState, useEffect } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, firebaseReady } from '../lib/firebase.ts';
import { UserProfile } from '../types/index.ts';

// ── Guest fallback (when Firebase is not configured) ─────────────────────────
// Maintains the original behaviour so the app still works for self-hosted
// deployments that haven't set up Firebase yet.
function makeGuestUser() {
  try {
    const stored = localStorage.getItem('guardian_user');
    if (stored) return JSON.parse(stored) as { uid: string; email: string };
  } catch { /* ignore */ }
  const guest = { uid: `guest_${Date.now()}`, email: 'guest@folioai.app' };
  localStorage.setItem('guardian_user', JSON.stringify(guest));
  return guest;
}

function profileFromUser(user: User | { uid: string; email: string }, plan: UserProfile['plan'] = 'free'): UserProfile {
  return {
    uid: user.uid,
    email: ('email' in user && user.email) ? user.email : 'guest@folioai.app',
    plan,
    subscriptionStatus: 'active',
    createdAt: new Date().toISOString(),
  };
}

// ── Plan storage (local until Firestore is wired) ────────────────────────────
// Stores plan keyed by uid in localStorage. Replace with a Firestore read when
// you wire up the database — the interface stays identical.
function getStoredPlan(uid: string): UserProfile['plan'] {
  try {
    const raw = localStorage.getItem(`folio_plan_${uid}`);
    if (raw === 'growth' || raw === 'pro') return raw;
  } catch { /* ignore */ }
  return 'free';
}

export function setStoredPlan(uid: string, plan: UserProfile['plan']): void {
  try {
    localStorage.setItem(`folio_plan_${uid}`, plan);
  } catch { /* ignore */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  const [user, setUser] = useState<User | { uid: string; email: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady || !auth) {
      // Guest mode — no Firebase configured
      setLoading(false);
      return;
    }

    // Subscribe to Firebase auth state — fires immediately with current user
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Use locally-stored plan as immediate value to avoid a flash to 'free'
        // while getIdTokenResult() resolves. getStoredPlan returns 'free' for
        // new users, so this is safe for the first-login path too.
        const storedPlan = getStoredPlan(firebaseUser.uid);
        setUser(firebaseUser);
        setProfile(profileFromUser(firebaseUser, storedPlan)); // show UI immediately with correct plan
        // Check Firebase custom claim for plan (fastest path — set immediately after payment verify)
        firebaseUser.getIdTokenResult().then(result => {
          const claimPlan = result.claims.plan;
          if (claimPlan === 'growth' || claimPlan === 'pro') {
            // Persist so the next page load also gets the right plan without waiting
            setStoredPlan(firebaseUser.uid, claimPlan as UserProfile['plan']);
            setProfile(profileFromUser(firebaseUser, claimPlan as UserProfile['plan']));
          }
        }).catch(() => {});
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return unsub; // cleanup on unmount
  }, []);

  // ── Sign in with Google ───────────────────────────────────────────────────
  async function signInWithGoogle() {
    if (!firebaseReady || !auth || !googleProvider) {
      // Graceful fallback: guest mode
      const guest = makeGuestUser();
      const plan = getStoredPlan(guest.uid);
      setUser(guest);
      setProfile(profileFromUser(guest, plan));
      return guest;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const plan = getStoredPlan(result.user.uid);
      setUser(result.user);
      setProfile(profileFromUser(result.user, plan));
      return result.user;
    } catch (err: unknown) {
      // Popup blocked or user dismissed — fall back to guest so the app
      // doesn't leave the user stranded on the login screen.
      // #I fix: surface the error clearly rather than silently degrading
      const reason = err instanceof Error ? err.message : String(err);
      console.warn('Firebase sign-in failed, falling back to guest mode:', reason);
      // Only warn if this looks like a real Firebase error (not just user closing popup)
      const isUserDismiss = reason.includes('popup-closed') || reason.includes('cancelled');
      if (!isUserDismiss) {
        // Surface non-dismissal errors so developers notice misconfiguration
        console.error('[Auth] Non-dismissal sign-in error — check Firebase config:', reason);
      }
      const guest = makeGuestUser();
      const guestPlan = getStoredPlan(guest.uid);
      setUser(guest);
      setProfile(profileFromUser(guest, guestPlan));
      return guest;
    }
  }

  // ── Sign out ──────────────────────────────────────────────────────────────
  async function signOut() {
    if (firebaseReady && auth) {
      try { await firebaseSignOut(auth); } catch { /* ignore */ }
    }
    // #G fix: do NOT remove guardian_user — removing it lets the user call makeGuestUser()
    // again on re-login, which generates a fresh UID and a fresh AI usage counter.
    // Instead, keep the entry so the same guest UID (and its quota) is reused.
    // localStorage.removeItem('guardian_user'); // ← intentionally removed
    setUser(null);
    setProfile(null);
  }

  // ── Upgrade plan (called by Razorpay success handler) ────────────────────
  function upgradePlan(plan: UserProfile['plan']) {
    if (!user) return;
    // #A fix: persist to localStorage so the plan survives a page refresh
    setStoredPlan(user.uid, plan);
    // Server has already written to Firestore and set custom claim.
    // Force token refresh so next getIdTokenResult() returns the new claim.
    if (auth?.currentUser) {
      auth.currentUser.getIdToken(true).catch(() => {});
    }
    setProfile(prev => prev ? { ...prev, plan } : null);
  }

  // ── Get ID token for server auth ─────────────────────────────────────────
  // Returns a Firebase ID token for protected API calls, or null in guest mode.
  async function getIdToken(): Promise<string | null> {
    if (!firebaseReady || !auth?.currentUser) return null;
    try {
      return await auth.currentUser.getIdToken();
    } catch {
      return null;
    }
  }

  return { user, profile, loading, signInWithGoogle, signOut, upgradePlan, getIdToken };
}
