/**
 * SellerAnalyticsConfig — drives config-based-seller-analytics.ts
 *
 * All rate fields are decimals (e.g. 0.18 = 18 %).
 * Fee fields are absolute ₹ amounts applied per order when the CSV column is absent.
 * Rule fields are expression strings parsed by the analytics engine.
 */
export interface SellerAnalyticsConfig {
  // ── Marketplace identity ──────────────────────────────────────────────────
  /** Human-readable label shown in reports (e.g. 'Amazon IN', 'Flipkart'). */
  marketplace_rules: string;
  /** Tax regime identifier shown in reports (e.g. 'GST'). */
  tax_regime: string;

  // ── Fee rates / fallbacks (applied when CSV column is missing) ────────────
  /**
   * Referral / commission rate as a decimal.
   * Used only when the CSV's referralFee column is 0 / absent.
   * Amazon IN averages ~8–15 %; a conservative 10 % is the default.
   */
  referral_fee_rate: number;
  /**
   * Fixed FBA / fulfilment fee per order (₹).
   * Applied only when fulfillmentFee is absent in the CSV.
   * Set to 0 to disable estimation.
   */
  fba_fee_per_order: number;
  /**
   * Fixed shipping fee per order (₹).
   * Applied only when fulfilment AND fba_fee_per_order are both absent/zero.
   * Set to 0 to disable estimation.
   */
  shipping_fee_per_order: number;
  /**
   * Fixed storage fee per order (₹).
   * Applied only when storageFee is absent in the CSV.
   * Set to 0 to disable estimation.
   */
  storage_fee_per_order: number;
  /**
   * Fixed other-fees amount per order (₹).
   * Applied only when otherFees is absent in the CSV.
   * Set to 0 to disable estimation.
   */
  other_fees: number;

  // ── COGS rule ─────────────────────────────────────────────────────────────
  /**
   * Expression for cost of goods per unit × quantity.
   * Supported syntax: `selling_price * <decimal>` (e.g. "selling_price * 0.50").
   * The engine will report a data gap for any unrecognised pattern.
   */
  cost_price_rule: string;

  // ── Refund rule ───────────────────────────────────────────────────────────
  /**
   * Refund / return strategy.
   * Supported values:
   *   - "return_flag"  — use the return_flag column when mapped; falls back to returnAmount.
   *   - "returnAmount" — use the returnAmount CSV column directly (default safe choice).
   */
  refund_rule: string;

  // ── Tax rates (advisory — not deducted from cash figures) ─────────────────
  /**
   * GST rate as a decimal (e.g. 0.18 for 18 %).
   * Used to compute advisory gst_output = revenue / (1 + gst_rate) × gst_rate.
   */
  gst_rate: number;
  /**
   * TCS (Tax Collected at Source) rate as a decimal.
   * Amazon IN / Flipkart collect 1 % TCS on net sales.
   */
  tcs_rate: number;
  /**
   * TDS (Tax Deducted at Source) rate as a decimal.
   * Typically 1 % for e-commerce operators under Section 194-O.
   */
  tds_rate: number;
}

/**
 * Sensible defaults for an Indian marketplace seller.
 * Override any field in your environment or per-report config.
 */
export const DEFAULT_SELLER_ANALYTICS_CONFIG: SellerAnalyticsConfig = {
  marketplace_rules: 'Amazon IN / Flipkart',
  tax_regime: 'GST',

  referral_fee_rate: 0.10,   // 10 % — conservative mid-range estimate
  fba_fee_per_order: 0,      // don't fabricate FBA fees; let the CSV drive it
  shipping_fee_per_order: 0, // same for shipping
  storage_fee_per_order: 0,  // same for storage
  other_fees: 0,             // same for other fees

  cost_price_rule: 'selling_price * 0.50', // assume 50 % COGS ratio as a starting point

  refund_rule: 'returnAmount', // safe default; switch to 'return_flag' if that column is mapped

  gst_rate: 0.18,  // 18 % standard rate (advisory only)
  tcs_rate: 0.01,  // 1 % TCS under Section 52 of CGST Act
  tds_rate: 0.01,  // 1 % TDS under Section 194-O of Income Tax Act
};