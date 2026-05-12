import 'dotenv/config';
import express from 'express';
import path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { reconciliationQueue, startWorker, getAiUsage } from './src/lib/queue.ts';
import { logEvent } from './src/lib/logger.ts';
import { requireAuth, requirePlan } from './src/lib/auth-middleware.ts';
import { mountPaymentRoutes } from './src/lib/payment-routes.ts';

// Note: individual route handlers use requireAuth directly.
// No global public-route bypass middleware is needed.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

startWorker();

const CLAUDE_SYSTEM_PROMPT = `You are a financial assistant for Indian e-commerce sellers (Amazon & Flipkart).
You have deep knowledge of:
- GST: slabs (0%, 5%, 12%, 18%, 28%), IGST vs CGST+SGST, ITC
- TCS: 1% under Section 52 CGST Act on gross merchandise value (excl. GST)
- TDS: 0.1% under Section 194-O IT Act on gross amount (5% without PAN)
- GSTR-1 (outward supplies), GSTR-3B (monthly summary), GSTR-2B (auto-drafted ITC)
- Form 26AS / AIS for TDS/TCS verification
- Section 44AD presumptive taxation: 6% digital, 8% non-digital
- FY 2025-26 new regime: 0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, 24L+ 30%
- Amazon/Flipkart fee structures, FBA weight slabs, referral fees

Answer using ONLY the provided report data. Do not invent or estimate numbers.
Be specific about which GST form, which table, which section to use.
End every response with: "This is for informational purposes only. Consult a CA for advice."`;

const requestBuckets = new Map<string, { count: number; windowStart: number }>();

// Purge stale rate-limit buckets every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of requestBuckets) {
    if (now - v.windowStart > 300_000) requestBuckets.delete(k);
  }
}, 300_000);

