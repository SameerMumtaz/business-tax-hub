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

const normalizeDate = (mmddyy: string): string => {
  const [mm, dd, yy] = mmddyy.split("/");
  const year = Number(yy) < 70 ? `20${yy}` : `19${yy}`;
  return `${year}-${mm}-${dd}`;
};

const parseAmount = (raw: string): { value: number; negative: boolean } => {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith("-");
  const numeric = Number(trimmed.replace(/[^\d.]/g, ""));
  return { value: Number.isFinite(numeric) ? numeric : 0, negative };
};

const inferSectionHint = (fullText: string, index: number): TxType | null => {
  const start = Math.max(0, index - 3500);
  const lookback = fullText.slice(start, index).toLowerCase();
  const dep = lookback.lastIndexOf("deposits and other credits");
  const wit = lookback.lastIndexOf("withdrawals and other debits");
  if (wit > dep) return "expense";
  if (dep > wit) return "income";
  return null;
};

const inferType = (description: string, negative: boolean, sectionHint: TxType | null): TxType => {
  if (negative) return "expense";

  const d = description.toLowerCase();
  if (/(checkcard|purchase|payment to|wire out|zelle recurring payment to|zelle payment to|withdrawal|debit|service fee|shell|qt\s|walmart|home depot|autozone|lowe|motel|love's|7-eleven)/i.test(d)) {
    return "expense";
  }
  if (/(deposit|bkofamerica mobile|wire in|online transfer from|counter credit|refund|payment received|ach credit|square inc|payables|zelle received|zelle from)/i.test(d)) {
    return "income";
  }
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

    const dateStart = line.match(/^(\d{2}\/\d{2}\/\d{2})\b\s*(.*)$/);
    if (dateStart) {
      // New transaction starts, close previous if complete
      finalizePending();

      const [, date, remainder] = dateStart;
      pending = { date, descriptionParts: [], startIndex: consumedChars };

      if (remainder) {
        const amountAtEnd = remainder.match(/(-?\$?\d{1,3}(?:,\d{3})*\.\d{2})\s*$/);
        if (amountAtEnd) {
          pending.amountRaw = amountAtEnd[1];
          const descWithoutAmount = remainder.replace(/(-?\$?\d{1,3}(?:,\d{3})*\.\d{2})\s*$/, "").trim();
          if (descWithoutAmount) pending.descriptionParts.push(descWithoutAmount);
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
