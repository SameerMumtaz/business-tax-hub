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

interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
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
  return Number.isFinite(val) && val >= 0 ? val : 0;
};

/**
 * Strategy 1: Extract from named PDF form fields.
 * Many payroll-generated W-2 PDFs are fillable with named fields.
 */
const extractFromFormFields = (fields: Record<string, string>): W2Data | null => {
  const keys = Object.keys(fields);
  if (keys.length < 3) return null;

  const find = (patterns: RegExp[]): string => {
    for (const p of patterns) {
      const key = keys.find((k) => p.test(k));
      if (key && fields[key]) return fields[key];
    }
    return "";
  };

  const wages = parseAmount(find([/box\s*1\b/i, /wages/i, /compensation/i]));
  if (wages <= 0) return null; // form fields don't look useful

  return {
    employer_name: find([/employer.*name/i, /company/i]) || "Unknown Employer",
    employer_ein: find([/ein\b/i, /employer.*id/i]) || null,
    wages,
    federal_tax_withheld: parseAmount(find([/box\s*2\b/i, /federal.*tax.*with/i])),
    social_security_withheld: parseAmount(find([/box\s*4\b/i, /social.*security.*tax/i, /ss.*tax/i])),
    medicare_withheld: parseAmount(find([/box\s*6\b/i, /medicare.*tax/i])),
    state_tax_withheld: parseAmount(find([/box\s*17\b/i, /state.*tax.*with/i, /state.*income.*tax/i])),
    state: find([/box\s*15\b/i, /state\b/i]).match(/[A-Z]{2}/)?.[0] ?? null,
  };
};

/**
 * Strategy 2: Spatial/coordinate-based extraction.
 * 
 * The W-2 form has a standardized IRS layout. We find labeled regions
 * and extract the nearest value to the right or below each label.
 * 
 * Standard W-2 box labels:
 *   Box 1:  "Wages, tips, other compensation"
 *   Box 2:  "Federal income tax withheld"  
 *   Box 3:  "Social security wages"
 *   Box 4:  "Social security tax withheld"
 *   Box 5:  "Medicare wages and tips"
 *   Box 6:  "Medicare tax withheld"
 *   Box 15: "State / Employer's state ID number"
 *   Box 16: "State wages, tips, etc."
 *   Box 17: "State income tax"
 */
