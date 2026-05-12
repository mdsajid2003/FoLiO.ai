// ── Core domain types ────────────────────────────────────────────

export type Plan = 'free' | 'growth' | 'pro';
export type SubscriptionStatus = 'active' | 'inactive';
export type Confidence = 'high' | 'medium' | 'low';
export type Platform = 'amazon' | 'flipkart';
export type ReliabilityClass = 'deterministic' | 'assumption_based' | 'advisory';
export type CalculationSource = 'csv' | 'derived' | 'mixed';

export interface UserProfile {
  uid: string;
  email: string;
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
}

// ── Unified seller order row (both Amazon & Flipkart) ────────────

/** Parsed row provenance — Amazon flat settlement uses one row per transaction, not per order */
export type SellerOrderRowSource = 'order_level' | 'amazon_transaction_line';

export interface SellerOrderRow {
  platform: Platform;
  orderId: string;
  orderItemId?: string;
  sku: string;
  productName?: string;

  /** When `amazon_transaction_line`, downstream order-based heuristics must not treat rows as 1 row = 1 order */
  rowSource?: SellerOrderRowSource;
  /** Amazon flat settlement: TransactionType after normalisation (Capture, Refund, …) */
  amazonTxKind?: string;

  sellingPrice: number;
  settlement: number;

  referralFee: number;
  fulfillmentFee: number;
  storageFee: number;
  otherFees: number;

  gstCollected: number;
  gstRate: number;
  pos: string;
  sellerState?: string;

  tcsDeducted: number;
  tdsDeducted: number;

  returnAmount: number;

  weight: number;
  declaredWeight: number;
  weightSource: 'parsed' | 'default';

  quantity: number;
  orderDate?: string;
  /** Tax / accrual date when present (Amazon posted-date) */
  postedDate?: string;
  /** Bank payout / release date when present */
  releaseDate?: string;
  /** True when marketplace shows Deferred / Reserved — not yet paid to bank */
  isDeferred?: boolean;
  /** Product dimensions in cm — used for volumetric billed weight */
  length?: number;
  width?: number;
  height?: number;
  /** Volumetric shipping weight (kg) when pre-computed */
  volumetricWeight?: number;
  /** Amazon closing fee component when available in settlement */
  closingFee?: number;
  /** Cost of goods sold per unit (costPrice × quantity = total COGS). Maps to cost_price / unit_cost columns. */
  costPrice?: number;
  /** Already quantity-adjusted total line cost. Maps to total_cost / landed_cost columns. Do NOT multiply by quantity. */
  totalCost?: number;

  /**
   * Line-level `total_revenue` from CSV. When present on all material rows, headline revenue = SUM(this)
   * (not selling_price×qty and not settlement+fees, and gst_amount is not added on top).
   */
  datasetTotalRevenue?: number;
  /** Line-level `profit` from CSV — when present on all material rows, net profit = SUM(this). */
  datasetProfit?: number;
  /** Line-level `total_fees` from CSV — used for fee % when present on all material rows. */
  datasetTotalFees?: number;

  rowIndex: number;
}

/** @deprecated Use SellerOrderRow instead */
export type AmazonRow = SellerOrderRow;

// ── Leakage detection ────────────────────────────────────────────

export type LeakageType =
  | 'weight_slab_error'
  | 'duplicate_charge'
  | 'missing_reimbursement'
  | 'incorrect_referral_fee'
  | 'storage_overcharge'
  | 'closing_fee_not_refunded';

export interface LeakageItem {
  type: LeakageType;
  orderId?: string;
  sku?: string;
  expected: number;
  actual: number;
  diff: number;
  confidence: Confidence;
  description: string;
  /** Plain-English explanation for the seller */
  explanation?: string;
  recoverable?: boolean;
  recoveryProbability?: number;
  effortLevel?: 'low' | 'medium' | 'high';
  estimatedRecoveryTime?: string;
  sourceRows: number[];
  /** Days remaining in Amazon reimbursement claim window (~18 months from order); set for missing_reimbursement when orderDate known */
  claimDeadlineDays?: number;
  /** True when claimDeadlineDays ≤ 30 (urgent window) */
  isExpiringSoon?: boolean;
  isRecoverable?: boolean;
  recoverySteps?: string[];
  estimatedRecoveryDays?: number;
  supportTicketTemplate?: string;
  category?: 'fee_overcharge' | 'missing_reimbursement' | 'gst_mismatch' | 'duplicate_charge';
}

