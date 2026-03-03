// 2026 tax estimation helper
// Uses simplified federal brackets + state flat rates for estimation purposes.

const SOCIAL_SECURITY_RATE = 0.062;
const SOCIAL_SECURITY_WAGE_BASE = 176_100; // 2026 projected
const MEDICARE_RATE = 0.0145;
const ADDITIONAL_MEDICARE_RATE = 0.009; // over $200k

// ── Filing status types ──
export type FilingStatus = "single" | "married_joint" | "married_separate" | "head_of_household";

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: "Single",
  married_joint: "Married Filing Jointly",
  married_separate: "Married Filing Separately",
  head_of_household: "Head of Household",
};

// ── 2026 projected federal brackets by filing status ──
// Inflation-adjusted from 2025 (~2.8% CPI projection)
const FEDERAL_BRACKETS: Record<FilingStatus, [number, number][]> = {
  single: [
    [12_250, 0.10],
    [49_825, 0.12],
    [106_250, 0.22],
    [202_850, 0.24],
    [257_550, 0.32],
    [643_900, 0.35],
    [Infinity, 0.37],
  ],
  married_joint: [
    [24_500, 0.10],
    [99_650, 0.12],
    [212_500, 0.22],
    [405_700, 0.24],
    [515_100, 0.32],
    [773_250, 0.35],
    [Infinity, 0.37],
  ],
  married_separate: [
    [12_250, 0.10],
    [49_825, 0.12],
    [106_250, 0.22],
    [202_850, 0.24],
    [257_550, 0.32],
    [386_625, 0.35],
    [Infinity, 0.37],
  ],
  head_of_household: [
    [17_450, 0.10],
    [66_700, 0.12],
    [106_250, 0.22],
    [202_850, 0.24],
    [257_550, 0.32],
    [643_900, 0.35],
    [Infinity, 0.37],
  ],
};

// Standard deduction by filing status (2026 projected)
export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 16_150,
  married_joint: 32_300,
  married_separate: 16_150,
  head_of_household: 24_200,
};

// State income tax rates (simplified flat/effective rates)
export const STATE_RATES: Record<string, number> = {
  AL: 0.04, AK: 0, AZ: 0.025, AR: 0.039, CA: 0.0725,
  CO: 0.044, CT: 0.05, DE: 0.055, FL: 0, GA: 0.0549,
  HI: 0.065, ID: 0.058, IL: 0.0495, IN: 0.0305, IA: 0.038,
  KS: 0.046, KY: 0.04, LA: 0.0425, ME: 0.0575, MD: 0.05,
  MA: 0.05, MI: 0.0425, MN: 0.0535, MS: 0.047, MO: 0.048,
  MT: 0.059, NE: 0.0564, NV: 0, NH: 0, NJ: 0.055,
  NM: 0.049, NY: 0.0685, NC: 0.0425, ND: 0.0195, OH: 0.035,
  OK: 0.0475, OR: 0.0875, PA: 0.0307, RI: 0.0475, SC: 0.064,
  SD: 0, TN: 0, TX: 0, UT: 0.0465, VT: 0.066,
  VA: 0.0575, WA: 0, WV: 0.0512, WI: 0.0465, WY: 0,
  DC: 0.065,
};

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL",
  "GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI",
  "SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
] as const;

// ── IRS standard mileage rate for 2026 (projected) ──
export const MILEAGE_RATE_2026 = 0.70; // $0.70/mile

// ── Home office simplified method ──
export const HOME_OFFICE_RATE = 5; // $5/sqft
export const HOME_OFFICE_MAX_SQFT = 300; // max 300 sqft = $1,500

function calcFederalWithholding(salary: number, filingStatus: FilingStatus = "single"): number {
  const deduction = STANDARD_DEDUCTION[filingStatus];
  const brackets = FEDERAL_BRACKETS[filingStatus];
  const taxable = Math.max(0, salary - deduction);
  let tax = 0;
  let prev = 0;
  for (const [upper, rate] of brackets) {
    const bracketIncome = Math.min(taxable, upper) - prev;
    if (bracketIncome <= 0) break;
    tax += bracketIncome * rate;
    prev = upper;
  }
  return Math.round(tax * 100) / 100;
}

export interface WithholdingResult {
  federalWithholding: number;
  stateWithholding: number;
  socialSecurity: number;
  medicare: number;
}

export function calculateWithholdings(
  salary: number,
  state: string,
  filingStatus: FilingStatus = "single"
): WithholdingResult {
  const federalWithholding = calcFederalWithholding(salary, filingStatus);
  const stateRate = STATE_RATES[state.toUpperCase()] ?? 0;
  const stateWithholding = Math.round(salary * stateRate * 100) / 100;
  const ssWages = Math.min(salary, SOCIAL_SECURITY_WAGE_BASE);
  const socialSecurity = Math.round(ssWages * SOCIAL_SECURITY_RATE * 100) / 100;
  const medicareBase = Math.round(salary * MEDICARE_RATE * 100) / 100;
  const medicareAdditional = salary > 200_000
    ? Math.round((salary - 200_000) * ADDITIONAL_MEDICARE_RATE * 100) / 100
    : 0;
  const medicare = medicareBase + medicareAdditional;

  return { federalWithholding, stateWithholding, socialSecurity, medicare };
}

// ── QBI (Qualified Business Income) §199A deduction ──
// Simplified: 20% of QBI for sole proprietors under income threshold
const QBI_THRESHOLD: Record<FilingStatus, number> = {
  single: 191_950,
  married_joint: 383_900,
  married_separate: 191_950,
  head_of_household: 191_950,
};

export function calculateQBI(
  netIncome: number,
  filingStatus: FilingStatus = "single"
): number {
  if (netIncome <= 0) return 0;
  const threshold = QBI_THRESHOLD[filingStatus];
  // Under threshold: full 20% deduction. Over: phaseout (simplified as 0 for now)
  if (netIncome > threshold) return 0;
  return Math.round(netIncome * 0.20 * 100) / 100;
}

// ── Home Office deduction (simplified method) ──
export function calculateHomeOffice(squareFeet: number): number {
  const sqft = Math.min(squareFeet, HOME_OFFICE_MAX_SQFT);
  return sqft * HOME_OFFICE_RATE;
}

// ── Vehicle/mileage deduction ──
export function calculateMileageDeduction(miles: number): number {
  return Math.round(miles * MILEAGE_RATE_2026 * 100) / 100;
}
