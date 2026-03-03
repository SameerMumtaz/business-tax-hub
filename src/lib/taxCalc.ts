// 2026 tax estimation helper
// Uses simplified federal brackets + state flat rates for estimation purposes.
// These are approximations — real withholding depends on W-4, filing status, etc.

const SOCIAL_SECURITY_RATE = 0.062;
const SOCIAL_SECURITY_WAGE_BASE = 168_600; // 2025 base (adjust when IRS publishes 2026)
const MEDICARE_RATE = 0.0145;
const ADDITIONAL_MEDICARE_RATE = 0.009; // over $200k

// Simplified 2025 federal brackets (single filer, standard deduction ~$15,700)
const FEDERAL_BRACKETS: [number, number][] = [
  [11_925, 0.10],
  [48_475, 0.12],
  [103_350, 0.22],
  [197_300, 0.24],
  [250_525, 0.32],
  [626_350, 0.35],
  [Infinity, 0.37],
];

// State income tax rates (simplified flat/effective rates)
// States with no income tax have 0
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

function calcFederalWithholding(salary: number): number {
  // Apply approximate standard deduction
  const taxable = Math.max(0, salary - 15_700);
  let tax = 0;
  let prev = 0;
  for (const [upper, rate] of FEDERAL_BRACKETS) {
    const bracketIncome = Math.min(taxable, upper) - prev;
    if (bracketIncome <= 0) break;
    tax += bracketIncome * rate;
    prev = upper;
  }
  return Math.round(tax * 100) / 100;
}

export function calculateWithholdings(salary: number, state: string) {
  const federalWithholding = calcFederalWithholding(salary);
  const stateRate = STATE_RATES[state.toUpperCase()] ?? 0;
  const stateWithholding = Math.round(salary * stateRate * 100) / 100;
  const ssWages = Math.min(salary, SOCIAL_SECURITY_WAGE_BASE);
  const socialSecurity = Math.round(ssWages * SOCIAL_SECURITY_RATE * 100) / 100;
  const medicareBase = Math.round(salary * MEDICARE_RATE * 100) / 100;
  const medicareAdditional = salary > 200_000 ? Math.round((salary - 200_000) * ADDITIONAL_MEDICARE_RATE * 100) / 100 : 0;
  const medicare = medicareBase + medicareAdditional;

  return { federalWithholding, stateWithholding, socialSecurity, medicare };
}
