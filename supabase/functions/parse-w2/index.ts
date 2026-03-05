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
  return Number.isFinite(val) ? val : 0;
};

const findAmountNear = (text: string, patterns: RegExp[]): number => {
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      // Find amount in the match - look for dollar amounts
      const amountMatch = m[0].match(/\$?\s*([\d,]+\.?\d*)/);
      if (amountMatch) return parseAmount(amountMatch[1]);
    }
  }
  return 0;
};

const extractW2FromText = (text: string): W2Data => {
  const t = text.replace(/\r\n/g, "\n");
  
  // Employer name - look for common patterns
  let employer_name = "";
  const employerPatterns = [
    /(?:employer['']?s?\s+name|employer\s+identification|employer\s+name,?\s+address)/i,
    /(?:^|\n)\s*([A-Z][A-Za-z\s&.,'-]{2,50}(?:LLC|Inc|Corp|Ltd|Company|Co|Services|Group)?)\s*\n/m,
  ];
  
  // Try to find employer after "Employer's name" label
  const empLabelMatch = t.match(/employer['']?s?\s+name[^]*?\n\s*([^\n]{3,60})/i);
  if (empLabelMatch) {
    employer_name = empLabelMatch[1].replace(/\d{2}-\d{7}/, "").trim();
  }
  
  // EIN - XX-XXXXXXX pattern
  let employer_ein: string | null = null;
  const einMatch = t.match(/\b(\d{2}-\d{7})\b/);
  if (einMatch) employer_ein = einMatch[1];

  // Box 1: Wages, tips, other compensation
  const wages = findAmountNear(t, [
    /(?:box\s*1|wages,?\s*tips,?\s*other\s*comp)[^\n]*?\$?\s*([\d,]+\.?\d*)/i,
    /1\s+wages,?\s*tips[^\n]*?\$?\s*([\d,]+\.?\d*)/i,
  ]);

  // Box 2: Federal income tax withheld
  const federal_tax_withheld = findAmountNear(t, [
    /(?:box\s*2|federal\s+income\s+tax\s+withheld)[^\n]*?\$?\s*([\d,]+\.?\d*)/i,
    /2\s+federal\s+income\s+tax[^\n]*?\$?\s*([\d,]+\.?\d*)/i,
  ]);

  // Box 4: Social security tax withheld
  const social_security_withheld = findAmountNear(t, [
    /(?:box\s*4|social\s+security\s+tax\s+withheld)[^\n]*?\$?\s*([\d,]+\.?\d*)/i,
    /4\s+social\s+security\s+tax[^\n]*?\$?\s*([\d,]+\.?\d*)/i,
  ]);

  // Box 6: Medicare tax withheld
  const medicare_withheld = findAmountNear(t, [
    /(?:box\s*6|medicare\s+tax\s+withheld)[^\n]*?\$?\s*([\d,]+\.?\d*)/i,
    /6\s+medicare\s+tax[^\n]*?\$?\s*([\d,]+\.?\d*)/i,
  ]);

  // Box 17: State income tax
  const state_tax_withheld = findAmountNear(t, [
    /(?:box\s*17|state\s+income\s+tax)[^\n]*?\$?\s*([\d,]+\.?\d*)/i,
    /17\s+state\s+income\s+tax[^\n]*?\$?\s*([\d,]+\.?\d*)/i,
  ]);

  // State - look for 2-letter state code
  let state: string | null = null;
  const stateMatch = t.match(/(?:box\s*15|state\s*\/?\s*employer)/i);
  if (stateMatch) {
    const afterState = t.slice(stateMatch.index!).slice(0, 200);
    for (const s of US_STATES) {
      if (new RegExp(`\\b${s}\\b`).test(afterState)) {
        state = s;
        break;
      }
    }
  }
  // Fallback: any 2-letter state match near bottom
  if (!state) {
    const lowerHalf = t.slice(Math.floor(t.length * 0.5));
    for (const s of US_STATES) {
      if (new RegExp(`\\b${s}\\b`).test(lowerHalf)) {
        state = s;
        break;
      }
    }
  }

  // If we couldn't find amounts via labeled patterns, try positional extraction
  // W-2 forms often have amounts in a grid layout
  if (wages === 0 && federal_tax_withheld === 0) {
    const amounts = [...t.matchAll(/\$?\s*([\d,]+\.\d{2})\b/g)]
      .map(m => parseAmount(m[1]))
      .filter(a => a > 0)
      .sort((a, b) => b - a);
    
    // Heuristic: largest amount is likely wages, second might be fed tax
    if (amounts.length >= 1) {
      return {
        employer_name: employer_name || "Unknown Employer",
        employer_ein,
        wages: amounts[0] || 0,
        federal_tax_withheld: amounts[1] || 0,
        social_security_withheld: amounts.find(a => a > 0 && a < amounts[0] * 0.07) || 0,
        medicare_withheld: amounts.find(a => a > 0 && a < amounts[0] * 0.02) || 0,
        state_tax_withheld: amounts[3] || 0,
        state,
      };
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
    const { text } = (await req.json()) as { text: string };

    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "No text provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const w2Data = extractW2FromText(text);
    console.log(`W-2 parser extracted: wages=${w2Data.wages}, fed=${w2Data.federal_tax_withheld}`);

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