function allowRequest(bucketKey: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = requestBuckets.get(bucketKey);
  if (!bucket || now - bucket.windowStart > windowMs) {
    requestBuckets.set(bucketKey, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  requestBuckets.set(bucketKey, bucket);
  return true;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  // Security headers (helmet-style, no extra dependency needed)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    // #27 fix: add Content-Security-Policy
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self' https://api.anthropic.com https://api.razorpay.com https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com",
        "frame-src https://checkout.razorpay.com https://api.razorpay.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
    next();
  });

  // CORS — restrict to configured origin in production
  app.use((req, res, next) => {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
    const origin = req.headers.origin;
    if (origin && (origin === allowedOrigin || process.env.NODE_ENV !== 'production')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  app.use((req, res, next) => {
    logEvent('info', 'http_request', { method: req.method, path: req.path });
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ── Health ──
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'FoLiOAI backend running' });
  });

  // ── User plan (reads custom claim + Firestore fallback) ────────────────────
  app.get('/api/user/plan', requireAuth, async (req, res) => {
    const uid = res.locals.uid as string;
    const claimPlan = res.locals.plan as string | undefined;
    if (claimPlan === 'growth' || claimPlan === 'pro') {
      return res.json({ plan: claimPlan });
    }
    // Fallback: read from Firestore (edge case: token not yet refreshed after payment)
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();
      const snap = await db.doc(`users/${uid}`).get();
      const data = snap.data();
      const plan = data?.plan;
      if (plan === 'growth' || plan === 'pro') return res.json({ plan });
    } catch { /* Firebase not configured */ }
    return res.json({ plan: 'free' });
  });

  // ── AI usage tracking — #19 fix: read uid from verified auth, not raw query param ──
  app.get('/api/ai-usage', requireAuth, (req, res) => {
    // res.locals.uid is set by requireAuth from a verified token (or guest fallback IP)
    const userId = (res.locals.uid as string) || req.ip || 'anonymous';
    const usage = getAiUsage(userId);
    res.json({ used: usage.count, limit: usage.limit, remaining: usage.limit - usage.count, monthKey: usage.monthKey });
  });

  // ── Legal docs (serve static markdown files as HTML) ──
  // We escape all user-visible content then apply safe substitutions to avoid XSS.
  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function serveLegalDoc(filePath: string, title: string, res: express.Response) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      // Escape first, then apply safe HTML substitutions on the escaped string
      const escaped = escapeHtml(raw);
      const html = escaped
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- /gm, '<li>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" rel="noopener noreferrer" style="color:#1a5c3a">$1</a>')
        .replace(/\n{2,}/g, '<br/><br/>')
        .replace(/\n/g, '<br/>');
      const safeTitle = escapeHtml(title);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${safeTitle} — FoLiOAI</title><style>body{font-family:'DM Sans',system-ui,sans-serif;max-width:780px;margin:0 auto;padding:32px 24px;color:#1a1a14;line-height:1.7;background:#f9f8f5}h1{font-size:28px;border-bottom:1px solid #e0ddd4;padding-bottom:12px}h2{font-size:20px;margin-top:28px;color:#0e0e0c}h3{font-size:16px;margin-top:20px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #e0ddd4;padding:8px 12px;text-align:left;font-size:13px}th{background:#f0ede4}a{color:#1a5c3a}li{margin:4px 0}strong{font-weight:600}</style></head><body>${html}<br/><br/><a href="/" style="display:inline-block;padding:10px 20px;background:#0e0e0c;color:#f5f2eb;border-radius:6px;text-decoration:none;font-size:13px">Back to FoLiOAI</a></body></html>`);
    } catch {
      res.status(404).send('Document not found');
    }
  }

  app.get('/terms', (_req, res) => {
    serveLegalDoc(path.join(process.cwd(), 'TERMS.md'), 'Terms and Conditions', res);
  });

  app.get('/privacy', (_req, res) => {
    serveLegalDoc(path.join(process.cwd(), 'PRIVACY.md'), 'Privacy Policy', res);
  });

  // Demo CSV for "Load demo report" — served from public/demo/ so it survives Docker builds
  const demoCsvPath = path.join(__dirname, 'public', 'demo', 'amazon-demo.csv');
  // Keep old path as alias for any bookmarked URLs
  const handleDemoCsv = (_req: express.Request, res: express.Response) => {
    try {
      if (!fs.existsSync(demoCsvPath)) {
        return res.status(404).type('text/plain').send('Demo CSV not found');
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(fs.readFileSync(demoCsvPath, 'utf8'));
    } catch {
      res.status(500).type('text/plain').send('Failed to read demo file');
    }
  };
  app.get('/public/demo/amazon-demo.csv', handleDemoCsv);
  app.get('/tests/fixtures/amazon-demo.csv', handleDemoCsv);
  // #9 fix: the client fetches '/demo/amazon-demo.csv' but the server only registered
  // '/public/demo/...' — in production (Express, no Vite) this 404s.
  app.get('/demo/amazon-demo.csv', handleDemoCsv);

  // ── Reconciliation: enqueue ──
  app.post('/api/reconcile', requireAuth, async (req, res) => {
    // #20 fix: rate-limit by authenticated userId, not IP (IP punishes shared NAT users)
    const rateLimitKey = (res.locals.uid as string) || req.ip || 'anon';
    if (!allowRequest(`reconcile:${rateLimitKey}`, 15, 60_000)) {
      return res.status(429).json({ error: 'Too many upload requests. Please wait a minute and try again.' });
    }

    const rawFilename = req.body.filename;
    const rawData = req.body.data;


    // Validate filename
    if (!rawFilename || typeof rawFilename !== 'string') {
      return res.status(400).json({ error: 'filename is required and must be a string' });
    }
    if (!/^[\w\s\-(). ]+\.(csv|xls|xlsx)$/i.test(rawFilename.trim())) {
      return res.status(400).json({ error: 'Invalid filename. Only .csv, .xls, .xlsx files are accepted.' });
    }

    // Validate data
    if (!rawData || typeof rawData !== 'string') {
      return res.status(400).json({ error: 'data is required and must be a string' });
    }
    if (rawData.length > 15 * 1024 * 1024) {
      return res.status(400).json({ error: 'File is too large (max 15 MB).' });
    }
    // Reject binary content
    const sample = rawData.slice(0, 512);
    if (/\x00/.test(sample)) {
      return res.status(400).json({ error: 'File appears to be binary. Only plain-text CSV files are accepted.' });
    }

    // uid comes from requireAuth middleware — verified Firebase token or guest fallback.
    // No longer trusts client-supplied userId.
    const userId = (res.locals.uid as string) || 'anonymous';

    const filename = rawFilename.trim();
    const firstLine = rawData.split('\n')[0].slice(0, 300);
    const delimiter = (firstLine.match(/\t/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? 'TAB' : 'COMMA';
    logEvent('info', 'reconcile_file_received', { filename, delimiter, userId, byteLength: rawData.length });

    try {
      const columnOverrides = req.body.columnOverrides ?? {};
      const job = await reconciliationQueue.add('process-reconciliation', {
        filename,
        data: rawData,
        userId,
        timestamp: new Date().toISOString(),
        // BUGFIX: columnOverrides was received from client but never forwarded to the job.
        // The column mapping banner re-submit was silently ignored every time.
        columnOverrides: typeof columnOverrides === 'object' && !Array.isArray(columnOverrides)
          ? columnOverrides as Record<string, string>
          : {},
        // BUGFIX: propagate seller's registered state so IGST/CGST/SGST split is correct.
        // Client may supply it via X-Seller-State header; falls back to SELLER_REGISTERED_STATE env.
        sellerRegisteredState: (req.headers['x-seller-state'] as string | undefined)?.trim().toUpperCase().slice(0, 2)
          || process.env.SELLER_REGISTERED_STATE?.trim().toUpperCase().slice(0, 2),
      });
      res.json({ jobId: job.id, status: 'queued' });
    } catch (err) {
      logEvent('error', 'reconcile_enqueue_failed', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: 'Failed to queue job' });
    }
  });

  // ── Reconciliation: poll status ──
  app.get('/api/reconcile/status/:jobId', requireAuth, async (req, res) => {
    try {
      const job = await reconciliationQueue.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });

      // SECURITY FIX: Verify the requesting user owns this job.
      // Without this check any authenticated user can read any other user's
      // financial report by enumerating sequential job IDs.
      const requestingUid = res.locals.uid as string;
      if (job.data.userId !== requestingUid) {
        logEvent('warn', 'reconcile_status_forbidden', { jobId: req.params.jobId, requestingUid, ownerUid: job.data.userId });
        return res.status(403).json({ error: 'Forbidden' });
      }

      const state = await job.getState();
      res.json({
        jobId: job.id,
        state,
        progress: job.progress,
        result: job.returnvalue,
        failedReason: job.failedReason,
      });
    } catch (err) {
      logEvent('error', 'reconcile_status_failed', { jobId: req.params.jobId, error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: 'Failed to get job status' });
    }
  });

  // ── AI Chat (Claude-powered) — requires growth or pro plan (#B fix) ──
  app.post('/api/chat', requireAuth, requirePlan('growth', 'pro'), async (req, res) => {
    // #20 fix: rate-limit by userId, not IP
    const rateLimitKey = (res.locals.uid as string) || req.ip || 'anon';
    if (!allowRequest(`chat:${rateLimitKey}`, 40, 60_000)) {
      return res.status(429).json({ error: 'Too many chat requests. Please wait a minute and try again.' });
    }
    const message: string = req.body.message;
    const reportContext: ChatContext | undefined = req.body.reportContext;
    const history: { role: string; content: string }[] | undefined = req.body.history;
    if (!message) return res.status(400).json({ error: 'message required' });
    // Cap message length to prevent prompt-injection / API cost abuse
    const safeMessage = String(message).slice(0, 2000);

    const apiKey = process.env.ANTHROPIC_API_KEY;

    // Build context from full report
    let contextBlock = '';
    if (reportContext) {
      contextBlock = `
Report data for this seller:
- Platform: ${reportContext.platform ?? 'amazon'}
- Total Revenue: ₹${reportContext.totalRevenue?.toLocaleString('en-IN') ?? 'N/A'}
- Total Expenses: ₹${reportContext.totalExpenses?.toLocaleString('en-IN') ?? 'N/A'}
- Net Profit: ₹${reportContext.netProfit?.toLocaleString('en-IN') ?? 'N/A'}
- Profit Margin: ${reportContext.profitMarginPct ?? 'N/A'}%
- Recoverable Leakage: ₹${reportContext.recoverableLeakage?.toLocaleString('en-IN') ?? 'N/A'}
- TCS Collected: ₹${reportContext.tcsCollected?.toLocaleString('en-IN') ?? 'N/A'} (Section 52 CGST)
- TCS Claimable: ₹${reportContext.tcsClaimable?.toLocaleString('en-IN') ?? 'N/A'} (GSTR-3B Table 3d)
- TDS Deducted: ₹${reportContext.tdsDeducted?.toLocaleString('en-IN') ?? '0'} (Section 194-O)
- GST Mismatches: ${reportContext.gstMismatchCount ?? 0}
- GST Net Liability: ₹${reportContext.gstNetLiability?.toLocaleString('en-IN') ?? '0'}
- Avg Order Value: ₹${reportContext.avgOrderValue ?? 'N/A'}
- Orders Processed: ${reportContext.rowCount ?? 0}
- Top Leakage Types: ${reportContext.leakageTypes ?? 'none'}
- Income Tax Estimate: ₹${reportContext.estimatedTax?.toLocaleString('en-IN') ?? 'N/A'}
- Recommended ITR Form: ${reportContext.itrForm ?? 'N/A'}`;
    }

    // Try Claude first
    if (apiKey && apiKey.length > 10 && apiKey !== 'your_anthropic_api_key_here') {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey });

        // Build conversation history (last 5 messages)
        // #4 fix: if the client accidentally included the current message as the last history
        // entry (old bug — now fixed client-side too), strip it to prevent sending it twice.
        const messages: { role: 'user' | 'assistant'; content: string }[] = [];
        if (Array.isArray(history)) {
          const filtered = history.slice(-5);
          // Drop last entry if it duplicates the current message
          const last = filtered[filtered.length - 1];
          const deduped = (last?.role === 'user' && last?.content?.trim() === safeMessage?.trim())
            ? filtered.slice(0, -1)
            : filtered;
          for (const msg of deduped) {
            const role = msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user';
            messages.push({ role, content: String(msg.content ?? '') });
          }
        }
        messages.push({ role: 'user', content: contextBlock ? `${contextBlock}\n\nUser question: ${safeMessage}` : safeMessage });

        const isStream = req.headers.accept === 'text/event-stream';

        if (isStream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders();

          // #21 fix: send a keep-alive comment every 15 s to prevent proxy/browser timeouts
          const heartbeat = setInterval(() => {
            if (!res.writableEnded) res.write(': keep-alive\n\n');
          }, 15_000);

          // #C fix: stop streaming if client disconnects before the LLM finishes
          let clientGone = false;
          req.on('close', () => {
            clientGone = true;
            clearInterval(heartbeat);
          });

          const stream = client.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 600,
            system: CLAUDE_SYSTEM_PROMPT,
            messages,
          });

          for await (const event of stream) {
            if (clientGone) break; // #C: stop consuming tokens after disconnect
            if (
              event.type === 'content_block_delta' &&
              'delta' in event &&
              (event as { delta: { type: string; text?: string } }).delta.type === 'text_delta'
            ) {
              const text = (event as { delta: { type: string; text: string } }).delta.text;
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          }
          clearInterval(heartbeat);
          if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
          }
          return;
        }

        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: CLAUDE_SYSTEM_PROMPT,
          messages,
        });

        const reply = response.content
          .filter(block => block.type === 'text')
          .map(block => ('text' in block ? String(block.text) : ''))
          .join('');

        return res.json({ reply: reply || generateTemplateResponse(safeMessage, reportContext) });
      } catch (err) {
        logEvent('warn', 'claude_chat_failed', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Fallback: template-based response
    res.json({ reply: generateTemplateResponse(safeMessage, reportContext) });
  });

  // ── Tax Summary endpoint ──
  app.get('/api/tax-summary/:jobId', requireAuth, async (req, res) => {
    try {
      const job = await reconciliationQueue.getJob(req.params.jobId);
      if (!job || !job.returnvalue) return res.status(404).json({ error: 'Report not found' });

      // SECURITY FIX: Verify ownership — GST/TCS/TDS data is sensitive financial info.
      const requestingUid = res.locals.uid as string;
      if (job.data.userId !== requestingUid) {
        logEvent('warn', 'tax_summary_forbidden', { jobId: req.params.jobId, requestingUid, ownerUid: job.data.userId });
        return res.status(403).json({ error: 'Forbidden' });
      }

      const report = job.returnvalue;
      res.json({
        gstSummary: report.gstSummary,
        tcsSummary: report.tcsSummary,
        tdsSummary: report.tdsSummary,
        incomeTaxEstimate: report.incomeTaxEstimate,
      });
    } catch (err) {
      logEvent('error', 'tax_summary_failed', { jobId: req.params.jobId, error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: 'Failed to get tax summary' });
    }
  });

  // ── Payments (Razorpay) ──
  mountPaymentRoutes(app);

  // Unmatched /api/* → JSON 404 (avoid SPA HTML for bad API paths)
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // In production serve the built SPA; in dev, Vite runs separately on its own port
  // and proxies /api to this server (see vite.config.ts proxy setting).
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logEvent('info', 'server_started', { port: PORT, message: `FoLiOAI listening on 0.0.0.0:${PORT}` });
  });
}

