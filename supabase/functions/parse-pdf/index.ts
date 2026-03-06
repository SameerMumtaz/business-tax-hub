// Universal Bank Statement Parser v4
// Handles: Chase, Wells Fargo, Bank of America, Capital One, Citi, PNC, US Bank, credit unions, etc.
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

// ─── Date Parsing ────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  january: "01", february: "02", march: "03", april: "04", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

const normalizeDate = (raw: string, statementYear?: string): string => {
  const s = raw.trim();

  // "Jan 15, 2025" or "January 15, 2025" or "Jan 15 2025" or "Jan 15"
  const wordMatch = s.match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s*(\d{4})?$/i);
  if (wordMatch) {
    const mm = MONTH_MAP[wordMatch[1].toLowerCase().slice(0, 3)] || MONTH_MAP[wordMatch[1].toLowerCase()];
    const dd = wordMatch[2].padStart(2, "0");
    const year = wordMatch[3] || statementYear || new Date().getFullYear().toString();
    return `${year}-${mm}-${dd}`;
  }

  // MM/DD/YYYY or MM/DD/YY or MM/DD or MM-DD-YYYY
  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (slashMatch) {
    const mm = slashMatch[1].padStart(2, "0");
    const dd = slashMatch[2].padStart(2, "0");
    let year: string;
    if (slashMatch[3]) {
      year = slashMatch[3].length === 2
        ? (Number(slashMatch[3]) < 70 ? `20${slashMatch[3]}` : `19${slashMatch[3]}`)
        : slashMatch[3];
    } else {
      year = statementYear || new Date().getFullYear().toString();
    }
    return `${year}-${mm}-${dd}`;
  }

  // YYYY-MM-DD already normalized
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  return s;
};

const isValidDate = (dateStr: string): boolean => {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
};

// ─── Amount Parsing ──────────────────────────────────────────────────────────

const parseAmount = (raw: string): { value: number; negative: boolean } => {
  const t = raw.trim();
  const negative = t.startsWith("-") || t.startsWith("(") || t.endsWith("-") || t.endsWith("CR");
  const numeric = Number(t.replace(/[^\d.]/g, ""));
  return { value: Number.isFinite(numeric) ? numeric : 0, negative };
};

// ─── Section Detection (bank-agnostic) ───────────────────────────────────────

const DEPOSIT_HEADERS = [
  "deposits and other credits", "deposits and additions", "deposits",
  "other credits", "credits", "electronic deposits", "direct deposits",
  "incoming", "payments and other credits", "money in", "additions",
  "other additions", "total additions", "total deposits",
  // Chase
  "savings deposits", "transaction detail - credits",
  // Wells Fargo
  "additions and other credits", "deposits/credits",
  // Capital One / Citi
  "payments and credits", "payments, credits",
  // Generic credit card
  "payment thank you", "payments received",
];

const WITHDRAWAL_HEADERS = [
  "withdrawals and other debits", "withdrawals and subtractions",
  "withdrawals", "other debits", "debits", "checks and debits",
  "electronic withdrawals", "purchases", "outgoing", "service fees",
  "fees", "money out", "subtractions", "other subtractions",
  "total subtractions", "total withdrawals",
  // Chase
  "savings withdrawals", "transaction detail - debits", "atm & debit card withdrawals",
  "electronic payments", "fees and service charges",
  // Wells Fargo
  "withdrawals and other debits", "checks paid",
  "purchases and payments", "purchases/debits",
  // Capital One / Citi
  "transactions", "new charges", "purchases",
  // Generic
  "card transactions", "point of sale",
];

// Credit card statements: all charges are expenses, payments are income
const CREDIT_CARD_INDICATORS = [
  "previous balance", "new balance", "minimum payment due",
  "credit limit", "available credit", "statement closing date",
  "payment due date", "annual percentage rate", "apr",
  "finance charge", "interest charged",
];

