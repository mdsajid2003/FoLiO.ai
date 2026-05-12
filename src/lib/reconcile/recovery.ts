import { LeakageItem, LeakageType, RecoveryAction } from '../../types/index.ts';

type RecoveryEntry = {
  recoverable: boolean;
  priority: 'high' | 'medium' | 'low';
  estimatedDays: number;
  steps: string[];
  templateFn: (totalAmount: number, count: number, platform: string) => string;
  recoveryProbability?: number;
  effortLevel?: 'low' | 'medium' | 'high';
};

const RECOVERY_CONFIG: Record<LeakageType, RecoveryEntry> = {
  weight_slab_error: {
    recoverable: true,
    priority: 'high',
    estimatedDays: 14,
    recoveryProbability: 78,
    effortLevel: 'medium',
    steps: [
      'Go to Seller Central → Help → Contact Us',
      'Select "Fulfillment by Amazon" → "FBA Issue"',
      'Choose "Incorrect weight/dimensions charged"',
      'Attach proof: product listing weight vs charged weight',
      'Reference order IDs from the leakage report',
      'Amazon typically resolves within 7-14 business days',
    ],
    templateFn: (amount, count, platform) =>
      `Dear ${platform} Seller Support,\n\nI have identified ${count} order(s) where the fulfillment fee was charged at an incorrect weight slab. The total overcharge amount is ₹${amount.toLocaleString('en-IN')}.\n\nThe declared/catalogue weight for these items does not match the weight used for fee calculation. Please review and process the reimbursement.\n\nOrder details are attached.\n\nThank you.`,
  },

  duplicate_charge: {
    recoverable: true,
    priority: 'high',
    estimatedDays: 7,
    recoveryProbability: 92,
    effortLevel: 'low',
    steps: [
      'Go to Seller Central → Reports → Payments → Transaction View',
      'Filter by the order IDs flagged in this report',
      'Verify that the same referral fee appears more than once',
      'Open a case under "Payments" → "Incorrect deductions"',
      'Attach transaction details showing duplicate entries',
    ],
    templateFn: (amount, count, platform) =>
      `Dear ${platform} Seller Support,\n\nI have found ${count} instance(s) of duplicate referral fee charges totaling ₹${amount.toLocaleString('en-IN')}. The same fee was deducted multiple times for the same order + SKU combination.\n\nPlease review and reimburse the duplicate charges.\n\nOrder details are attached.\n\nThank you.`,
  },

  missing_reimbursement: {
    recoverable: true,
    priority: 'high',
    estimatedDays: 21,
    recoveryProbability: 65,
    effortLevel: 'medium',
    steps: [
      'Go to Seller Central → Inventory → FBA Inventory',
      'Check "Lost and damaged" or "Customer returns" section',
      'Identify returned orders with no corresponding reimbursement credit',
      'Open case: Reports → Fulfillment → Reimbursements',
      'Request reimbursement for each unmatched return',
      "Note: Amazon's claim window is approximately 18 months (548 days) from the order date — file promptly.",
    ],
    templateFn: (amount, count, platform) =>
      `Dear ${platform} Seller Support,\n\nI have identified ${count} customer return(s) totaling ₹${amount.toLocaleString('en-IN')} where no reimbursement or settlement credit was received.\n\nThese orders show a return processed on the customer side, but no corresponding credit in my settlement report. Please investigate and process the reimbursement.\n\nOrder details are attached.\n\nThank you.`,
  },

  incorrect_referral_fee: {
    recoverable: true,
    priority: 'medium',
    estimatedDays: 14,
    recoveryProbability: 45,
    effortLevel: 'high',
    steps: [
      'Go to Seller Central → Help → Contact Us',
      'Select "Selling on Amazon" → "Fees and charges"',
      'Reference the published referral fee rate for your product category',
      'Compare with the actual fee charged per the settlement report',
      'Provide order IDs and expected vs actual fee amounts',
    ],
    templateFn: (amount, count, platform) =>
      `Dear ${platform} Seller Support,\n\nI have found ${count} order(s) where the referral fee charged (₹${amount.toLocaleString('en-IN')} total overage) exceeds the published rate for the product category.\n\nPlease review the fee calculation and process any correction.\n\nOrder details are attached.\n\nThank you.`,
  },

  storage_overcharge: {
    recoverable: false,
    priority: 'low',
    estimatedDays: 30,
    recoveryProbability: 10,
    effortLevel: 'low',
    steps: [
      'Review inventory age report in Seller Central',
      'Check for excess/aged inventory incurring long-term storage fees',
      'Consider creating a removal order for slow-moving inventory',
      'Verify storage fee calculation matches current FBA storage rates',
    ],
    templateFn: (amount, count, _platform) =>
      `Storage fees of ₹${amount.toLocaleString('en-IN')} across ${count} item(s) appear higher than expected. Review inventory age and consider removal orders for slow-moving stock.`,
  },

  closing_fee_not_refunded: {
    recoverable: false,
    priority: 'low',
    estimatedDays: 0,
    recoveryProbability: 0,
    effortLevel: 'low',
    steps: [
      'Closing fee refunds were discontinued by Amazon after February 2024.',
      'Review your account terms in Seller Central → Help → Policies.',
      'This amount is not recoverable under current policy.',
      'Factor this cost into your return rate pricing model.',
    ],
    templateFn: (_amount, _count, _platform) =>
      'Closing fee refund not applicable under current Amazon policy.',
  },
};

