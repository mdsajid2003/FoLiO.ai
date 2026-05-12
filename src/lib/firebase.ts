import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

// ── Firebase config ───────────────────────────────────────────────────────────
// All values come from Vite env vars (VITE_ prefix exposes them to the browser).
// Set these in .env.local — never commit real values to git.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Guard: if any required key is missing, mark firebase as unavailable so the
// app can gracefully fall back to guest mode instead of crashing.
const requiredKeys: (keyof typeof firebaseConfig)[] = [
  'apiKey', 'authDomain', 'projectId', 'appId',
];
export const firebaseReady = requiredKeys.every(k => !!firebaseConfig[k]);

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _googleProvider: GoogleAuthProvider | null = null;

if (firebaseReady) {
  // Avoid duplicate app initialisation in hot-reload (Vite HMR)
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  _auth = getAuth(app);
  _googleProvider = new GoogleAuthProvider();
  _googleProvider.setCustomParameters({ prompt: 'select_account' });
}

export const auth = _auth;
export const googleProvider = _googleProvider;

// db kept as undefined — add Firestore here when you wire up report history
export const db: undefined = undefined;
