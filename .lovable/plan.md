

# Refactoring Plan: Component Splitting, Dark Mode Colors, Account Switching

## 1. Extract Shared Chart Constants (`src/lib/chartTheme.ts`)

Create a single source of truth for chart colors and axis styling:

- `CHART_COLORS`: Array of 8 CSS-token-based colors (`hsl(var(--chart-positive))`, `hsl(var(--chart-negative))`, `hsl(var(--chart-warning))`, `hsl(var(--chart-info))`, plus 4 additional tokens)
- `AXIS_STYLE`: Reusable axis stroke/tick config using `hsl(var(--border))` and `hsl(var(--muted-foreground))`
- `TOOLTIP_STYLE`: Shared tooltip contentStyle using CSS tokens

Add 4 new CSS custom properties to `index.css` (both light and dark):
- `--chart-1` through `--chart-5` (some already referenced in ExpensesPage but not defined)

## 2. Fix Hardcoded Colors (5 files)

Replace all hardcoded `hsl(160, 84%, 39%)`, `hsl(220, 13%, 90%)`, etc. with imports from `chartTheme.ts`:

- `DashboardPage.tsx`: COLORS array + inline BarChart stroke/fill values
- `PersonalDashboardPage.tsx`: COLORS array
- `ProfitLossPage.tsx`: CartesianGrid stroke, XAxis/YAxis stroke, Bar fill
- `AgingReportPage.tsx`: One hardcoded color (`hsl(230, 60%, 55%)`)
- `ExpensesPage.tsx`: Two hardcoded fallback colors in LINE_COLORS

## 3. Refactor ImportPage (1,243 lines → ~5 files)

Split into focused components under `src/components/import/`:

| New File | Responsibility | Approx Lines |
|---|---|---|
| `UploadPanel.tsx` | CSV/PDF/Bank upload tabs, drag-drop, file processing | ~200 |
| `TransactionReviewTable.tsx` | Review table with sorting, pagination, select/delete/category | ~250 |
| `ImportAuditPanel.tsx` | Audit issues display, suggestions, apply/dismiss | ~150 |
| `RuleSuggestionsPanel.tsx` | Rule creation from edits, save individual/all rules | ~100 |
| `useImportLogic.ts` | Custom hook: all state, parsing, categorization, import mutation logic | ~350 |

`ImportPage.tsx` becomes a ~100-line orchestrator composing these pieces.

## 4. Refactor SalesPage (504 lines → ~4 files)

Split into `src/components/sales/`:

| New File | Responsibility |
|---|---|
| `SalesTable.tsx` | Table with sorting, selection, inline category edit, delete, invoice creation |
| `CashFlowTab.tsx` | StatCards + ComposedChart + monthly breakdown table |
| `useSalesLogic.ts` | Hook: state, derived data, handlers (add/delete/sort/bulk/invoice) |

`SalesPage.tsx` becomes ~80 lines: layout + tabs + composed components.

## 5. Refactor ExpensesPage (545 lines → ~4 files)

Split into `src/components/expenses/`:

| New File | Responsibility |
|---|---|
| `ExpensesTable.tsx` | Table with sorting, selection, category edit, delete, receipt upload |
| `SpendingTrendsTab.tsx` | LineChart + category filter for trends view |
| `useExpensesLogic.ts` | Hook: state, filtering, sorting, handlers |

`ExpensesPage.tsx` becomes ~80 lines.

## 6. Account Type Switcher

Add a switcher to both `AppSidebar.tsx` and `PersonalSidebar.tsx`:

- Render a small dropdown/button near the sidebar header showing current mode (Business/Individual)
- On switch: update `profiles.account_type` in the database, call `recheckProfile()` from `useProfileGate`, then navigate to `/` or `/personal`
- Include a confirmation dialog since switching redirects to a different route tree

## Implementation Order

1. Chart theme file + CSS variables (foundation, no breaking changes)
2. Color replacements across 5 pages (mechanical find-replace)
3. ImportPage refactor (largest file, highest value)
4. SalesPage refactor
5. ExpensesPage refactor
6. Account type switcher in both sidebars