export function computeRecoveryActions(
  leakageItems: LeakageItem[],
  platform: string = 'Amazon',
): { actions: RecoveryAction[]; totalRecoverable: number; totalNonRecoverable: number; enrichedItems: LeakageItem[] } {
  const grouped = new Map<LeakageType, LeakageItem[]>();

  for (const item of leakageItems) {
    const list = grouped.get(item.type) ?? [];
    list.push(item);
    grouped.set(item.type, list);
  }

  const actions: RecoveryAction[] = [];
  let totalRecoverable = 0;
  let totalNonRecoverable = 0;

  const enrichedItems: LeakageItem[] = leakageItems.map(item => {
    const config = RECOVERY_CONFIG[item.type];
    const days = config.estimatedDays;
    const recoverable = item.recoverable ?? config.recoverable;
    return {
      ...item,
      isRecoverable: recoverable,
      recoverable,
      explanation: item.explanation ?? item.description,
      recoverySteps: config.steps,
      estimatedRecoveryDays: config.estimatedDays,
      recoveryProbability: config.recoveryProbability,
      effortLevel: config.effortLevel,
      estimatedRecoveryTime: days > 0 ? `${days} business days (typical)` : undefined,
      supportTicketTemplate: config.templateFn(item.diff, 1, platform),
      category: mapToCategory(item.type),
    };
  });

  for (const it of enrichedItems) {
    if (it.recoverable) totalRecoverable += it.diff;
    else totalNonRecoverable += it.diff;
  }

  for (const [type, items] of grouped) {
    const config = RECOVERY_CONFIG[type];
    const totalAmount = items.reduce((s, i) => s + i.diff, 0);

    actions.push({
      type,
      totalAmount: Math.round(totalAmount * 100) / 100,
      itemCount: items.length,
      steps: config.steps,
      estimatedRecoveryDays: config.estimatedDays,
      template: config.templateFn(Math.round(totalAmount), items.length, platform),
      priority: config.priority,
    });
  }

  actions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority] || b.totalAmount - a.totalAmount;
  });

  return {
    actions,
    totalRecoverable: Math.round(totalRecoverable * 100) / 100,
    totalNonRecoverable: Math.round(totalNonRecoverable * 100) / 100,
    enrichedItems,
  };
}

function mapToCategory(type: LeakageType): LeakageItem['category'] {
  switch (type) {
    case 'weight_slab_error':
    case 'incorrect_referral_fee':
    case 'storage_overcharge':
    case 'closing_fee_not_refunded':
      return 'fee_overcharge';
    case 'missing_reimbursement':
      return 'missing_reimbursement';
    case 'duplicate_charge':
      return 'duplicate_charge';
    default:
      return 'fee_overcharge';
  }
}
