

# Four New Financial Report Pages

## Overview
Add four new report pages to TaxDash: Cash Flow Statement, P&L Comparison, Expense Trends & Alerts, and Tax Liability Estimator. All pages reuse existing data hooks (`useExpenses`, `useSales`) and Recharts, requiring no database changes.

---

## 1. Cash Flow Statement (`/cash-flow`)
**Monthly inflows vs outflows with running balance**

- Group sales (inflows) and expenses (outflows) by month
- Compute running cumulative balance across months
- Render a combo chart: stacked bars for inflows/outflows + line overlay for running balance
- Summary KPIs at top: total inflows, total outflows, net cash flow, current balance
- Table below chart with monthly breakdown columns

## 2. Monthly/Quarterly P&L Comparison (`/pl-compare`)
**Side-by-side periods with % change trends**

- Toggle between Monthly and Quarterly views via Tabs component
- Build period pairs (current vs previous) showing revenue, expenses, net income
- Calculate % change between periods with color-coded arrows (green up, red down)
- Render a grouped BarChart comparing two periods side by side
- Summary table with period columns and delta % column

## 3. Expense Trends & Alerts (`/expense-trends`)
**Category spending over time, flag spikes vs averages**

- Multi-line chart: one line per top expense category over months
- Compute 3-month rolling average per category
- Flag months where spending exceeds 1.5x the rolling average as "spikes"
- Alert banner at top listing any current-month spikes with category name and % over average
- Category filter dropdown to focus on specific categories

## 4. Tax Liability Estimator (`/tax-estimate`)
**Projected federal + state + SE tax with quarterly schedule**

- Uses existing `taxCalc.ts` functions plus self-employment tax logic (15.3% SE rate on 92.35% of net income)
- Pulls net income from sales minus expenses, plus business state from profile
- Displays estimated federal income tax, state income tax, SE tax, and total liability
- Quarterly payment schedule: divides total by 4 with IRS due dates (Apr 15, Jun 15, Sep 15, Jan 15)
- Progress bar showing how much of the year has elapsed vs estimated liability accrued

---

## Technical Details

### New Files
- `src/pages/CashFlowPage.tsx`
- `src/pages/PLComparePage.tsx`
- `src/pages/ExpenseTrendsPage.tsx`
- `src/pages/TaxEstimatePage.tsx`

### Modified Files
- `src/App.tsx` -- add 4 new routes inside ProtectedRoute
- `src/components/AppSidebar.tsx` -- add 4 nav links (Cash Flow, P&L Compare, Expense Trends, Tax Estimate) with appropriate Lucide icons

### Shared Patterns
- All pages use `DashboardLayout`, `useExpenses()`, `useSales()`, `formatCurrency()`
- Charts use Recharts components already imported across the app (BarChart, LineChart, Tooltip, etc.)
- Tax Estimator additionally uses `useProfile()` for business state and `calculateWithholdings()` from `taxCalc.ts`
- No new dependencies or database migrations required

### Sidebar Organization
The sidebar will grow from 9 to 13 links. The new entries will be grouped logically:
- Cash Flow after Profit & Loss
- P&L Compare after Cash Flow
- Expense Trends after Expenses
- Tax Estimate before Tax Forms