const extractSpatial = (items: TextItem[], pageWidth: number, pageHeight: number): W2Data => {
  // Normalize coordinates to percentages of page dimensions for format independence
  const normalized = items.map((it) => ({
    text: it.text,
    xPct: it.x / pageWidth,
    yPct: it.y / pageHeight,
    wPct: it.width / pageWidth,
  }));

  console.log("Spatial items sample (first 50):", JSON.stringify(normalized.slice(0, 50)));

  // Helper: find items whose text matches a pattern
  const findLabels = (pattern: RegExp): typeof normalized => {
    // First try to find labels by matching individual items
    const direct = normalized.filter((it) => pattern.test(it.text));
    if (direct.length > 0) return direct;

    // Try combining adjacent items on the same line for multi-item labels
    const combined: typeof normalized = [];
    const sorted = [...normalized].sort((a, b) => a.yPct - b.yPct || a.xPct - b.xPct);
    for (let i = 0; i < sorted.length; i++) {
      let joined = sorted[i].text;
      let lastX = sorted[i].xPct + sorted[i].wPct;
      for (let j = i + 1; j < Math.min(i + 6, sorted.length); j++) {
        // Same line (within 1% vertically) and close horizontally
        if (Math.abs(sorted[j].yPct - sorted[i].yPct) < 0.015 && sorted[j].xPct - lastX < 0.05) {
          joined += " " + sorted[j].text;
          lastX = sorted[j].xPct + sorted[j].wPct;
          if (pattern.test(joined)) {
            combined.push({ ...sorted[i], text: joined });
            break;
          }
        } else break;
      }
    }
    return combined;
  };

  // Helper: find the best money value near a label position
  // Look to the right on the same line, or below in the same column
  const findValueNear = (labelX: number, labelY: number, direction: "right" | "below" | "both" = "both"): number => {
    const candidates: { val: number; dist: number }[] = [];

    for (const it of normalized) {
      const val = parseAmount(it.text.replace(/[$,]/g, ""));
      if (val <= 0 || !/[\d]/.test(it.text)) continue;

      const dx = it.xPct - labelX;
      const dy = it.yPct - labelY;

      if (direction === "right" || direction === "both") {
        // Same line (within 2% vertically), to the right
        if (Math.abs(dy) < 0.02 && dx > -0.02 && dx < 0.5) {
          candidates.push({ val, dist: Math.abs(dx) + Math.abs(dy) * 5 });
        }
      }
      if (direction === "below" || direction === "both") {
        // Below label (within 8% horizontally), close vertically
        if (Math.abs(dx) < 0.08 && dy > 0 && dy < 0.08) {
          candidates.push({ val, dist: dy + Math.abs(dx) * 3 });
        }
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0]?.val ?? 0;
  };

  // Helper: find a text string near a label position
  const findTextNear = (labelX: number, labelY: number): string => {
    const candidates: { text: string; dist: number }[] = [];
    for (const it of normalized) {
      if (/^\d/.test(it.text) || it.text.length < 2) continue;
      const dx = it.xPct - labelX;
      const dy = it.yPct - labelY;
      // Below label
      if (Math.abs(dx) < 0.15 && dy > 0 && dy < 0.1) {
        candidates.push({ text: it.text, dist: dy + Math.abs(dx) * 2 });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0]?.text ?? "";
  };

  // --- Extract each box ---

  // Box 1: Wages
  let wages = 0;
  const wageLabels = findLabels(/wages[,.]?\s*tips/i);
  if (wageLabels.length > 0) {
    // Use the first occurrence (topmost on page)
    const lbl = wageLabels.sort((a, b) => a.yPct - b.yPct)[0];
    wages = findValueNear(lbl.xPct, lbl.yPct, "below");
    if (wages <= 0) wages = findValueNear(lbl.xPct, lbl.yPct, "right");
  }

  // Box 2: Federal income tax withheld
  let federal_tax_withheld = 0;
  const fedLabels = findLabels(/federal\s+income\s+tax/i);
  if (fedLabels.length > 0) {
    const lbl = fedLabels.sort((a, b) => a.yPct - b.yPct)[0];
    federal_tax_withheld = findValueNear(lbl.xPct, lbl.yPct, "below");
    if (federal_tax_withheld <= 0) federal_tax_withheld = findValueNear(lbl.xPct, lbl.yPct, "right");
  }

  // Box 4: Social security tax withheld  
  let social_security_withheld = 0;
  const ssLabels = findLabels(/social\s+security\s+tax\s+with/i);
  if (ssLabels.length > 0) {
    const lbl = ssLabels.sort((a, b) => a.yPct - b.yPct)[0];
    social_security_withheld = findValueNear(lbl.xPct, lbl.yPct, "below");
    if (social_security_withheld <= 0) social_security_withheld = findValueNear(lbl.xPct, lbl.yPct, "right");
  }

  // Box 6: Medicare tax withheld
  let medicare_withheld = 0;
  const medLabels = findLabels(/medicare\s+tax\s+with/i);
  if (medLabels.length > 0) {
    const lbl = medLabels.sort((a, b) => a.yPct - b.yPct)[0];
    medicare_withheld = findValueNear(lbl.xPct, lbl.yPct, "below");
    if (medicare_withheld <= 0) medicare_withheld = findValueNear(lbl.xPct, lbl.yPct, "right");
  }

  // Box 17: State income tax
  let state_tax_withheld = 0;
  const stateLabels = findLabels(/state\s+income\s+tax\b/i);
  if (stateLabels.length > 0) {
    const lbl = stateLabels.sort((a, b) => a.yPct - b.yPct)[0];
    state_tax_withheld = findValueNear(lbl.xPct, lbl.yPct, "below");
    if (state_tax_withheld <= 0) state_tax_withheld = findValueNear(lbl.xPct, lbl.yPct, "right");
  }

  // Employer name: look for "employer's name" label and grab text below/right
  let employer_name = "";
  const empLabels = findLabels(/employer.s\s+name/i);
  if (empLabels.length > 0) {
    const lbl = empLabels.sort((a, b) => a.yPct - b.yPct)[0];
    employer_name = findTextNear(lbl.xPct, lbl.yPct);
  }

  // EIN: look for EIN pattern anywhere
  let employer_ein: string | null = null;
  const einItem = normalized.find((it) => /\d{2}-\d{7}/.test(it.text));
  if (einItem) {
    const match = einItem.text.match(/(\d{2}-\d{7})/);
    employer_ein = match?.[1] ?? null;
  }

  // State: look near Box 15 label or find two-letter state code near bottom
  let state: string | null = null;
  const stLabel = findLabels(/state.*employer/i);
  if (stLabel.length > 0) {
    const lbl = stLabel.sort((a, b) => a.yPct - b.yPct)[0];
    // Find state code below
    for (const it of normalized) {
      if (US_STATES.includes(it.text.trim().toUpperCase()) &&
          Math.abs(it.xPct - lbl.xPct) < 0.15 &&
          it.yPct > lbl.yPct && it.yPct - lbl.yPct < 0.1) {
        state = it.text.trim().toUpperCase();
        break;
      }
    }
  }
  if (!state) {
    // Fallback: find state in address patterns
    const fullText = items.map((it) => it.text).join(" ");
    const stateMatch = fullText.match(/,\s*([A-Z]{2})\s+\d{5}/);
    if (stateMatch && US_STATES.includes(stateMatch[1])) state = stateMatch[1];
  }

  // --- Sanity check with ratio validation ---
  // If SS withheld wasn't found but wages exist, estimate
  if (wages > 0 && social_security_withheld === 0) {
    // Try to find a value close to 6.2% of wages
    const expected = wages * 0.062;
    for (const it of normalized) {
      const val = parseAmount(it.text.replace(/[$,]/g, ""));
      if (val > 0 && Math.abs(val - expected) / expected < 0.15) {
        social_security_withheld = val;
        break;
      }
    }
  }
  if (wages > 0 && medicare_withheld === 0) {
    const expected = wages * 0.0145;
    for (const it of normalized) {
      const val = parseAmount(it.text.replace(/[$,]/g, ""));
      if (val > 0 && Math.abs(val - expected) / expected < 0.2) {
        medicare_withheld = val;
        break;
      }
    }
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
    const body = await req.json();
    const { items, pageWidth, pageHeight, formFields } = body as {
      items?: TextItem[];
      pageWidth?: number;
      pageHeight?: number;
      formFields?: Record<string, string> | null;
      text?: string; // legacy fallback
    };

    // Strategy 1: Try form fields first
    if (formFields && Object.keys(formFields).length > 0) {
      console.log("Attempting form field extraction, fields:", Object.keys(formFields));
      const result = extractFromFormFields(formFields);
      if (result && result.wages > 0) {
        console.log("W-2 parsed from form fields:", JSON.stringify(result));
        return new Response(JSON.stringify({ w2: result }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Strategy 2: Spatial coordinate extraction
    if (items && items.length > 0 && pageWidth && pageHeight) {
      console.log(`Spatial extraction: ${items.length} items, page ${pageWidth}x${pageHeight}`);
      const result = extractSpatial(items, pageWidth, pageHeight);
      console.log("W-2 parsed spatially:", JSON.stringify(result));
      return new Response(JSON.stringify({ w2: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "No text items provided" }), {
      status: 400,
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
