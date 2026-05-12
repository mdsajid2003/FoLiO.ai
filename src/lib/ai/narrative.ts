import { ReconciliationReport } from '../../types/index.ts';
import { logEvent } from '../logger.ts';

const SYSTEM_PROMPT = `You are a financial analyst for Indian e-commerce sellers (Amazon & Flipkart).
You explain reconciliation results in clear, actionable language.

Tax knowledge you MUST reference when relevant:
- GST slabs: 0%, 5%, 12%, 18%, 28% (12% still applies for some HSNs — verify before flagging)
- TCS: 1% under Section 52 CGST Act — on net taxable value (ex-GST, after returns where applicable)
- TDS: 0.1% under Section 194-O IT Act — deducted on GROSS amount credited including GST and shipping. NOT fully reversed on returns. (5% if PAN not furnished — Section 206AA)
- GSTR-1: Outward supply details (B2B in Table 4, B2C in Table 7)
- GSTR-3B: Monthly summary return (Table 3.1a for outward, Table 3d for TCS credit, Table 4 for ITC)
- Form 26AS / AIS: Verify TDS/TCS credits before filing
- Section 44AD: Presumptive taxation — 6% of digital turnover, 8% of non-digital
- New tax regime FY 2025-26: 0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, 24L+ 30%

CRITICAL: You are an EXPLAINER, not a CALCULATOR.
Never compute, estimate, or derive any financial figures. Only interpret pre-computed values in the payload.
If a number is not in the payload, say it is not available — do not estimate it.

If threeWayMatchRate < 95%: mention that some orders have unexplained variances and the seller should review the Audit tab.
If itcFromAmazonFees > 0: mention ITC claimable from Amazon fees (GSTR-3B Table 4).
If deferredAmount > 0: mention it is not yet in their bank.

Rules:
- Use ONLY the exact pre-computed numbers provided in the user message.
- Keep it to 4-5 clear sentences.
- No markdown, no bullet points.
- Use ₹ amounts from the data only.
- End with: "This report is for informational purposes only and is not a substitute for professional CA advice."`;

export async function generateNarrative(report: ReconciliationReport): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey === 'your_anthropic_api_key_here' || apiKey.length < 10) {
    return generateFallbackNarrative(report);
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });

    const topLeakage = report.leakageBreakdown?.[0];
    const tcsSummary = report.tcsSummary;
    const tdsSummary = report.tdsSummary;
    const salesAnalytics = report.salesAnalytics;

    const itcFees = report.gstSummary?.itcFromAmazonFees ?? 0;
    const matchRate = report.threeWayMatch?.matchRate ?? 100;
    const deferred = report.deferredAmount ?? 0;
    const invCrit = report.invariantReport?.criticalFailures ?? 0;

    const dataPrompt = `COMPUTED DATA — use ONLY these exact numbers:
- Platform: ${report.platform}
- Total Revenue: ₹${report.totalRevenue.toLocaleString('en-IN')}
- Total Expenses: ₹${report.totalExpenses.toLocaleString('en-IN')}
- Net Profit: ₹${report.netProfit.toLocaleString('en-IN')}
- Recoverable Leakage: ₹${report.recoverableLeakage.toLocaleString('en-IN')}
- TCS Collected: ₹${(tcsSummary?.totalTcsCollected ?? report.tcsCollected).toLocaleString('en-IN')} (Section 52 CGST)
- TCS Claimable: ₹${(tcsSummary?.totalTcsClaimable ?? report.tcsClaimable).toLocaleString('en-IN')} (GSTR-3B Table 3d)
- TDS Deducted: ₹${(tdsSummary?.totalTdsDeducted ?? 0).toLocaleString('en-IN')} (Section 194-O)
- GST Mismatches: ${report.gstMismatchCount}
- GST Net Liability: ₹${(report.gstSummary?.netGstLiability ?? 0).toLocaleString('en-IN')}
- ITC from Amazon fees (computed): ₹${itcFees.toLocaleString('en-IN')}
- Three-way match rate: ${matchRate}%
- Deferred / not in bank yet: ₹${deferred.toLocaleString('en-IN')}
- Invariant critical failures: ${invCrit}
- Largest leakage: ${topLeakage?.type ?? 'none'} (₹${topLeakage?.amount?.toLocaleString('en-IN') ?? '0'})
- Profit Margin: ${salesAnalytics?.profitMarginPct ?? 0}%
- Avg Order Value: ₹${salesAnalytics?.avgOrderValue ?? 0}
- Orders: ${report.rowCount}
- CGST: ₹${(report.gstSummary?.cgstAmount ?? 0).toLocaleString('en-IN')}
- SGST: ₹${(report.gstSummary?.sgstAmount ?? 0).toLocaleString('en-IN')}
- IGST: ₹${(report.gstSummary?.igstAmount ?? 0).toLocaleString('en-IN')}
- Gross Revenue (before fees): ₹${((report as any).incomeTaxEstimate?.grossRevenue ?? report.totalRevenue).toLocaleString('en-IN')}
- Net Revenue (after fees): ₹${report.totalRevenue.toLocaleString('en-IN')}
- Payout diff (expected vs actual): ₹${(((report as any).expectedPayout ?? report.totalRevenue) - ((report as any).actualPayout ?? report.totalRevenue)).toLocaleString('en-IN')}
- Seller registered state: ${report.gstSummary?.reliability?.assumptions?.[1] ?? 'KA (default)'}

Write 4-5 sentences covering:
1. Key finding: leakage amount and main issue
2. Biggest action item to recover money
3. TCS/TDS action (which form to file, deadline)
4. GST status (if mismatches exist)
5. One profit insight`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: dataPrompt }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('');

    return text || generateFallbackNarrative(report);
  } catch (err) {
    logEvent('warn', 'narrative_generation_failed', { error: err instanceof Error ? err.message : String(err) });
    return generateFallbackNarrative(report);
  }
}