// ── Recovery engine output ────────────────────────────────────────

export interface RecoveryAction {
  type: LeakageType;
  totalAmount: number;
  itemCount: number;
  steps: string[];
  estimatedRecoveryDays: number;
  template: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ReliabilityMetadata {
  classification: ReliabilityClass;
  confidence: Confidence;
  source: CalculationSource;
  assumptions: string[];
}

export interface CalculationProof {
  label: string;
  formula: string;
  explanation: string;
  sourceRowCount: number;
  confidence: Confidence;
  classification?: ReliabilityClass;
  source?: CalculationSource;
  assumptions?: string[];
}

export interface ValidationIssue {
  rowIndex: number;
  field: string;
  severity: 'warning' | 'error';
  rawValue?: string;
  message: string;
}

// ── Fuzzy column matching ─────────────────────────────────────────

export interface ColumnMatchResult {
  rawHeader: string;
  normalizedHeader: string;
  mappedField: string | null;
  similarity: number;
  matchType: 'exact' | 'fuzzy_auto' | 'fuzzy_suggest' | 'unmatched';
  /** The canonical target key that was the closest match */
  suggestion?: string;
}

export interface ColumnMappingSuggestion {
  raw: string;
  suggestedTarget: string;
  mappedField: string;
  similarity: number;
}

export interface ColumnMappingLog {
  results: ColumnMatchResult[];
  autoMappedCount: number;
  suggestedMappings: ColumnMappingSuggestion[];
  unmatchedColumns: string[];
  debugLines: string[];
}

// ── Fallback estimation ───────────────────────────────────────────

export interface EstimatedFieldRecord {
  rowIndex: number;
  field: string;
  estimatedValue: number;
  method: string;
  confidence: 'low';
}

export interface EstimationLog {
  totalEstimatedRows: number;
  estimatedFields: EstimatedFieldRecord[];
}

// ── Dataset questions ─────────────────────────────────────────────

export interface DatasetQuestion {
  id: string;
  question: string;
  context: string;
  options: string[];
  importance: 'critical' | 'high' | 'medium';
  detectedReason: string;
}

export type DetectedSettlementSchema =
  | 'flipkart'
  | 'amazon_v2_multiline'
  | 'amazon_mtr'
  | 'amazon_transaction_flat'
  | 'custom';

export interface DataQualitySummary {
  invalidRowCount: number;
  excludedRowCount: number;
  missingRequiredColumns: string[];
  assumptionsUsed: string[];
  warnings: string[];
  financeGradeReady: boolean;
  issueSample: ValidationIssue[];
  /** Full debug log of header-to-field matching (fuzzy + exact) */
  columnMappingLog?: ColumnMappingLog;
  /** Which row fields were estimated (not from real CSV data) */
  estimationLog?: EstimationLog;
  /** Parser-detected file shape */
  detectedSchema?: DetectedSettlementSchema;
  /** Count of rows per TransactionType (Amazon flat settlement) */
  transactionTypeDistribution?: Record<string, number>;
}

/** Aggregates from Amazon flat settlement (TransactionAmount / TotalTransactionFee / NetTransactionAmount / TransactionType) */
export interface AmazonTransactionMetrics {
  totalCaptureTransactionAmount: number;
  totalRefundTransactionAmount: number;
  totalChargebackTransactionAmount: number;
  totalAdjustmentTransactionAmount: number;
  totalTransactionFees: number;
  netSettlementTotal: number;
  transferRowCount: number;
  reserveOrCarryoverRowCount: number;
  otherRowCount: number;
  parsedTransactionRowCount: number;
}

// ── GST ──────────────────────────────────────────────────────────

export type GstMismatchReason =
  | 'rate_mismatch'
  | 'pos_error'
  | 'tcs_missing'
  | 'igst_vs_cgst'
  | 'itc_mismatch';

export interface GstMismatch {
  orderId: string;
  pos: string;
  expected: number;
  actual: number;
  diff: number;
  gstRate: number;
  reason: GstMismatchReason;
  confidence: Confidence;
}

export interface AmazonFeesGstBreakdown {
  referralFeeGst: number;
  fbaFeeGst: number;
  storageFeeGst: number;
  otherFeeGst: number;
  /** GST embedded in closing fees — claimable as ITC */
  closingFeeGst: number;
  total: number;
}

export interface GstSummary {
  totalOutputTax: number;
  totalInputTaxCredit: number;
  netGstLiability: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  mismatches: GstMismatch[];
  rateBreakdown: { rate: number; taxableValue: number; tax: number; count: number }[];
  itcEligible: number;
  /** GST embedded in Amazon platform fees — claimable as ITC (verify vs tax invoices / GSTR-2B) */
  itcFromAmazonFees: number;
  itcMismatchVsGstr2b?: number;
  /** True when ITC was computed from CSV fees — no GSTR-2B input was provided */
  itcIsEstimated: boolean;
  amazonFeesGstBreakdown: AmazonFeesGstBreakdown;
  gstr1Pointers: string[];
  gstr3bPointers: string[];
  reliability?: ReliabilityMetadata;
}

// ── TCS (Tax Collected at Source) ────────────────────────────────

export interface TcsSummary {
  totalTcsCollected: number;
  totalTcsClaimable: number;
  monthlyBreakdown: { month: string; taxableValue: number; tcs: number }[];
  gstr3bReference: string;
  section: string;
  rate: number;
  reliability?: ReliabilityMetadata;
}

// ── TDS (Tax Deducted at Source) ─────────────────────────────────

export interface TdsSummary {
  totalTdsDeducted: number;
  totalTdsClaimable: number;
  panFurnished: boolean;
  effectiveRate: number;
  monthlyBreakdown: { month: string; grossAmount: number; tds: number }[];
  section: string;
  form26asReference: string;
  reliability?: ReliabilityMetadata;
}

// ── Income Tax Estimator ─────────────────────────────────────────

export interface IncomeTaxEstimate {
  grossRevenue: number;
  totalExpenses: number;
  netProfit: number;
  presumptiveIncome6Pct: number;
  presumptiveIncome8Pct: number;
  taxOnActual: number;
  taxOnPresumptive: number;
  recommendedScheme: 'actual' | 'presumptive_44AD';
  estimatedTax: number;
  tcsCredit: number;
  tdsCredit: number;
  netTaxPayable: number;
  advanceTaxSchedule: { dueDate: string; percentage: number; amount: number }[];
  itrForm: string;
  slabBreakdown: { slab: string; rate: number; tax: number }[];
  regime: 'new';
  /** Indian financial year label, e.g. "FY 2025-26" */
  financialYear?: string;
  /** Whether turnover is within the Section 44AD digital-receipts limit (₹3 Cr) */
  is44ADEligible?: boolean;
  /** True when a mandatory tax audit under Section 44AB applies */
  taxAuditRequired?: boolean;
  /** Plain-English reason for mandatory audit, when applicable */
  taxAuditReason?: string;
  /** Actionable compliance checklist items for filing */
  complianceFlags?: string[];
  reliability?: ReliabilityMetadata;
}

// ── Sales Analytics ──────────────────────────────────────────────

export interface SalesAnalytics {
  grossRevenue: number;
  netRevenue: number;
  momGrowthPct: number;