interface ChatContext {
  platform?: string;
  totalRevenue?: number;
  totalExpenses?: number;
  netProfit?: number;
  profitMarginPct?: number;
  recoverableLeakage?: number;
  tcsCollected?: number;
  tcsClaimable?: number;
  tdsDeducted?: number;
  gstMismatchCount?: number;
  gstNetLiability?: number;
  avgOrderValue?: number;
  rowCount?: number;
  leakageTypes?: string;
  estimatedTax?: number;
  itrForm?: string;
}

function generateTemplateResponse(message: string, ctx: ChatContext | undefined): string {
  const q = message.toLowerCase();

  if (q.includes('tcs') || q.includes('tax collected')) {
    return `Based on your report, ₹${ctx?.tcsCollected?.toLocaleString('en-IN') ?? '0'} was collected as TCS (1% under Section 52 CGST Act) by the marketplace. You can claim this as input credit in your GSTR-3B return under Table 3(d). Verify the amount against your GSTR-2B before filing. This is for informational purposes only. Consult a CA for advice.`;
  }

  if (q.includes('tds') || q.includes('tax deducted')) {
    return `TDS of ₹${ctx?.tdsDeducted?.toLocaleString('en-IN') ?? '0'} was deducted under Section 194-O at 0.1% (or 5% if PAN not furnished). This can be claimed as credit while filing your income tax return. Verify against Form 26AS/AIS. This is for informational purposes only. Consult a CA for advice.`;
  }

  if (q.includes('gst') || q.includes('gstr') || q.includes('input tax')) {
    return `Your report shows ${ctx?.gstMismatchCount ?? 0} GST mismatches with a net GST liability of ₹${ctx?.gstNetLiability?.toLocaleString('en-IN') ?? '0'}. Review mismatches in the Reconciliation tab. File corrections in GSTR-1 (Table 9 for credit/debit notes) and reconcile with GSTR-3B. This is for informational purposes only. Consult a CA for advice.`;
  }

  if (q.includes('leakage') || q.includes('recover') || q.includes('dispute')) {
    return `₹${ctx?.recoverableLeakage?.toLocaleString('en-IN') ?? '0'} in recoverable leakage was detected. The main categories are: ${ctx?.leakageTypes ?? 'weight slab errors and duplicate charges'}. You can raise disputes through Seller Central/Seller Hub under the respective support categories. Time limit is typically 30-90 days. This is for informational purposes only. Consult a CA for advice.`;
  }

  if (q.includes('income tax') || q.includes('itr') || q.includes('advance tax')) {
    return `Based on your revenue of ₹${ctx?.totalRevenue?.toLocaleString('en-IN') ?? '0'}, your estimated income tax is ₹${ctx?.estimatedTax?.toLocaleString('en-IN') ?? '0'} under the ${ctx?.itrForm ?? 'new regime'}. TCS credit of ₹${ctx?.tcsCollected?.toLocaleString('en-IN') ?? '0'} and TDS credit of ₹${ctx?.tdsDeducted?.toLocaleString('en-IN') ?? '0'} will be adjusted. File advance tax by the quarterly due dates (Jun 15, Sep 15, Dec 15, Mar 15). This is for informational purposes only. Consult a CA for advice.`;
  }

  return `Your report shows ₹${ctx?.totalRevenue?.toLocaleString('en-IN') ?? '0'} in revenue with ₹${ctx?.netProfit?.toLocaleString('en-IN') ?? '0'} net profit. I found ₹${ctx?.recoverableLeakage?.toLocaleString('en-IN') ?? '0'} in recoverable leakage and ₹${ctx?.tcsCollected?.toLocaleString('en-IN') ?? '0'} in claimable TCS. Ask me about specific topics like "TCS claim process", "GST filing", "income tax estimate", or "leakage disputes" for detailed guidance. This is for informational purposes only. Consult a CA for advice.`;
}

startServer().catch(err => {
  logEvent('error', 'server_fatal', { error: err instanceof Error ? err.message : String(err) });
  console.error('Fatal: failed to start server', err);
  process.exit(1);
});