const inferSectionHint = (fullText: string, index: number): TxType | null => {
  const start = Math.max(0, index - 10000);
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

// ─── Type Inference ──────────────────────────────────────────────────────────

const inferType = (
  description: string,
  negative: boolean,
  sectionHint: TxType | null,
  isCreditCard: boolean,
): TxType => {
  // Section headers are most reliable
  if (sectionHint) return sectionHint;

  const d = description.toLowerCase();

  // Credit card: payments TO the card are income (credits), everything else is expense
  if (isCreditCard) {
    if (/(payment thank you|payment received|autopay payment|payment - thank|credit adjustment|refund|reward|cashback|return|purchase return)/i.test(d)) {
      return "income";
    }
    return "expense";
  }

  // Negative amounts are expenses
  if (negative) return "expense";

  // Strong income signals
  if (/(deposit|wire\s*in|online transfer from|counter credit|refund|payment received|ach credit|square inc|payables|zelle received|zelle from|direct dep|payroll|venmo cashout|cash deposit|atm deposit|interest earned|interest payment|dividend|insurance claim|tax refund|reimbursement|incoming wire|purchase refund|mobile deposit|remote deposit|external transfer in|transfer from|cashback|reward)/i.test(d)) {
    return "income";
  }

  // Strong expense signals
  if (/(checkcard|purchase(?!\s+refund)|payment to|wire\s*out|zelle.*payment to|withdrawal|debit|service fee|pos|walmart|home depot|target|amazon|costco|shell|chevron|exxon|7-eleven|card purchase|ach debit|bill pay|autopay|recurring payment|online payment|transfer to|external transfer out|check\s*#?\d|atm withdrawal|venmo payment|cash app|uber|lyft|doordash|grubhub)/i.test(d)) {
    return "expense";
  }

  return "expense";
};

// ─── Description Cleaning ────────────────────────────────────────────────────

const cleanDescription = (raw: string): string => {
  return raw
    .replace(/\s+/g, " ")
    // Masked card numbers: XXXXXXXXXXXX1234, ****1234, xxxx xxxx xxxx 1234
    .replace(/[Xx*]{4,}\s*[Xx*]*\s*[Xx*]*\s*\d{0,4}/g, "")
    // Long numeric reference strings (>10 digits)
    .replace(/\b\d{11,}\b/g, "")
    // Short reference codes preceded by # or Ref:
    .replace(/(?:Ref|REF|Auth|AUTH|Trace|TRACE|Seq|SEQ|Conf|CONF)[\s#:]*\d{4,}/gi, "")
    // CKCD codes
    .replace(/\bCKCD\s+\d{4}\b/gi, "")
    // Page/continuation artifacts
    .replace(/\bcontinued on the next page\b/gi, "")
    .replace(/\bPage\s+\d+\s+of\s+\d+\b/gi, "")
    // RECURRING tag
    .replace(/\bRECURRING\b/gi, "")
    // Date duplicates embedded in description (e.g., "01/15 01/16 AMAZON")
    .replace(/^\d{1,2}\/\d{1,2}\s+/g, "")
    // Remove trailing whitespace artifacts
    .replace(/\s{2,}/g, " ")
    .trim();
};

// ─── Statement Year Detection ────────────────────────────────────────────────

const detectStatementYear = (text: string): string | undefined => {
  // Look for "Statement Period: MM/DD/YYYY - MM/DD/YYYY" or similar
  const periodMatch = text.match(/(?:statement\s+(?:period|date|closing)|through|ending|thru)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4})/i);
  if (periodMatch) return periodMatch[1];

  // Look for any 4-digit year in header area (first 2000 chars)
  const header = text.slice(0, 2000);
  const yearMatch = header.match(/\b(20[12]\d)\b/);
  if (yearMatch) return yearMatch[1];

  return undefined;
};

// ─── Credit Card Detection ───────────────────────────────────────────────────

const detectCreditCard = (text: string): boolean => {
  const header = text.slice(0, 5000).toLowerCase();
  let score = 0;
  for (const indicator of CREDIT_CARD_INDICATORS) {
    if (header.includes(indicator)) score++;
  }
  return score >= 2;
};

// ─── Non-Transaction Line Detection ─────────────────────────────────────────

const NON_TX_PATTERNS = [
  /^(Page\s+\d+\s+of\s+\d+)/i,
  /^(continued on|Date\s+Description|Account\s+(number|summary))/i,
  /^(Beginning balance|Ending balance|Opening balance|Closing balance)/i,
  /^(Average\s+(ledger|daily)|# of\s|Total\s+(deposits|withdrawals|debits|credits|checks))/i,
  /^(NEW:|Explore|When you use|enrolled|data connection|Mobile Banking)/i,
  /^(Message and data|Preferred Rewards|Your Business|PULL:|P\.O\.\s*Box)/i,
  /^(For SafeBalance|Bank of America|Wells Fargo|Chase|JPMorgan|Citibank)/i,
  /^(Member FDIC|Equal Housing|NMLS|www\.|http)/i,
  /^(Previous|New)\s+Balance/i,
  /^(Minimum Payment|Payment Due|Credit Limit|Available Credit)/i,
  /^(Annual Percentage|Interest Charge|Finance Charge|Late Fee Warning)/i,
  /^(Important Message|Important Information|Notice:|Dear Customer)/i,
  /^(Daily (Ending )?Balance|Daily Ledger)/i,
  /^(Overdraft|NSF|Returned Item)/i,
  /^(statement period|account (type|number)|routing number)/i,
  /^(customer service|questions\?|call us)/i,
];

const SECTION_HEADER_PATTERNS = [
  /^(deposits and other credits|withdrawals and other debits)/i,
  /^(checks|service fees|daily ending balances|daily ledger balances)/i,
  /^(transaction (detail|history|summary))/i,
  /^(savings deposits|savings withdrawals|atm.*withdrawals)/i,
  /^(electronic payments|fees and service charges|purchases)/i,
  /^(payments and credits|new charges|other charges)/i,
  /^(payments.*credits|additions.*credits|withdrawals.*debits)/i,
];

const isNonTransactionLine = (line: string): boolean => {
  for (const pat of NON_TX_PATTERNS) {
    if (pat.test(line)) return true;
  }
  for (const pat of SECTION_HEADER_PATTERNS) {
    if (pat.test(line)) return true;
  }
  return false;
};

// ─── Core Parser ─────────────────────────────────────────────────────────────

const AMOUNT_RE = /(-?\$?\d{1,3}(?:,\d{3})*\.\d{2})/;
const PAREN_AMOUNT_RE = /\((\$?\d{1,3}(?:,\d{3})*\.\d{2})\)/;

// Date patterns
const DATE_SLASH_RE = /\b(\d{1,2}\/\d{1,2}(?:\/(?:\d{2}|\d{4}))?)\b/;
const DATE_WORD_RE = /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?)\b/i;
const DATE_DASH_RE = /\b(\d{1,2}-\d{1,2}(?:-(?:\d{2}|\d{4}))?)\b/;

const parseTransactionsFromText = (text: string): ParsedTx[] => {
  const transactions: ParsedTx[] = [];
  const statementYear = detectStatementYear(text);
  const isCreditCard = detectCreditCard(text);

  console.log(`Parser config: year=${statementYear || "auto"}, creditCard=${isCreditCard}`);

  // Build combined date regex
  const ANY_DATE_RE = new RegExp(
    `(?:${DATE_SLASH_RE.source}|${DATE_WORD_RE.source}|${DATE_DASH_RE.source})`
  );

  // Chase uses MM/DD format with a second "post date" — we want the first
  // Wells Fargo uses MM/DD/YY
  // BofA uses MM/DD or "Jan 15"
  const DATE_START_RE = new RegExp(
    `^(${DATE_SLASH_RE.source.slice(2, -2)}|${DATE_WORD_RE.source.slice(2, -2)}|${DATE_DASH_RE.source.slice(2, -2)})\\s*(.*)$`,
    "i"
  );

  // Pre-process: insert line breaks before each date pattern to handle concatenated text
  const preprocessed = text.replace(
    new RegExp(`\\s(?=${ANY_DATE_RE.source})`, "gi"),
    "\n"
  );

  const lines = preprocessed.split(/\r?\n/);

  let pending: {
    date: string;
    descriptionParts: string[];
    amountRaw?: string;
    amountNegative?: boolean;
    startIndex: number;
  } | null = null;

  let consumedChars = 0;

  const finalizePending = () => {
    if (!pending?.amountRaw) {
      pending = null;
      return;
    }

    const description = cleanDescription(pending.descriptionParts.join(" "));
    const { value, negative } = parseAmount(pending.amountRaw);

    if (!description || !value) {
      pending = null;
      return;
    }

    // Skip very small amounts that are likely fees listed as section summaries
    // but keep them if they look like real transactions
    const sectionHint = inferSectionHint(text, pending.startIndex);
    const type = inferType(description, pending.amountNegative || negative, sectionHint, isCreditCard);

    transactions.push({
      date: normalizeDate(pending.date, statementYear),
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
    if (isNonTransactionLine(line)) continue;

    // Check for parenthesized negative amounts: "(1,234.56)"
    const parenLine = line.replace(PAREN_AMOUNT_RE, (_, amt) => `-$${amt}`);

    const dateStart = parenLine.match(DATE_START_RE);
    if (dateStart) {
      finalizePending();

      const [, date, remainder] = dateStart;
      pending = { date, descriptionParts: [], startIndex: consumedChars };

      if (remainder) {
        // Chase pattern: "01/15 AMAZON.COM AMZN.COM/BILL WA 01/17 $45.67"
        // Two dates on one line — second date is post date, ignore it
        const cleanRemainder = remainder.replace(
          new RegExp(`\\s+${DATE_SLASH_RE.source}`, "g"),
          " "
        ).replace(
          new RegExp(`\\s+${DATE_DASH_RE.source}`, "g"),
          " "
        );

        const amounts = [...cleanRemainder.matchAll(new RegExp(AMOUNT_RE.source, "g"))];
        if (amounts.length > 0) {
          // Take the LAST amount (in case description contains numbers)
          const lastAmount = amounts[amounts.length - 1];
          const lastAmountIndex = cleanRemainder.lastIndexOf(lastAmount[0]);
          const descPart = cleanRemainder.slice(0, lastAmountIndex).trim();

          if (descPart) pending.descriptionParts.push(descPart);
          pending.amountRaw = lastAmount[1];
          pending.amountNegative = cleanRemainder.includes(`-${lastAmount[1]}`) ||
            cleanRemainder.includes(`(${lastAmount[1]})`);

          // If there are 3+ amounts, the last is likely running balance — use second-to-last
          if (amounts.length >= 3) {
            const txAmount = amounts[amounts.length - 2];
            const txAmountIndex = cleanRemainder.indexOf(txAmount[0]);
            const dp = cleanRemainder.slice(0, txAmountIndex).trim();
            if (dp) {
              pending.descriptionParts = [dp];
            }
            pending.amountRaw = txAmount[1];
          } else if (amounts.length === 2) {
            // Two amounts: could be debit+credit columns or amount+balance
            // Use the FIRST amount as transaction, second as balance
            const firstAmount = amounts[0];
            const firstAmountIndex = cleanRemainder.indexOf(firstAmount[0]);
            const dp = cleanRemainder.slice(0, firstAmountIndex).trim();
            if (dp) {
              pending.descriptionParts = [dp];
            }
            pending.amountRaw = firstAmount[1];
          }

          finalizePending();
        } else {
          pending.descriptionParts.push(cleanRemainder);
        }
      }
      continue;
    }

    if (!pending) continue;

    // Amount-only line (possibly with parentheses for negative)
    const amountOnly = parenLine.match(/^(-?\(?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?)$/);
    if (amountOnly) {
      if (!pending.amountRaw) {
        pending.amountRaw = amountOnly[1];
        pending.amountNegative = amountOnly[1].startsWith("-") || amountOnly[1].startsWith("(");
      } else {
        // Second amount = running balance, finalize
        finalizePending();
      }
      continue;
    }

    // Line ends with an amount
    const lineWithAmount = parenLine.match(/^(.*?)\s+(-?\(?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?)\s*$/);
    if (lineWithAmount && pending) {
      if (pending.amountRaw) {
        finalizePending();
        continue;
      }
      pending.descriptionParts.push(lineWithAmount[1]);
      pending.amountRaw = lineWithAmount[2];
      pending.amountNegative = lineWithAmount[2].startsWith("-") || lineWithAmount[2].startsWith("(");
      continue;
    }

    // If we have a pending amount and hit a non-amount line, finalize
    if (pending.amountRaw) {
      finalizePending();
      continue;
    }

    // Continuation line for description
    pending.descriptionParts.push(parenLine);
  }

  finalizePending();

  // Validate dates and filter bad parses
  const validated = transactions.filter((t) => {
    if (!isValidDate(t.date)) return false;
    if (t.amount <= 0) return false;
    if (t.description.length < 2) return false;
    // Skip if description is mostly numbers (likely a balance or reference)
    const alphaRatio = (t.description.match(/[a-zA-Z]/g) || []).length / t.description.length;
    if (alphaRatio < 0.3 && t.description.length > 5) return false;
    return true;
  });

  // Deduplicate
  const seen = new Set<string>();
  return validated.filter((t) => {
    const key = `${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase().slice(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ─── HTTP Handler ────────────────────────────────────────────────────────────

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

    console.log(`Parser v4: ${transactions.length} transactions from ${truncated.length} chars`);
    if (transactions.length > 0) {
      const sample = transactions.slice(0, 5).map(
        (t) => `${t.date} | ${t.type} | $${t.amount} | ${t.description.slice(0, 60)}`
      );
      console.log("Samples:", JSON.stringify(sample));
    }

    return new Response(
      JSON.stringify({
        transactions,
        summary:
          transactions.length > 0
            ? `Extracted ${transactions.length} transactions`
            : "No transactions detected from the provided statement text",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("parse-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