function generateFallbackNarrative(report: ReconciliationReport): string {
  if (report.totalRevenue === 0 && report.recoverableLeakage === 0 && report.tcsClaimable === 0) {
    return `Column mapping issue detected: your file was parsed (${report.rowCount} rows found) but no revenue or fee columns were recognised. ` +
      `This usually means your CSV uses different column names than expected. ` +
      `Please ensure your file has a column named "amount", "net amount", "settlement amount", or "principal" for revenue — ` +
      `or use the standard Amazon Settlement Report V2 / Flipkart Settlement Report format. ` +
      `If you are using a tab-separated file, the parser handles it automatically. Please re-upload.`;
  }

  const topLeakage = report.leakageBreakdown?.[0];
  const parts: string[] = [];

  parts.push(
    `Your ${report.platform} settlement analysis found ₹${report.recoverableLeakage.toLocaleString('en-IN')} in recoverable leakage across ${report.rowCount} orders.`
  );

  if (topLeakage) {
    const typeLabel: Record<string, string> = {
      weight_slab_error: 'weight slab miscalculations',
      duplicate_charge: 'duplicate fee charges',
      missing_reimbursement: 'unreimbursed returns',
      incorrect_referral_fee: 'incorrect referral fees',
      storage_overcharge: 'storage overcharges',
      closing_fee_not_refunded: 'closing fee / return policy items',
    };
    parts.push(
      `The largest issue is ${typeLabel[topLeakage.type] ?? topLeakage.type} (₹${topLeakage.amount.toLocaleString('en-IN')}), which you can dispute through ${report.platform === 'flipkart' ? 'Flipkart Seller Hub' : 'Amazon Seller Central'}.`
    );
  }

  if (report.tcsClaimable > 0) {
    parts.push(
      `You have ₹${report.tcsClaimable.toLocaleString('en-IN')} in TCS credit (Section 52 CGST) claimable via GSTR-3B Table 3(d), which will reduce your next GST liability.`
    );
  }

  if (report.tdsSummary && report.tdsSummary.totalTdsDeducted > 0) {
    parts.push(
      `TDS of ₹${report.tdsSummary.totalTdsDeducted.toLocaleString('en-IN')} was deducted under Section 194-O — verify against Form 26AS and claim while filing ITR.`
    );
  }

  if (report.gstMismatchCount > 0) {
    parts.push(
      `${report.gstMismatchCount} GST mismatches were detected; review these in the Reconciliation tab and reconcile with your GSTR-1 before filing.`
    );
  }

  parts.push(
    'This report is for informational purposes only and is not a substitute for professional CA advice.'
  );

  return parts.join(' ');
}