  grossProfit: number;
  /** Net profit before GST liability deduction (pre-tax) */
  netProfit: number;
  /** Net profit after deducting GST net liability — the actual cash available */
  netProfitAfterGst: number;
  profitMarginPct: number;

  topProductsByRevenue: { sku: string; revenue: number }[];
  topProductsByProfit: { sku: string; profit: number }[];
  worstPerformers: { sku: string; profit: number }[];
  returnRateBySku: { sku: string; returnRate: number; returnAmount: number; orders: number; returnOrders: number }[];

  totalPlatformFees: number;
  feePctOfRevenue: number;
  feeBreakdown: { type: string; amount: number }[];

  avgOrderValue: number;
  ordersPerDay: number;
  totalOrders: number;

  monthlyTrends: MonthlyTrend[];
  categoryBreakdown: { category: string; revenue: number; percentage: number }[];
}

// ── Reconciliation result ────────────────────────────────────────

export interface SkuProfit {
  sku: string;
  revenue: number;
  fees: number;
  returns: number;
  netProfit: number;
}

export interface MonthlyTrend {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
  leakage: number;
  feePercent: number;
  orderCount: number;
  /** True when month assigned by row-order bucketing — no real dates in data */
  isEstimated?: boolean;
}

export interface LeakageSummary {
  type: string;
  amount: number;
  count: number;
  confidence: Confidence;
  description: string;
}

export interface OrderRecon {
  orderId: string;
  product: string;
  mtrGross: number;
  settlement: number;
  gap: number;
  reason: string;
}

export interface WaterfallItem {
  label: string;
  value: number;
  isPositive: boolean;
}

// ── Three-way match (order vs tax vs settlement) ─────────────────

export type MatchStatus = 'matched' | 'mismatch' | 'missing' | 'unclassified';

export interface ThreeWayMatchItem {
  orderId: string;
  sku?: string;
  orderValue: number;
  taxReportValue: number;
  settlementValue: number;
  bankValue?: number;
  orderVsTax: number;
  taxVsSettlement: number;
  settlementVsBank?: number;
  status: MatchStatus;
  mismatchCause?: string;
  confidence: Confidence;
  sourceRows: number[];
}

export interface ThreeWayMatchSummary {
  items: ThreeWayMatchItem[];
  totalMatched: number;
  totalMismatched: number;
  unexplainedVariance: number;
  classifiedVariance: number;
  matchRate: number;
}

// ── Profit simulator ─────────────────────────────────────────────

export interface ProfitInput {
  sellingPrice: number;
  costOfGoods: number;
  gstRate: number;
  category: string;
  weightKg: number;
  isFBA: boolean;
}

export interface ProfitBreakdown {
  sellingPrice: number;
  gstOnSale: number;
  taxableSellingPrice: number;
  referralFee: number;
  fbaFee: number;
  gstOnFees: number;
  tcsDeducted: number;
  tdsDeducted: number;
  totalDeductions: number;
  netPayout: number;
  costOfGoods: number;
  grossProfit: number;
  netProfit: number;
  profitMarginPct: number;
  /** Minimum selling price to break even. -1 = no viable price at this fee/GST/category. */
  breakeven: number;
  recommendation: string;
  isViable: boolean;
}

// ── Invariant checks ────────────────────────────────────────────

export interface InvariantCheck {
  name: string;
  formula: string;
  expected: number;
  actual: number;
  difference: number;
  withinTolerance: boolean;
  tolerance: number;
  passed: boolean;
  severity: 'critical' | 'warning' | 'info';
  explanation: string;
}

export interface InvariantReport {
  checks: InvariantCheck[];
  allPassed: boolean;
  criticalFailures: number;
  warnings: number;
}

// ── Data integrity ──────────────────────────────────────────────

export interface DataIntegrityRecord {
  filename: string;
  uploadedAt: string;
  rowCount: number;
  checksum: string;
  firstRowHash: string;
  lastRowHash: string;
}

export interface IntegrityCheck {
  matches: boolean;
  previousChecksum?: string;
  currentChecksum: string;
  changeDetected: boolean;
  message: string;
}

export type ConfigAnalyticsReportQuality = 'exact' | 'estimated' | 'incomplete';

/** CONFIG-first seller analytics (parallel to settlement-derived totals). Never replaces GST from invoices — see `taxFromConfig`. */
export interface ConfigBasedSellerAnalytics {
  marketplace_rules: string;
  tax_regime: string;
  reportQuality: ConfigAnalyticsReportQuality;
  /** Plain-language transparency for the seller */
  explanations: string[];
  /** Missing columns / rules that could not be evaluated strictly */
  dataGaps: string[];
  /** Keys map to human-readable formula strings (editable via CONFIG) */
  formulasUsed: Record<string, string>;
  totals: {
    revenue: number;
    referralFee: number;
    referralFeeSource: 'dataset' | 'estimated' | 'mixed';
    totalFees: number;
    refundAmount: number;
    totalCost: number | null;
    netPayout: number;
    /** Null when cost cannot be derived for one or more material rows — do not show as exact profit */
    netProfit: number | null;
    profitMargin: number | null;
  };
  /** Advisory: rates from CONFIG, not GSTR-2B */
  taxFromConfig: {
    gst_output: number;
    gst_input: number | null;
    net_gst_liability: number | null;
    tcs_amount: number;
    tds_amount: number;
  };
  monthly: {
    monthKey: string;
    monthLabel: string;
    revenue: number;
    feesTotal: number;
    refundTotal: number;
    netPayout: number;
    totalCost: number | null;
    netProfit: number | null;
    orderCount: number;
  }[];
  topSkusByRevenue: { sku: string; revenue: number }[];
  topSkusByProfit: { sku: string; netProfit: number | null; netPayout: number }[];
  returnHeavySkus: { sku: string; returnRatio: number; refundAmount: number }[];
  feeHeavySkus: { sku: string; feeRatio: number; fees: number }[];
}

export interface ReconciliationReport {
  reportId?: string;
  filename: string;
  platform: Platform | 'mixed';
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  recoverableLeakage: number;
  tcsCollected: number;
  tcsClaimable: number;
  gstMismatchCount: number;
  confidence: Confidence;
  narrative: string;

