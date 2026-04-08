
Goal: make statement import fail-safe and faster. Right now it is both too permissive and too expensive.

What I found
- Both import flows (`src/hooks/useImportLogic.ts` and `src/pages/PersonalImportPage.tsx`) chunk by fixed 6-page groups and send every chunk to `parse-pdf`.
- The current sample request includes page 1 summary totals and page 2 “IMPORTANT INFORMATION” legal text, so we are paying parsing cost on pages that are not transactions.
- `parse-pdf` still treats AI as the primary path whenever it detects 2+ columns. Recent edge executions are about 43–58s each, which explains the slowdown.
- There is still no reconciliation against the statement’s own totals/counts, even though page 1 contains deposits `$92,786.53`, withdrawals `$109,297.92`, and counts `26 / 623`.
- Session replay shows one run extracting only 104 transactions from 26 pages, so we are missing a large share of rows before we even get to review.
- Column detection is still fragile because it relies on early-page headers and nearest-center assignment, which can swap debit/credit or pull in summary content.

Plan
1. Split “statement metadata” from “transaction parsing”
   - Extract official totals, counts, date range, and bank/profile hints from summary pages first.
   - Add page classification: `summary`, `transaction_detail`, `legal_marketing`, `unknown`.
   - Exclude legal/marketing pages from transaction parsing entirely.

2. Make parsing deterministic-first, AI-second
   - Move `supabase/functions/parse-pdf/index.ts` to a deterministic primary pipeline for bank statements.
   - Parse rows by geometry, stitch multiline descriptions, and read debit/credit/balance columns explicitly.
   - Use multiple signals for type classification:
     - separate debit vs credit columns
     - section markers
     - signed amount formatting
     - running balance delta when balance exists
   - Use AI only as a rescue pass for unresolved rows/pages, not as the default for every chunk.

3. Add reconciliation and fail-closed behavior
   - After parsing, compare parsed income/expense totals and counts to the statement’s official totals/counts.
   - If mismatched, run targeted recovery:
     - reclassify only ambiguous rows
     - retry skipped rows/pages
     - AI-rescue only unresolved rows with local context
   - If still mismatched, return a reconciliation failure instead of a confident but wrong result.
   - In the UI, show Expected vs Parsed totals/counts and disable import until reconciled.

4. Fix chunking and latency
   - Stop chunking by raw page count alone.
   - Chunk only contiguous `transaction_detail` pages, preserving section context.
   - Detect columns from candidate transaction pages, not just the first 3 pages.
   - Lower/adapt concurrency for AI rescue work so we do not fan out 5–6 long AI calls at once.
   - Add timing logs for extraction, classification, deterministic parse, AI rescue, and reconciliation.

5. Make it bank-agnostic without depending on section headers alone
   - Add a layout-profile layer: BoA/Chase/Wells-style hints plus a generic fallback.
   - Use x-band ranges instead of nearest-center-only column assignment.
   - Support statements with:
     - separate debit/credit columns
     - single amount + balance
     - section-based layouts
     - no clear section headers

6. Unify both import clients
   - Move shared chunking/request/reconciliation logic out of duplicated page code so business and personal imports cannot drift apart.
   - Keep one parser contract for both review screens.

7. Add real regression coverage
   - Add edge-function tests for:
     - the BoA sample reconciling to `$92,786.53` income and `$109,297.92` expense
     - expected counts `26 / 623`
     - separate debit/credit layouts
     - single-amount-with-balance layouts
     - mixed PDFs with summary/legal pages
     - statements with non-BoA section wording

Technical details
```text
PDF
 -> summary extractor
 -> page classifier
 -> deterministic row parser
 -> reconciliation engine
 -> AI rescue only for unresolved rows
 -> review UI with reconciliation status
```

Files to update
- `supabase/functions/parse-pdf/index.ts`
- `src/lib/pdfTextExtract.ts`
- `src/hooks/useImportLogic.ts`
- `src/pages/ImportPage.tsx`
- `src/pages/PersonalImportPage.tsx`
- `supabase/functions/parse-pdf/*test.ts`

Expected result
- The BoA sample will not be marked complete unless it reconciles to the statement totals/counts.
- Debit/credit swaps should drop sharply because section headers become one signal, not the whole classifier.
- Parse time should improve because we stop parsing summary/legal pages and stop sending easy rows through AI.
- Chunk times should become more consistent because we will process actual transaction pages instead of mixed-content 6-page slabs.

No database changes are needed for this.
