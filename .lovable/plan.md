## Plan: AI-Powered PDF Parsing with Improved Client Extraction

The user uploaded three reference files showing an improved architecture.

### What Changes

**1. Rewrite `supabase/functions/parse-pdf/index.ts**` — Replace the 300-line regex parser with an AI-powered parser

- Accept `{ text, docType }` from client (backward compatible — `text` still works alone)
- For `bank_statement` or `unknown`: call Claude Haiku with a strict JSON schema prompt. Set `ANTHROPIC_API_KEY` in your Supabase secrets.
- For `w2`: use rule-based regex parsing (from uploaded reference — standardized IRS layout, no AI needed)
- Use **tool calling** (not raw JSON output) for structured extraction — more reliable than asking the model to return JSON
- Post-process: filter out any lines matching subtotal/total/balance patterns as a safety net
- Map AI response to existing `{ transactions: [{date, description, amount, type}] }` format so no client changes needed for the response contract
- Handle 429/402 errors from AI gateway and surface them
- Keep the existing regex parser as a fallback if AI call fails

**2. Upgrade `src/lib/pdfTextExtract.ts**` — Improve spatial reconstruction

- Adopt the tolerance-based Y-band clustering from the uploaded `PDF_Extractor_Client.ts` (uses `height * 0.3` gap detection instead of fixed 40px, which adapts to font size)
- Add document type detection (`w2` vs `bank_statement`) based on keyword matching — send as hint to edge function
- Export a `detectDocType()` function

**3. Update `src/hooks/useImportLogic.ts**` — Send docType hint, simplify chunking

- After text extraction, run `detectDocType()` on the full text
- Pass `{ text, docType }` to the edge function instead of just `{ text }`
- Keep chunking logic for large statements (50K char chunks)

**4. Update `supabase/config.toml**` — Register parse-pdf function

- Add `[functions.parse-pdf]` with `verify_jwt = false`

### AI Prompt Design (Edge Function)

The prompt will instruct Claude Haiku to:

- Extract every individual transaction (date, description, amount, type)
- Use negative amounts for debits, positive for credits — then we normalize to `{amount, type}` on our side
- Skip subtotals, running balances, section headers, account summaries
- Handle any bank format without institution-specific logic
- For credit cards: payments to card = income, charges = expense

### No Breaking Changes

The edge function response format stays `{ transactions: [...] }` so `ImportPage`, `PersonalImportPage`, and all review/audit logic works unchanged.