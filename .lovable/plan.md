

# PDF Parser Overhaul: AI-First with Structured Page Data

## Problem

The current pipeline reconstructs text client-side (lossy spatial flattening), then sends a giant text blob to the AI. This breaks on varied bank formats because column alignment is lost, junk rows blend in with transactions, and the AI hallucinates without structural context.

## Strategy

**Keep pdfjs client-side for extraction, but send raw positioned items (not flattened text) to the edge function. Let a fast, cheap AI model (gemini-2.5-flash-lite — already in use) do the heavy lifting with much better input.**

The key insight: the current system throws away the most valuable data (X/Y positions, column structure) before the AI ever sees it. We fix that.

---

## Changes

### 1. Client-Side: Send Raw Items Instead of Text

**Files: `useImportLogic.ts`, `PersonalImportPage.tsx`**

- After pdfjs extracts each page, instead of calling `reconstructPageText()` and sending a string, collect the raw items: `{str, x, y, width, height}` per item, plus page dimensions
- Chunk by page groups (5-8 pages per chunk) instead of character count — this preserves page boundaries
- Send payload as `{pages: [{pageNum, width, height, items: [...]}], docType}` to the edge function
- Keep parallel chunking (up to 6 concurrent) and ETA logic unchanged

### 2. Edge Function: Server-Side Column Detection + AI

**File: `supabase/functions/parse-pdf/index.ts`**

The edge function gains a structured extraction pipeline when it receives `pages` format:

**Step A — Detect table columns:**
- Scan all items for header keywords (Date, Description, Amount, Debit, Credit, Balance, etc.)
- Record their X-positions as column anchors
- Handle common layouts: `Date|Description|Debit|Credit|Balance`, `Trans Date|Post Date|Description|Amount`, single-amount columns

**Step B — Group items into rows:**
- Cluster items by Y-coordinate (tolerance-based, adaptive to font size — reuse existing logic from `pdfTextExtract.ts` but on the server)
- Sort left-to-right within each row

**Step C — Assign columns and build structured table:**
- Map each item to its nearest column header by X-position
- Build a clean markdown table for the AI:
```
Columns: Date | Description | Debit | Credit | Balance
01/15 | AMAZON MARKETPLACE | 45.99 | | 1,234.56
01/15 | DIRECT DEPOSIT PAYROLL | | 2,500.00 | 3,734.56
```

**Step D — AI extraction with structured input:**
- Send the markdown table (not raw text) to gemini-2.5-flash-lite
- Updated prompt explicitly tells the model the column layout and to ignore balance columns, subtotals, and summary rows
- Same tool-calling approach for structured output

**Step E — Enhanced regex fallback:**
- If AI fails, use the detected columns to extract date/description/amount by position directly — no text reconstruction needed
- This is far more accurate than the current line-by-line regex

**Step F — Smarter junk filtering:**
- Detect repeated text across pages (headers/footers) and strip them before AI sees the data
- Skip rows where all items land in a single column
- More aggressive balance/summary/subtotal filtering in post-process

### 3. Backward Compatibility

- Edge function accepts both old `{text}` format and new `{pages}` format
- Old format triggers current behavior (existing regex fallback)
- New format triggers the structured pipeline
- `pdfTextExtract.ts` remains available for other uses but import flows switch to raw items

### 4. W-2 Handling

- W-2s already use the `parse-w2` function with spatial extraction — no changes needed there
- The `parse-pdf` W-2 branch continues to use the existing regex parser

---

## Why This Works

| Current problem | Fix |
|---|---|
| Column data merged into one string | Raw X/Y positions preserved; server-side column detection |
| AI hallucinates from messy text | AI receives clean markdown table with labeled columns |
| Bank format changes break parsing | Column headers detected dynamically, not hardcoded patterns |
| Too many junk rows | Repeated headers/footers stripped; balance column identified and excluded |
| Wrong amounts (balance vs transaction) | Rightmost column detected as balance and filtered |

## Files Modified

1. `supabase/functions/parse-pdf/index.ts` — Major rewrite: add column detection, row grouping, structured AI prompt, enhanced regex fallback
2. `src/hooks/useImportLogic.ts` — Send raw page items instead of text, chunk by page groups
3. `src/pages/PersonalImportPage.tsx` — Same raw-items approach for personal import
4. `src/lib/pdfTextExtract.ts` — Add `extractRawItems()` helper; keep existing functions

