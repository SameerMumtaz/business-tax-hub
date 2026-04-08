
Goal

- Pivot the statement importer to a vision-first pipeline that fixes the “almost everything became income” failure and stops bad parses from being importable.

What’s actually broken in the current code

- `src/lib/pdfImportHelper.ts` still extracts PDF text/items and sends chunked structured pages to `parse-pdf`; there is no image pipeline yet.
- In `supabase/functions/parse-pdf/index.ts`, `processPages()` accepts deterministic output as soon as it finds any rows, even if totals are obviously wrong.
- `deterministicParse()` classifies many amount-only rows from inherited section state (`currentSection`), so if a withdrawal header is missed, a whole chunk can skew to income.
- `src/pages/ImportPage.tsx` and `src/pages/PersonalImportPage.tsx` show mismatch banners, but they do not actually block import.

Recommended approach

- Yes to using images for statement extraction.
- But not “pure image-only for everything.” The best version here is:
  - vision-first for transaction extraction
  - lightweight PDF/text signals only for routing, summary totals, and cheap fallbacks
- Full image-only on every page would likely be costlier and not automatically faster. Speed will come from rendering only the right pages, using compressed images, and retrying only suspect pages.

Implementation plan

1. Add a page-image pipeline in `src/lib/pdfImportHelper.ts`
   - Render PDF pages to compressed JPEG/WebP images client-side.
   - Separate summary pages from transaction pages before sending.
   - Chunk by page/section in small groups, not large arbitrary slabs.
   - Preserve page numbers so retries can target specific pages.

2. Rework `supabase/functions/parse-pdf/index.ts` around vision extraction
   - Stage A: extract statement totals/counts/date range from summary pages.
   - Stage B: extract transactions from page images with multimodal structured output.
   - Require page-numbered transactions so every row is traceable.
   - Stop relying on inherited chunk section as the main type classifier.

3. Make reconciliation the acceptance gate
   - Never accept a parse just because rows were found.
   - Compare parsed income/expense totals and counts against statement totals immediately.
   - If mismatched, auto-retry only the suspect pages/chunks with:
     - smaller chunks
     - higher image quality
     - stricter prompts
   - If still mismatched, return a failure state instead of “successful but wrong.”

4. Add guardrails for the “everything is income” bug
   - Detect lopsided outputs when the statement summary clearly contains both deposits and withdrawals.
   - Force reparse on those pages instead of surfacing the result.
   - Add page-level sanity rules so one missed section header cannot poison an entire chunk.

5. Keep deterministic text parsing only as a fallback
   - Use it for clean digital statements when it reconciles correctly.
   - Do not let deterministic output win if reconciliation fails.
   - This preserves speed on easy PDFs without trusting the current brittle path.

6. Make the UI fail closed
   - In `src/pages/ImportPage.tsx` and `src/pages/PersonalImportPage.tsx`, disable Import when reconciliation is mismatched.
   - Show expected vs parsed totals/counts plus retry status.
   - Surface “needs review / retry” instead of allowing bad data through.

7. Add regression tests
   - Cover the current sample so it must reconcile to:
     - income: `$92,786.53`
     - expense: `$109,297.92`
   - Also cover:
     - separate debit/credit layouts
     - single-amount-with-balance layouts
     - scanned/image-heavy statements
     - non-BoA section wording
   - Add one explicit test preventing the “nearly all income” failure mode.

Technical details

```text
PDF upload
 -> render selected pages to compressed images
 -> extract statement totals/counts
 -> vision extract transaction pages
 -> reconcile
 -> targeted retry on bad pages only
 -> block import unless reconciled
```

Files to update

- `src/lib/pdfImportHelper.ts`
- `supabase/functions/parse-pdf/index.ts`
- `src/lib/pdfTextExtract.ts`
- `src/hooks/useImportLogic.ts`
- `src/pages/ImportPage.tsx`
- `src/pages/PersonalImportPage.tsx`
- `supabase/functions/parse-pdf/*test.ts`

Expected result

- The parser stops collapsing whole chunks into income when section detection misses.
- Hard statement layouts become more accurate because extraction is based on page visuals, not brittle inferred geometry.
- Parse times should improve versus the current bad path because we will process smaller image chunks and skip non-transaction pages.
- Bad parses will no longer be importable.
