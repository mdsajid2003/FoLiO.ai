# FoLiOAi — Seller Finance Intelligence

AI-powered Amazon seller reconciliation. Deterministic leakage detection, GST audit, TCS recovery.

---

## Quick Start (Cursor / local dev)

### 1. Install dependencies
```bash
npm install
```

### 2. Set your Gemini API key
Edit `.env.local`:
```
GEMINI_API_KEY="your_key_from_aistudio.google.com"
APP_URL="http://localhost:3000"
```
Get a free key at: https://aistudio.google.com/app/apikey

### 3. Run
```bash
npm run dev
```
Open http://localhost:3000

> **No Redis needed in dev.** The app uses an in-memory Redis mock automatically.
> For production, set `REDIS_URL=redis://...` in `.env.local`.

---

## Firebase setup (for Auth + Firestore)

The app ships with the demo Firebase project credentials from your `firebase-applet-config.json`.
To use your own Firebase project:

1. Go to https://console.firebase.google.com
2. Create a project → Enable **Authentication** (Google provider) and **Firestore**
3. Add a Web app, copy the config
4. Replace the values in `src/lib/firebase.ts`
5. Deploy Firestore rules: `firebase deploy --only firestore:rules`

---

## Project structure

```
folio-ai/
├── server.ts                    ← Express backend (BullMQ jobs, AI chat API)
├── src/
│   ├── App.tsx                  ← Main router + auth gate
│   ├── main.tsx
│   ├── index.css
│   ├── types/index.ts           ← All TypeScript types
│   ├── lib/
│   │   ├── queue.ts             ← BullMQ queue + worker
│   │   ├── firebase.ts          ← Firebase client
│   │   ├── reconcile/
│   │   │   ├── parser.ts        ← CSV ingestion + column mapping
│   │   │   ├── leakage.ts       ← Deterministic leakage detection (5 types)
│   │   │   ├── gst.ts           ← GST + TCS reconciliation
│   │   │   ├── settlement.ts    ← Totals, SKU profitability, monthly trends
│   │   │   └── confidence.ts    ← Data quality scoring
│   │   └── ai/
│   │       └── narrative.ts     ← Gemini narrative (uses computed numbers only)
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useReport.ts
│   ├── pages/
│   │   ├── Upload.tsx
│   │   └── Dashboard.tsx
│   └── components/
│       ├── auth/
│       │   ├── LoginPage.tsx
│       │   └── ConsentModal.tsx  ← DPDP Act 2023 compliance
│       ├── dashboard/
│       │   ├── MetricCards.tsx
│       │   ├── LeakageBreakdown.tsx
│       │   ├── GstMismatchTable.tsx
│       │   ├── SkuProfitability.tsx
│       │   ├── MonthlyTrends.tsx
│       │   └── PaywallOverlay.tsx
│       ├── chat/
│       │   └── AiChatPanel.tsx
│       └── shared/
│           └── Navbar.tsx
├── firestore.rules
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Key design rules

1. **AI never computes.** All ₹ figures come from deterministic TypeScript functions in `src/lib/reconcile/`.
2. **Every leakage item has `sourceRows[]`** — row numbers in the original file for audit trail.
3. **Confidence score on every report** — High / Medium / Low based on data completeness.
4. **Consent before upload** — `ConsentModal` gates every file (DPDP Act 2023).
5. **Paywall pattern** — blur + overlay shows teaser "We found ₹X", locks detail behind Growth plan.

---

## Plans

| Feature                  | Free | Growth (₹999/mo) | Pro (₹2,999/mo) |
|--------------------------|------|------------------|------------------|
| Upload & analyse         | ✓    | ✓                | ✓                |
| Leakage total            | ✓    | ✓                | ✓                |
| Full leakage breakdown   | ✗    | ✓                | ✓                |
| GST mismatch detail      | ✗    | ✓                | ✓                |
| SKU profitability        | ✗    | ✓                | ✓                |
| Monthly trends           | ✗    | ✓                | ✓                |
| CSV export               | ✗    | ✓                | ✓                |
| AI chat                  | ✓    | ✓                | ✓                |

To unlock paid features in dev: update `plan` field in Firestore for your user document to `"growth"`.

---

## Legal

- Financial disclaimer shown on every page — informational only, not CA advice.
- DPDP Act 2023 consent modal before any file upload.
- Data stored in Firebase (Google Cloud).
