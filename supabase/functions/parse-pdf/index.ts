// Statement parser v3 – improved description cleaning, amount handling, type inference
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

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

const normalizeDate = (raw: string): string => {
  const wordMatch = raw.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})?$/i);
  if (wordMatch) {
    const mm = MONTH_MAP[wordMatch[1].toLowerCase()];
    const dd = wordMatch[2].padStart(2, "0");
    const year = wordMatch[3] || new Date().getFullYear().toString();
    return `${year}-${mm}-${dd}`;
  }
  const parts = raw.split("/");
  if (parts.length >= 2) {
    const mm = parts[0].padStart(2, "0");
    const dd = parts[1].padStart(2, "0");
    let year: string;
    if (parts.length === 3 && parts[2]) {
      year = parts[2].length === 2
        ? (Number(parts[2]) < 70 ? `20${parts[2]}` : `19${parts[2]}`)
        : parts[2];
    } else {
      year = new Date().getFullYear().toString();
    }
    return `${year}-${mm}-${dd}`;
  }
  return raw;
};

const parseAmount = (raw: string): { value: number; negative: boolean } => {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith("-") || trimmed.startsWith("(");
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
  "service fees",
];

const inferSectionHint = (fullText: string, index: number): TxType | null => {
  const start = Math.max(0, index - 8000);
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
  // Section headers from the statement are the MOST reliable signal
  if (sectionHint) return sectionHint;

  // Negative amounts are always expenses
  if (negative) return "expense";

  const d = description.toLowerCase();

  // Strong income signals
  if (/(deposit|bkofamerica mobile|wire in|online transfer from|counter credit|refund|payment received|ach credit|square inc|payables|zelle received|zelle from|direct dep|payroll|venmo cashout|cash deposit|atm deposit|interest earned|dividend|insurance claim|tax refund|reimbursement|incoming wire|purchase refund)/i.test(d)) {
    return "income";
  }

  // Strong expense signals
  if (/(checkcard|purchase(?!\s+refund)|payment to|wire out|zelle recurring payment to|zelle payment to|withdrawal|debit|service fee|shell|qt\s|walmart|home depot|autozone|lowe|motel|love's|7-eleven|pos purchase|card purchase|ach debit|bill pay|autopay|recurring payment|online payment to|online scheduled payment|transfer to)/i.test(d)) {
    return "expense";
  }

  return "expense";
};

// Clean up raw descriptions by removing bank noise
const cleanDescription = (raw: string): string => {
  return raw
    .replace(/\s+/g, " ")
    // Remove masked card numbers: XXXXXXXXXXXX1234 or XXXX XXXX XXXX 1234
    .replace(/X{4,}\d{0,4}/gi, "")
    .replace(/\bXXXX\s+XXXX\s+XXXX\s+\d{4}\b/gi, "")
    // Remove long numeric reference strings (>12 digits, likely trace/auth numbers)
    .replace(/\b\d{13,}\b/g, "")
    // Remove CKCD codes: CKCD 5542
    .replace(/\bCKCD\s+\d{4}\b/gi, "")
    // Remove page/continuation artifacts
    .replace(/\bcontinued on the next page\b/gi, "")
    .replace(/\bPage\s+\d+\s+of\s+\d+\b/gi, "")
    // Remove "RECURRING" tag (already captured in description context)
    .replace(/\bRECURRING\b/gi, "")
    // Collapse multiple spaces after cleanup
    .replace(/\s{2,}/g, " ")
    .trim();
};

const AMOUNT_RE = /(-?\$?\d{1,3}(?:,\d{3})*\.\d{2})/;

const parseTransactionsFromText = (text: string): ParsedTx[] => {
  const transactions: ParsedTx[] = [];

  const DATE_SLASH_RE = /\b(\d{1,2}\/\d{1,2}(?:\/(?:\d{2}|\d{4}))?)\b/;
  const DATE_WORD_RE = /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,?\s+\d{4})?)\b/i;
  const ANY_DATE_RE = new RegExp(`(?:${DATE_SLASH_RE.source}|${DATE_WORD_RE.source})`);
  const DATE_START_RE = new RegExp(`^(${DATE_SLASH_RE.source.slice(2, -2)}|${DATE_WORD_RE.source.slice(2, -2)})\\s*(.*)$`, "i");

  // Pre-process: insert line breaks before each date pattern
  const preprocessed = text.replace(
    new RegExp(`\\s(?=${ANY_DATE_RE.source})`, "gi"),
    "\n"
  );

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

  // Track whether a line looks like a running balance (amount at end following another amount)
  const isRunningBalanceLine = (line: string): boolean => {
    // Lines that are ONLY an amount are running balances if they follow a finalized tx
    // But we handle those as the tx amount when pending, so this is for multi-amount lines
    const amounts = [...line.matchAll(new RegExp(AMOUNT_RE.source, "g"))];
    return amounts.length >= 2;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    consumedChars += rawLine.length + 1;

    if (!line) continue;

    // Skip known non-transaction lines
    if (/^(Page\s+\d+\s+of\s+\d+|continued on the next page|Date\s+Description\s+Amount|Account\s+(number|summary)|Beginning balance|Ending balance|Average ledger|# of |¹|NEW:|Explore|When you use|enrolled|Bank of America|data connection|For SafeBalance|Mobile Banking|Message and data|Preferred Rewards|Your Business|PULL:|P\.O\. Box)/i.test(line)) {
      continue;
    }

    // Skip section headers themselves
    if (/^(deposits and other credits|withdrawals and other debits|checks|service fees|daily ending balances)/i.test(line)) {
      continue;
    }

    const dateStart = line.match(DATE_START_RE);
    if (dateStart) {
      finalizePending();

      const [, date, remainder] = dateStart;
      pending = { date, descriptionParts: [], startIndex: consumedChars };

      if (remainder) {
        const amounts = [...remainder.matchAll(new RegExp(AMOUNT_RE.source, "g"))];
        if (amounts.length > 0) {
          // Use the LAST amount if there are multiple (first might be part of description like "0115")
          // But for multi-amount lines, first is usually transaction, last is running balance
          // Pick the first amount that's at the END portion of the line
          const firstAmountIndex = remainder.indexOf(amounts[0][0]);
          const descPart = remainder.slice(0, firstAmountIndex).trim();

          if (amounts.length >= 2) {
            // Multiple amounts: first = transaction amount, ignore the rest (running balance)
            if (descPart) pending.descriptionParts.push(descPart);
            pending.amountRaw = amounts[0][1];
            finalizePending();
          } else {
            // Single amount at end
            if (descPart) pending.descriptionParts.push(descPart);
            pending.amountRaw = amounts[0][1];
            finalizePending();
          }
        } else {
          pending.descriptionParts.push(remainder);
        }
      }
      continue;
    }

    if (!pending) continue;

    // Amount-only line
    const amountOnly = line.match(/^(-?\(?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?)$/);
    if (amountOnly) {
      if (!pending.amountRaw) {
        // First amount after description = transaction amount
        pending.amountRaw = amountOnly[1];
        // Don't finalize yet - there might be a running balance on the next line
      } else {
        // Second amount = running balance, finalize with the first
        finalizePending();
      }
      continue;
    }

    // Check if line ends with an amount
    const lineWithAmount = line.match(/^(.*?)\s+(-?\(?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?)\s*$/);
    if (lineWithAmount && pending) {
      if (pending.amountRaw) {
        // We already have an amount - this might be a running balance line, finalize previous
        finalizePending();
        continue;
      }
      pending.descriptionParts.push(lineWithAmount[1]);
      pending.amountRaw = lineWithAmount[2];
      // Don't finalize yet - next line might be running balance
      continue;
    }

    // If we have a pending amount and hit a non-amount description line, finalize first
    if (pending.amountRaw) {
      finalizePending();
      // This line might start a new description without a date (rare but possible)
      continue;
    }

    // Non-amount continuation line for current description
    pending.descriptionParts.push(line);
  }

  finalizePending();

  // Deduplicate
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
    if (transactions.length > 0) {
      const sample = transactions.slice(0, 3).map(t => `${t.date} | ${t.type} | $${t.amount} | ${t.description.slice(0, 50)}`);
      console.log("Sample transactions:", JSON.stringify(sample));
    }

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
