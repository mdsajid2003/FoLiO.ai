// FBA weight slabs — Amazon India Standard-Size Pick & Pack.
// Updated: September 1, 2025. Verify at https://sellercentral.amazon.in before disputes.
// To update: edit this file only — no other source files need to change.
export const WEIGHT_SLABS: Array<{ maxKg: number; fee: number; extraPer500g: number }> = [
  { maxKg: 0.5,      fee: 17, extraPer500g: 0 },
  { maxKg: 1.0,      fee: 17, extraPer500g: 0 },
  { maxKg: 1.5,      fee: 22, extraPer500g: 0 },
  { maxKg: 2.0,      fee: 27, extraPer500g: 0 },
  { maxKg: 2.5,      fee: 32, extraPer500g: 0 },
  { maxKg: 3.0,      fee: 37, extraPer500g: 0 },
  { maxKg: 3.5,      fee: 42, extraPer500g: 0 },
  { maxKg: 4.0,      fee: 47, extraPer500g: 0 },
  { maxKg: 4.5,      fee: 52, extraPer500g: 0 },
  { maxKg: 5.0,      fee: 57, extraPer500g: 0 },
  { maxKg: Infinity, fee: 57, extraPer500g: 2 }, // +₹2 per 500g above 5kg (Sept 2025)
];

export const SLABS_LAST_UPDATED = '2025-09-01';
export const SLABS_SOURCE = 'https://sellercentral.amazon.in';
