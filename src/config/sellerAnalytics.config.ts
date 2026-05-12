export interface SellerAnalyticsConfig {
  marketplace_rules: string;
  tax_regime: string;
  referral_fee_rate: number;
  fba_fee_per_order: number;
  shipping_fee_per_order: number;
  storage_fee_per_order: number;
  other_fees: number;
  cost_price_rule: string;
  refund_rule: string;
  gst_rate: number;
  tcs_rate: number;
  tds_rate: number;
}

export const DEFAULT_SELLER_ANALYTICS_CONFIG: SellerAnalyticsConfig = {
  marketplace_rules: 'Amazon IN / Flipkart',
  tax_regime: 'GST',
  referral_fee_rate: 0.10,
  fba_fee_per_order: 0,
  shipping_fee_per_order: 0,
  storage_fee_per_order: 0,
  other_fees: 0,
  cost_price_rule: 'selling_price * 0.50',
  refund_rule: 'returnAmount',
  gst_rate: 0.18,
  tcs_rate: 0.01,
  tds_rate: 0.01,
};