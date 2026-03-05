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

  // --- EIN: XX-XXXXXXX ---
  let employer_ein: string | null = null;
  const einMatch = t.match(/\b(\d{2}-\d{7})\b/);
  if (einMatch) employer_ein = einMatch[1];

  // --- Employer name ---
  let employer_name = "";
  // Look for text near "Employer's name" label or near the EIN
  const empPatterns = [
    /employer['']?s?\s+name[,\s]+address[^]*?\n\s*([A-Z][A-Za-z\s&.,'\-]{2,60}(?:LLC|Inc|Corp|Ltd|Company|Co|Services|Group|Solutions)?)/i,
    /employer identification number[^]*?\n[^]*?\n\s*([A-Z][A-Za-z\s&.,'\-]{2,60}(?:LLC|Inc|Corp|Ltd|Company|Co|Services|Group|Solutions)?)/i,
  ];
  for (const pat of empPatterns) {
    const m = t.match(pat);
    if (m && m[1]) {
      const name = m[1].replace(/\d{2}-\d{7}/, "").trim();
      if (name.length > 2) { employer_name = name; break; }
    }
  }
  // Fallback: find company-like names (all caps with LLC/Inc etc.)
  if (!employer_name) {
    const companyMatch = t.match(/\b([A-Z][A-Z\s&.,'\-]{3,50}(?:LLC|INC|CORP|LTD|COMPANY|CO|SERVICES|GROUP|SOLUTIONS))\b/);
    if (companyMatch) employer_name = companyMatch[1].trim();
  }

  // --- Extract all dollar amounts (XX.XX format with at least 2 digits before decimal) ---
  const amountRegex = /\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g;
  const allAmounts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = amountRegex.exec(t)) !== null) {
    const val = parseAmount(m[1]);
    if (val >= 1) allAmounts.push(val); // Ignore tiny values like 0.xx
  }

  // Deduplicate - W-2 PDFs repeat values across copies (Copy A, B, C, 2)
  // Count occurrences of each amount
  const freq: Record<string, number> = {};
  allAmounts.forEach((a) => {
    const key = a.toFixed(2);
    freq[key] = (freq[key] || 0) + 1;
  });

  // Get unique amounts sorted by value descending
  const uniqueAmounts = [...new Set(allAmounts.map(a => a.toFixed(2)))]
    .map(Number)
    .sort((a, b) => b - a);

  console.log("Unique amounts found:", uniqueAmounts);

  // --- Try label-proximity extraction ---
  // For each box, look for the label followed eventually by a dollar amount
  const findNearLabel = (labels: RegExp[]): number => {
    for (const label of labels) {
      const match = label.exec(t);
      if (!match) continue;
      // Look ahead from the match position for the next dollar amount
      const after = t.slice(match.index! + match[0].length, match.index! + match[0].length + 300);
      const amMatch = after.match(/\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/);
      if (amMatch) {
        const val = parseAmount(amMatch[1]);
        if (val >= 1) return val;
      }
    }
    return 0;
  };

  let wages = findNearLabel([
    /wages,?\s*tips,?\s*other\s*comp\w*/i,
    /\b1\s+wages/i,
  ]);
  let fedWithheld = findNearLabel([
    /federal\s+income\s+tax\s+withheld/i,
  ]);
  let ssWages = findNearLabel([
    /social\s+security\s+wages/i,
    /\b3\s+social\s+security\s+wages/i,
  ]);
  let ssWithheld = findNearLabel([
    /social\s+security\s+tax\s+withheld/i,
  ]);
  let medicareWages = findNearLabel([
    /medicare\s+wages\s+and\s+tips/i,
  ]);
  let medicareWithheld = findNearLabel([
    /medicare\s+tax\s+withheld/i,
  ]);
  let stateWithheld = findNearLabel([
    /state\s+income\s+tax\b/i,
    /\b17\s+state\s+income\s+tax/i,
  ]);

  // --- If label-proximity failed, use heuristic mapping ---
  // W-2 amounts follow a known pattern by magnitude:
  // Wages ≈ SS wages ≈ Medicare wages (largest, roughly equal)
  // Federal withheld (medium, ~10-25% of wages)
  // SS withheld (~6.2% of SS wages)
  // Medicare withheld (~1.45% of Medicare wages)
  // State withheld (varies)
  if (wages === 0 && uniqueAmounts.length >= 3) {
    // Group amounts by approximate magnitude
    const largest = uniqueAmounts[0];

    // Wages group: amounts within 15% of the largest
    const wageGroup = uniqueAmounts.filter(a => a >= largest * 0.85);

    // Find the most common large amount - that's likely wages/SS wages/Medicare wages
    // The others are withholdings
    const nonWage = uniqueAmounts.filter(a => a < largest * 0.85);

    wages = largest;

    // Federal withheld: largest of the non-wage amounts, typically 10-25% of wages
    const fedCandidates = nonWage.filter(a => a > largest * 0.05 && a < largest * 0.35);
    if (fedCandidates.length > 0) fedWithheld = fedCandidates[0];

    // SS withheld: ~6.2% of wages (look for amount close to wages * 0.062)
    const expectedSS = largest * 0.062;
    const ssCandidates = nonWage.filter(a => Math.abs(a - expectedSS) / expectedSS < 0.15);
    if (ssCandidates.length > 0) ssWithheld = ssCandidates[0];

    // Medicare withheld: ~1.45% of wages
    const expectedMed = largest * 0.0145;
    const medCandidates = nonWage.filter(a => Math.abs(a - expectedMed) / expectedMed < 0.25);
    if (medCandidates.length > 0) medicareWithheld = medCandidates[0];

    // State withheld: remaining medium amount
    const assigned = new Set([wages, fedWithheld, ssWithheld, medicareWithheld].filter(Boolean).map(v => v.toFixed(2)));
    // Also exclude amounts that match wage group
    wageGroup.forEach(a => assigned.add(a.toFixed(2)));
    const remaining = nonWage.filter(a => !assigned.has(a.toFixed(2)));
    if (remaining.length > 0) stateWithheld = remaining[0];
  }

  // --- State ---
  let state: string | null = null;
  // Look near "State" or "Employer's state ID" labels
  const stateSection = t.match(/(?:15\s+state|employer['']?s?\s+state\s+id)[^]*?(\b[A-Z]{2}\b)/i);
  if (stateSection) {
    const candidate = stateSection[1].toUpperCase();
    if (US_STATES.includes(candidate)) state = candidate;
  }
  // Fallback: look for state abbreviations in address lines (2-letter followed by ZIP)
  if (!state) {
    const addrState = t.match(/,\s*([A-Z]{2})\s+\d{5}/);
    if (addrState && US_STATES.includes(addrState[1])) state = addrState[1];
  }

  return {
    employer_name: employer_name || "Unknown Employer",
    employer_ein,
    wages,
    federal_tax_withheld: fedWithheld,
    social_security_withheld: ssWithheld,
    medicare_withheld: medicareWithheld,
    state_tax_withheld: stateWithheld,
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
