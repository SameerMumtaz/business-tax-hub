

## Plan: Should-Have Features for TaxDash

Eight improvements spanning confirmation dialogs, pagination, full expense editing, duplicate prevention at import, client profitability, and tax reminders.

---

### 1. Confirmation Dialogs on Destructive Actions

**Files:** `ExpensesPage.tsx`, `SalesPage.tsx`, `ImportPage.tsx`

- Wrap all bulk delete buttons and single-delete buttons in an `AlertDialog` from the existing `alert-dialog.tsx` component.
- Pattern: clicking Delete opens the dialog with count and description, only executes mutation on confirm.
- Apply to: `handleBulkDelete` in Expenses, `handleBulkDelete` in Sales, single row delete buttons in both pages.

---

### 2. Pagination on Expenses and Sales Tables

**Files:** `ExpensesPage.tsx`, `SalesPage.tsx`, `useData.ts`

- Add client-side pagination (PAGE_SIZE = 50) to both tables, matching the existing pattern in `ImportPage.tsx`.
- Add page controls (Previous/Next + page indicator) below each table using the existing `Pagination` components.
- Fix the Supabase 1000-row limit: remove the default limit by adding `.limit(10000)` or paginating server-side. For now, increase to a reasonable cap like 5000 with a note to the user if truncated.

---

### 3. Full Expense Editing (Inline or Dialog)

**Files:** `ExpensesPage.tsx`

- Add an edit button per row that opens a dialog pre-filled with date, vendor, description, amount, category.
- On save, call the existing `useUpdateExpense` mutation (which already supports all fields).
- Reuse the same form layout as the "Add Expense" dialog.

---

### 4. Duplicate Detection at Import Time

**Files:** `ImportPage.tsx`

- After parsing transactions and before showing the review table, query existing expenses and sales from the DB (already available via `useExpenses`/`useSales` hooks).
- For each parsed transaction, check if a record with the same date + amount + similar description (first 20 chars) already exists.
- Mark duplicates with a warning badge and auto-set `include: false`.
- Show a summary toast: "X potential duplicates found and excluded."

---

### 5. Bank Account Reconciliation

**Files:** New `src/pages/ReconciliationPage.tsx`, migration for `reconciliation_periods` table, `AppSidebar.tsx`, `App.tsx`

- **DB table:** `reconciliation_periods` with columns: `id`, `user_id`, `account_name`, `period_start`, `period_end`, `statement_balance`, `reconciled_at`, `status` (open/reconciled).
- **Page:** Shows a list of reconciliation periods. User enters account name, date range, and ending statement balance. The system sums all expenses+sales in that range, shows difference, and lets user mark as reconciled.
- Once reconciled, the Import page can warn if importing transactions within a reconciled period.

---

### 6. Profit Margin by Client

**Files:** New section on `ClientsPage.tsx` or new `ClientProfitabilityPage.tsx`

- Add a "Profitability" tab on the existing Clients page.
- For each client: sum all sales where `client` matches, sum all expenses where `vendor` matches the client name.
- Display a table: Client | Revenue | Expenses | Profit | Margin %.
- Add a bar chart showing top/bottom clients by margin.

---

### 7. Tax Payment Reminders/Notifications

**Files:** `TaxCenterPage.tsx`

- Add a persistent banner at the top of the Tax Center that checks quarterly due dates (Apr 15, Jun 15, Sep 15, Jan 15 of next year) against the current date.
- If a due date is within 30 days and no payment recorded for that quarter, show a warning alert.
- If a due date has passed with no payment, show a red alert.
- No external notification system needed — just in-app awareness on the Tax Center and optionally on the Dashboard.

---

### 8. Dashboard Date Filtering Default

**Files:** `DashboardPage.tsx`

- The Dashboard already uses `useDateRange()` and `filterByDate()`. The `DateRangeContext` defaults to YTD. This should already work.
- Verify the Dashboard page actually renders `<DateRangeFilter />` — it does (line 67 of DashboardPage). This item is already implemented. No changes needed.

---

### Technical Notes

- **Confirmation dialogs**: Use the existing `AlertDialog` component — no new dependencies.
- **Pagination**: Client-side slicing with `sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)`. Add a `useMemo` for `totalPages`.
- **Duplicate detection**: Compare `date + Math.abs(amount)` with a tolerance of ±$0.01, plus Levenshtein or substring match on description.
- **Reconciliation table migration**: Standard table with RLS `auth.uid() = user_id`.
- **Client profitability**: Pure computed view — no DB changes needed. Fuzzy match client names to vendor names for expense attribution.

### Estimated Scope
- 3 file edits (Expenses, Sales, Import)
- 2 new files (ReconciliationPage, migration)
- 1 significant edit (ClientsPage — profitability tab)
- 1 minor edit (TaxCenterPage — reminder banner)
- Sidebar + router updates