  leakageBreakdown: LeakageSummary[];
  leakageItems: LeakageItem[];
  gstMismatches: GstMismatch[];
  skuProfitability: SkuProfit[];
  monthlyTrends: MonthlyTrend[];
  orderRecon: OrderRecon[];
  waterfall: WaterfallItem[];

  gstSummary?: GstSummary;
  tcsSummary?: TcsSummary;
  tdsSummary?: TdsSummary;
  incomeTaxEstimate?: IncomeTaxEstimate;
  salesAnalytics?: SalesAnalytics;

  recoveryActions?: RecoveryAction[];
  totalRecoverableAmount?: number;
  totalNonRecoverableAmount?: number;
  calculationProofs?: Record<string, CalculationProof>;
  dataQuality?: DataQualitySummary;
  /** Contextual questions generated after parsing — user should confirm for accuracy */
  datasetQuestions?: DatasetQuestion[];
  /** Present when report was built from Amazon flat transaction settlement rows */
  amazonTransactionMetrics?: AmazonTransactionMetrics;

  threeWayMatch?: ThreeWayMatchSummary;
  invariantReport?: InvariantReport;
  /** Sum of settlement on deferred / reserve rows — not yet in bank */
  deferredAmount?: number;

  analysisSource?: 'deterministic' | 'ai_assisted';

  /** CONFIG-driven rollups: separates net payout vs net profit; flags estimates vs exact */
  configBasedAnalytics?: ConfigBasedSellerAnalytics;

  createdAt: string;
  rowCount: number;
}

// ── Queue job ────────────────────────────────────────────────────

export interface ReconciliationJob {
  filename: string;
  data: string;
  userId: string;
  timestamp: string;
  /** User-confirmed column overrides: { "raw CSV header" → "fieldName" } */
  columnOverrides?: Record<string, string>;
  /** User's GST-registered state code (2-letter, e.g. "MH"). Used for IGST/CGST/SGST split. */
  sellerRegisteredState?: string;
}

// ── AI fallback types ────────────────────────────────────────────

export interface AiUsageRecord {
  count: number;
  monthKey: string;
  limit: number;
}

export interface ExtractedCsvData {
  dataType: string;
  columns: { name: string; type: 'numeric' | 'text' | 'date'; sample: string }[];
  financialColumns: { name: string; total: number; currency: string }[];
  rowCount: number;
  dateRange?: { earliest: string; latest: string };
  platform?: string;
  keyObservations: string[];
}
