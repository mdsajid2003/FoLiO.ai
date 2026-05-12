/**
 * Project-wide seller analytics defaults (Amazon India–oriented).
 * Change values here and downstream CONFIG-first engines recalculate — do not scatter magic numbers.
 */
export interface SellerAnalyticsConfig {
  referral_fee_rate: number;
  fba_fee_per_order: number;
  shipping_fee_per_order: number;
  storage_fee_per_order: number;
  other_fees: number;
  gst_rate: number;
  tcs_rate: number;
  tds_rate: number;
  /** Declarative rule id or expression label — engine interprets known patterns only */
  refund_rule: string;
  /** Declarative cost rule — engine interprets known patterns only (e.g. selling_price * 0.50) */
  cost_price_rule: string;
  tax_regime: string;
  marketplace_rules: string;
  /** ISO date string — Amazon closing fee refund policy cutoff. Update if Amazon revises. */
  closing_fee_refund_cutoff: string;
}

export const DEFAULT_SELLER_ANALYTICS_CONFIG: SellerAnalyticsConfig = {
  referral_fee_rate: 0.12,
  fba_fee_per_order: 80,
  shipping_fee_per_order: 0,
  storage_fee_per_order: 0,
  other_fees: 0,
  gst_rate: 0.18,
  tcs_rate: 0.01,
  tds_rate: 0.001,
  refund_rule: 'return_flag == "Yes" ? revenue : 0',
  cost_price_rule: 'selling_price * 0.50',
  tax_regime: 'new_regime',
  marketplace_rules: 'Amazon India',
  closing_fee_refund_cutoff: '2024-02-01',
};

export function mergeSellerAnalyticsConfig(
  partial: Partial<SellerAnalyticsConfig>,
): SellerAnalyticsConfig {
  return { ...DEFAULT_SELLER_ANALYTICS_CONFIG, ...partial };
}
