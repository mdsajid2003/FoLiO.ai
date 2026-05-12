import type { Confidence, SellerOrderRow, ThreeWayMatchItem, ThreeWayMatchSummary } from '../../types/index.ts';

const TOL = 2;

/**
 * Order vs tax vs settlement alignment (same-source assumptions flagged in items).
 */
export function computeThreeWayMatch(rows: SellerOrderRow[]): ThreeWayMatchSummary {
  const orderRows = rows.filter(r => r.rowSource !== 'amazon_transaction_line');
  const byOrder = new Map<string, SellerOrderRow[]>();
  for (const r of orderRows) {
    const list = byOrder.get(r.orderId) ?? [];
    list.push(r);
    byOrder.set(r.orderId, list);
  }

  const items: ThreeWayMatchItem[] = [];
  let totalMatched = 0;
  let totalMismatched = 0;
  let unexplainedVariance = 0;
  let classifiedVariance = 0;

  for (const [orderId, list] of byOrder) {
    const sourceRows = list.map(r => r.rowIndex);
    let orderValue = 0;
    let settlementValue = 0;
    let fees = 0;
    let gstCollectedSum = 0;
    for (const r of list) {
      if (r.amazonTxKind === 'capture' || (!r.amazonTxKind && r.sellingPrice > 0)) {
        orderValue += r.sellingPrice > 0 ? r.sellingPrice : Math.max(0, r.settlement);
      }
      settlementValue += r.settlement;
      fees += r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
      gstCollectedSum += r.gstCollected ?? 0;
    }
    // taxReportValue: gross sale price as reported via GST layer.
    // When gstCollected is available, back-compute the tax-inclusive gross from
    // the net-of-GST settlement + fees + collected GST.  When gstCollected is
    // absent (zero), fall back to orderValue so the check degrades gracefully
    // rather than producing a spurious mismatch.
    // Previously taxReportValue was set equal to orderValue unconditionally,
    // making orderVsTax always 0 and the "order vs tax layer" branch dead code.
    const grossFromSettlement = settlementValue + fees;
    const taxReportValue = gstCollectedSum > 0
      ? Math.round((grossFromSettlement + gstCollectedSum) * 100) / 100
      : orderValue;
    const orderVsTax = Math.round((orderValue - taxReportValue) * 100) / 100;
    const taxVsSettlement = Math.round((taxReportValue - settlementValue) * 100) / 100;

    let status: ThreeWayMatchItem['status'] = 'unclassified';
    let mismatchCause: string | undefined;
    let confidence: Confidence = 'medium';

    if (orderValue <= 0 && settlementValue <= 0) {
      status = 'matched';
      confidence = 'low';
    } else if (orderValue > 0 && Math.abs(settlementValue) < 1e-6) {
      status = 'missing';
      mismatchCause = 'no settlement found';
      totalMismatched += 1;
      unexplainedVariance += Math.abs(taxVsSettlement);
    } else if (Math.abs(orderVsTax) <= TOL) {
      const feeMatch = Math.abs(taxVsSettlement - fees) <= Math.max(TOL, fees * 0.05);
      if (Math.abs(taxVsSettlement) <= TOL) {
        status = 'matched';
        totalMatched += 1;
      } else if (feeMatch) {
        status = 'matched';
        mismatchCause = 'platform fees + taxes';
        classifiedVariance += Math.abs(taxVsSettlement - fees);
        totalMatched += 1;
      } else {
        status = 'mismatch';
        mismatchCause = 'unexplained';
        totalMismatched += 1;
        unexplainedVariance += Math.abs(taxVsSettlement - fees);
      }
    } else {
      status = 'mismatch';
      mismatchCause = 'order vs tax layer';
      totalMismatched += 1;
      unexplainedVariance += Math.abs(orderVsTax);
    }

    items.push({
      orderId,
      sku: list[0]?.sku,
      orderValue: Math.round(orderValue * 100) / 100,
      taxReportValue: Math.round(taxReportValue * 100) / 100,
      settlementValue: Math.round(settlementValue * 100) / 100,
      orderVsTax,
      taxVsSettlement,
      status,
      mismatchCause,
      confidence,
      sourceRows,
    });
  }

  const denom = items.length || 1;
  const matchRate = Math.round((totalMatched / denom) * 10000) / 100;

  return {
    items,
    totalMatched,
    totalMismatched,
    unexplainedVariance: Math.round(unexplainedVariance * 100) / 100,
    classifiedVariance: Math.round(classifiedVariance * 100) / 100,
    matchRate,
  };
}
