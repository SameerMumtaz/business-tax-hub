import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type TxType = "income" | "expense";

interface ParsedTx {
  date: string;
  description: string;
  amount: number;
  type: TxType;
}

const normalizeDate = (raw: string): string => {
  const parts = raw.split("/");
  if (parts.length !== 3) return raw;
  const [mm, dd, rest] = parts;
  let year = rest;
  if (year.length === 2) {
    year = Number(year) < 70 ? `20${year}` : `19${year}`;
  } else if (year.length === 4) {
    // already full year
  }
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

const parseAmount = (raw: string): { value: number; negative: boolean } => {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith("-");
  const numeric = Number(trimmed.replace(/[^\d.]/g, ""));
  return { value: Number.isFinite(numeric) ? numeric : 0, negative };
};

const DEPOSIT_HEADERS = [
  "deposits and other credits",
  "deposits and additions",
  "deposits",
  "other credits",
  "credits",
  "electronic deposits",
  "direct deposits",
  "incoming",
];
const WITHDRAWAL_HEADERS = [
  "withdrawals and other debits",
  "withdrawals and subtractions",
  "withdrawals",
  "other debits",
  "debits",
  "checks and debits",
  "electronic withdrawals",
  "purchases",
  "outgoing",
];

const inferSectionHint = (fullText: string, index: number): TxType | null => {
  const start = Math.max(0, index - 5000);
  const lookback = fullText.slice(start, index).toLowerCase();
  let lastDep = -1;
  let lastWit = -1;
  for (const h of DEPOSIT_HEADERS) {
    const pos = lookback.lastIndexOf(h);
    if (pos > lastDep) lastDep = pos;
  }
  for (const h of WITHDRAWAL_HEADERS) {
    const pos = lookback.lastIndexOf(h);
    if (pos > lastWit) lastWit = pos;
  }
  if (lastWit > lastDep) return "expense";
  if (lastDep > lastWit) return "income";
  return null;
};

const inferType = (description: string, negative: boolean, sectionHint: TxType | null): TxType => {
  if (negative) return "expense";

  const d = description.toLowerCase();

  // Strong income signals
  if (/(deposit|bkofamerica mobile|wire in|online transfer from|counter credit|refund|payment received|ach credit|square inc|payables|zelle received|zelle from|direct dep|payroll|venmo cashout|cash deposit|atm deposit|interest earned|dividend|insurance claim|tax refund|reimbursement|incoming wire)/i.test(d)) {
    return "income";
  }

  // Strong expense signals
  if (/(checkcard|purchase|payment to|wire out|zelle recurring payment to|zelle payment to|withdrawal|debit|service fee|shell|qt\s|walmart|home depot|autozone|lowe|motel|love's|7-eleven|pos purchase|card purchase|ach debit|bill pay|autopay|recurring payment|online payment to)/i.test(d)) {
    return "expense";
  }

  // Section headers are the strongest contextual signal
  if (sectionHint) return sectionHint;

  return "expense";
};

const cleanDescription = (raw: string): string =>
  raw
    .replace(/\s+/g, " ")
    .replace(/\bcontinued on the next page\b/gi, "")
    .replace(/\bPage\s+\d+\s+of\s+\d+\b/gi, "")
    .trim();

const parseTransactionsFromText = (text: string): ParsedTx[] => {
  const transactions: ParsedTx[] = [];
  const lines = text.split(/\r?\n/);

  let pending: { date: string; descriptionParts: string[]; amountRaw?: string; startIndex: number } | null = null;
  let consumedChars = 0;

  // Date patterns: MM/DD/YY or MM/DD/YYYY
  const DATE_RE = /\b(\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4}))\b/;
  const DATE_START_RE = /^(\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4}))\b\s*(.*)$/;
  const AMOUNT_RE = /(-?\$?\d{1,3}(?:,\d{3})*\.\d{2})/;

  // Pre-process: the PDF text may come as one long line per page.
  // Insert line breaks before each date pattern to create parseable lines.
  const preprocessed = text.replace(
    new RegExp(`\\s(?=${DATE_RE.source})`, "g"),
    "\n"
  );

  // Also log a sample for debugging
  const sampleLines = preprocessed.split("\n").slice(0, 10);
  console.log("Sample preprocessed lines:", JSON.stringify(sampleLines));

  const lines = preprocessed.split(/\r?\n/);

  let pending: { date: string; descriptionParts: string[]; amountRaw?: string; startIndex: number } | null = null;
  let consumedChars = 0;

  const finalizePending = () => {
    if (!pending?.amountRaw) return;

    const description = cleanDescription(pending.descriptionParts.join(" "));
    const { value, negative } = parseAmount(pending.amountRaw);
    if (!description || !value) {
      pending = null;
      return;
    }

    const sectionHint = inferSectionHint(text, pending.startIndex);
    const type = inferType(description, negative, sectionHint);

    transactions.push({
      date: normalizeDate(pending.date),
      description,
      amount: value,
      type,
    });

    pending = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    consumedChars += rawLine.length + 1;

    if (!line) continue;

    // Skip known non-transaction lines
    if (/^(Page\s+\d+\s+of\s+\d+|continued on the next page|Date\s+Description\s+Amount)$/i.test(line)) {
      continue;
    }

    const dateStart = line.match(DATE_START_RE);
    if (dateStart) {
      // New transaction starts, close previous if complete
      finalizePending();

      const [, date, remainder] = dateStart;
      pending = { date, descriptionParts: [], startIndex: consumedChars };

      if (remainder) {
        // Try to find amount(s) at the end - statements often have multiple amounts
        // (e.g. transaction amount and running balance)
        const amounts = [...remainder.matchAll(new RegExp(AMOUNT_RE.source, "g"))];
        if (amounts.length > 0) {
          // The first amount is usually the transaction amount
          const firstAmountIndex = remainder.indexOf(amounts[0][0]);
          const descPart = remainder.slice(0, firstAmountIndex).trim();
          if (descPart) pending.descriptionParts.push(descPart);
          pending.amountRaw = amounts[0][1];
          finalizePending();
        } else {
          pending.descriptionParts.push(remainder);
        }
      }
      continue;
    }

    if (!pending) continue;

    const amountOnly = line.match(/^(-?\$?\d{1,3}(?:,\d{3})*\.\d{2})$/);
    if (amountOnly) {
      pending.amountRaw = amountOnly[1];
      finalizePending();
      continue;
    }

    // Check if line ends with an amount
    const lineWithAmount = line.match(/^(.*?)\s+(-?\$?\d{1,3}(?:,\d{3})*\.\d{2})\s*$/);
    if (lineWithAmount && pending) {
      pending.descriptionParts.push(lineWithAmount[1]);
      pending.amountRaw = lineWithAmount[2];
      finalizePending();
      continue;
    }

    // Non-amount continuation line for current description
    pending.descriptionParts.push(line);
  }

  finalizePending();

  const seen = new Set<string>();
  return transactions.filter((t) => {
    const key = `${t.date}|${t.amount}|${t.description.toLowerCase().slice(0, 60)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

    const truncated = text.length > 250000 ? text.slice(0, 250000) : text;
    const transactions = parseTransactionsFromText(truncated);

    console.log(`Rule parser extracted ${transactions.length} transactions from ${truncated.length} chars`);

    return new Response(
      JSON.stringify({
        transactions,
        summary:
          transactions.length > 0
            ? `Extracted ${transactions.length} transactions using fast rule parsing`
            : "No transactions detected from the provided statement text",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("parse-pdf error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
