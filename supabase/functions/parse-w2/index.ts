import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface W2Data {
  employer_name: string;
  employer_ein: string | null;
  wages: number;
  federal_tax_withheld: number;
  social_security_withheld: number;
  medicare_withheld: number;
  state_tax_withheld: number;
  state: string | null;
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

const parseAmount = (raw: string): number => {
  const cleaned = raw.replace(/[,$\s]/g, "");
  const val = Number(cleaned);
  return Number.isFinite(val) && val > 0 ? val : 0;
};

const getMoneyValues = (input: string): number[] => {
  const tokens = input
    .split(/\s+/)
    .map((t) => t.replace(/^[^\d]+|[^\d.]+$/g, ""))
    .filter(Boolean);

  const out: number[] = [];
  for (const token of tokens) {
    if (MONEY_TOKEN_RE.test(token)) {
      const v = parseAmount(token);
      if (v > 0) out.push(v);
    }
  }
  return out;
};

const MONEY_TOKEN_RE = /^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/;

/**
 * Strategy: W-2 PDFs typically contain dollar amounts like 113884.56, 16877.65 etc.
 * We extract ALL dollar-like amounts from the text, then use the known W-2 structure
 * to map them. W-2 boxes are:
 *   Box 1: Wages (largest amount typically)
 *   Box 2: Federal tax withheld
 *   Box 3: Social security wages
 *   Box 4: Social security tax withheld
 *   Box 5: Medicare wages and tips
 *   Box 6: Medicare tax withheld
 *   Box 16: State wages
 *   Box 17: State income tax
 *
 * The text often has the values grouped near their labels. We try label-based extraction
 * first, then fall back to positional/frequency analysis.
 */
const extractW2FromText = (text: string): W2Data => {
  const t = text.replace(/\r\n/g, "\n");

  // EIN
  const einMatch = t.match(/\b(\d{2}-\d{7})\b/);
  const employer_ein = einMatch ? einMatch[1] : null;

  // Employer name: prefer company-like names near EIN and reject address/person lines
  const isCompanyLike = (s: string) =>
    /(LLC|INC|CORP|LTD|COMPANY|CO\b|GROUP|SERVICES|SOLUTIONS|HOLDINGS|ENTERPRISES)/i.test(s);
  const normalizeSpaces = (s: string) => s.replace(/\s+/g, " ").trim();

  let employer_name = "";

  // 0) Direct inline match (single-line text extraction case)
  const inlineEmployer = t.match(/employer['’]?s?\s+name[^A-Z0-9]*([A-Z][A-Z0-9&.,'\-\s]{3,90}?(?:LLC|INC|CORP|LTD|COMPANY|CO|GROUP|SERVICES|SOLUTIONS|HOLDINGS|ENTERPRISES))/i);
  if (inlineEmployer?.[1]) {
    employer_name = normalizeSpaces(inlineEmployer[1]);
  }

  const upperLines = t
    .split(/\r?\n/)
    .map((l) => normalizeSpaces(l))
    .filter(Boolean);

  // 1) Strong match: all-caps business-like line
  const strongCompany = upperLines.find(
    (l) =>
      l.length >= 4 &&
      l.length <= 90 &&
      isCompanyLike(l) &&
      !/^\d+\s/.test(l) &&
      !/,\s*[A-Z]{2}\s+\d{5}/.test(l)
  );
  if (strongCompany) employer_name = strongCompany;

  // 2) If not found, look around EIN neighborhood
  if (!employer_name && employer_ein) {
    const idx = t.indexOf(employer_ein);
    if (idx >= 0) {
      const start = Math.max(0, idx - 250);
      const end = Math.min(t.length, idx + 400);
      const windowLines = t
        .slice(start, end)
        .split(/\r?\n/)
        .map((l) => normalizeSpaces(l))
        .filter(Boolean);

      const candidate = windowLines.find(
        (l) =>
          l.length >= 4 &&
          l.length <= 90 &&
          !/\d{2}-\d{7}/.test(l) &&
          !/^\d+\s/.test(l) &&
          !/,\s*[A-Z]{2}\s+\d{5}/.test(l) &&
          !/^(employee|employer|form|copy|department|omb|wage|tax|statement)/i.test(l)
      );
      if (candidate) employer_name = candidate;
    }
  }

  // Parse decimal money tokens only
  const moneyTokens = getMoneyValues(t);

  // Build frequency map (values usually repeated 2-4x because multiple W-2 copies)
  const freq = new Map<number, number>();
  for (const v of moneyTokens) freq.set(v, (freq.get(v) ?? 0) + 1);

  // Candidate values appearing multiple times are most trustworthy
  const repeatedValues = [...freq.entries()]
    .filter(([, c]) => c >= 2)
    .map(([v]) => v)
    .sort((a, b) => b - a);

  // Ordered extraction anchor: after SSN we usually get Box1/2/3/4 then EIN then Box5/6 ...
  const ssnIdx = t.search(/\b\d{3}-\d{2}-\d{4}\b/);
  const orderedAfterSsn: number[] = [];
  if (ssnIdx >= 0) {
    const tail = t.slice(ssnIdx, Math.min(t.length, ssnIdx + 4000));
    const tailNums = getMoneyValues(tail);
    // collapse consecutive duplicates (same value repeated for copy A/B/C/2)
    for (const n of tailNums) {
      if (orderedAfterSsn.length === 0 || Math.abs(orderedAfterSsn[orderedAfterSsn.length - 1] - n) > 0.005) {
        orderedAfterSsn.push(n);
      }
      if (orderedAfterSsn.length >= 10) break;
    }
  }

  // Label-aware helper: scan ALL label occurrences and pick the most plausible nearby amount
  const pickNearLabel = (labelRegex: RegExp): number => {
    const scoped = new RegExp(labelRegex.source, "gi");
    const candidates: number[] = [];

    let match: RegExpExecArray | null;
    while ((match = scoped.exec(t)) !== null) {
      const start = match.index;
      const window = t.slice(start, Math.min(t.length, start + 450));
      const nums = getMoneyValues(window);
      if (nums.length) candidates.push(...nums.slice(0, 3));
    }

    if (!candidates.length) return 0;
    // Prefer values repeated across copies
    const repeatedHit = candidates.find((n) => (freq.get(n) ?? 0) >= 2);
    return repeatedHit ?? candidates[0];
  };

  // First pass: label-based
  let wages = pickNearLabel(/wages,?\s*tips,?\s*other\s*comp\w*/i);
  let federal_tax_withheld = pickNearLabel(/federal\s+income\s+tax\s+withheld/i);
  let social_security_withheld = pickNearLabel(/social\s+security\s+tax\s+withheld/i);
  let medicare_withheld = pickNearLabel(/medicare\s+tax\s+withheld/i);
  let state_tax_withheld = pickNearLabel(/\b17\s+state\s+income\s+tax|state\s+income\s+tax\b/i);

  // Second pass: ordered extraction from SSN anchor
  // Common order: [box1, box2, box3, box4, box5, box6, box16, box17]
  if (orderedAfterSsn.length >= 2) {
    const b1 = orderedAfterSsn[0] ?? 0;
    const b2 = orderedAfterSsn[1] ?? 0;
    const b4 = orderedAfterSsn[3] ?? 0;
    const b6 = orderedAfterSsn[5] ?? 0;
    const b17 = orderedAfterSsn[7] ?? orderedAfterSsn[6] ?? 0;

    // If order looks plausible, trust it over noisy label matches
    const plausibleFed = b1 > 0 && b2 > b1 * 0.02 && b2 < b1 * 0.45;
    if (plausibleFed) {
      wages = b1;
      federal_tax_withheld = b2;
      if (b4 > 0) social_security_withheld = b4;
      if (b6 > 0) medicare_withheld = b6;
      if (b17 > 0) state_tax_withheld = b17;
    } else {
      if (!wages) wages = b1;
      if (!federal_tax_withheld) federal_tax_withheld = b2;
      if (!social_security_withheld && b4 > 0) social_security_withheld = b4;
      if (!medicare_withheld && b6 > 0) medicare_withheld = b6;
      if (!state_tax_withheld && b17 > 0) state_tax_withheld = b17;
    }
  }

  // Hard fallback if labels/anchor still fail
  if (!wages && repeatedValues.length > 0) {
    wages = repeatedValues[0];
  }

  // Third pass: ratio-based sanity fallback
  if (wages > 0) {
    if (!social_security_withheld) {
      const expected = wages * 0.062;
      const cand = repeatedValues.find((v) => Math.abs(v - expected) / expected < 0.2);
      if (cand) social_security_withheld = cand;
    }
    if (!medicare_withheld) {
      const expected = wages * 0.0145;
      const cand = repeatedValues.find((v) => Math.abs(v - expected) / expected < 0.3);
      if (cand) medicare_withheld = cand;
    }
    if (!federal_tax_withheld) {
      const cand = repeatedValues.find((v) => v > wages * 0.03 && v < wages * 0.4);
      if (cand) federal_tax_withheld = cand;
    }
    if (!state_tax_withheld) {
      const used = new Set([wages, federal_tax_withheld, social_security_withheld, medicare_withheld].map((v) => v?.toFixed(2)));
      const cand = repeatedValues.find((v) => !used.has(v.toFixed(2)) && v < wages * 0.2);
      if (cand) state_tax_withheld = cand;
    }
  }

  // Fourth pass: guardrail correction for common W-2 misreads
  // If wages/federal/SS look impossible, rebuild from repeated value patterns.
  const suspicious =
    wages <= 0 ||
    federal_tax_withheld >= wages * 0.5 ||
    social_security_withheld >= wages * 0.2;

  if (suspicious && repeatedValues.length > 0) {
    const sorted = [...repeatedValues].sort((a, b) => b - a);
    const ssWages = sorted[0] ?? wages;

    // Box 1 wages is often slightly lower than SS wages (box 3) due pre-tax deductions
    const nearSs = sorted.find((v) => v < ssWages && v >= ssWages * 0.75) ?? ssWages;
    wages = nearSs;

    const fed = sorted.find((v) => v > wages * 0.03 && v < wages * 0.4);
    if (fed) federal_tax_withheld = fed;

    const ssExpected = ssWages * 0.062;
    const ssCand = sorted.find((v) => Math.abs(v - ssExpected) / ssExpected < 0.2);
    if (ssCand) social_security_withheld = ssCand;

    const medExpected = ssWages * 0.0145;
    const medCand = sorted.find((v) => Math.abs(v - medExpected) / medExpected < 0.35);
    if (medCand) medicare_withheld = medCand;

    const used = new Set([wages, federal_tax_withheld, social_security_withheld, medicare_withheld].map((v) => v.toFixed(2)));
    const stCand = sorted.find((v) => !used.has(v.toFixed(2)) && v < wages * 0.2);
    if (stCand) state_tax_withheld = stCand;
  }

  // State: prefer state in employer address line near EIN, fallback to any address state
  let state: string | null = null;
  if (employer_ein) {
    const idx = t.indexOf(employer_ein);
    if (idx >= 0) {
      const window = t.slice(Math.max(0, idx - 200), Math.min(t.length, idx + 600));
      const st = window.match(/,\s*([A-Z]{2})\s+\d{5}/);
      if (st && US_STATES.includes(st[1])) state = st[1];
    }
  }
  if (!state) {
    const anyAddrState = t.match(/,\s*([A-Z]{2})\s+\d{5}/);
    if (anyAddrState && US_STATES.includes(anyAddrState[1])) state = anyAddrState[1];
  }

  return {
    employer_name: employer_name || "Unknown Employer",
    employer_ein,
    wages,
    federal_tax_withheld,
    social_security_withheld,
    medicare_withheld,
    state_tax_withheld,
    state,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = (await req.json()) as { text: string };

    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "No text provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const w2Data = extractW2FromText(text);
    console.log(`W-2 parser extracted:`, JSON.stringify(w2Data));

    return new Response(JSON.stringify({ w2: w2Data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-w2 error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
