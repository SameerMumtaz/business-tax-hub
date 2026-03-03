

## Plan: Should-Have Features for TaxDash — COMPLETED ✅

All eight improvements have been implemented:

1. ✅ **Confirmation Dialogs** — AlertDialog on all bulk delete and single-delete buttons (Expenses, Sales, Clients)
2. ✅ **Pagination** — PAGE_SIZE=50 with Previous/Next controls on Expenses and Sales; Supabase limit raised to 5000
3. ✅ **Full Expense Editing** — Edit button per row opens dialog for date/vendor/description/amount/category
4. ✅ **Duplicate Detection at Import** — Checks parsed transactions against existing DB records by date+amount; auto-excludes dupes with "Duplicate" badge
5. ✅ **Bank Reconciliation** — New page + DB table; compare recorded transactions against statement balance, mark periods as reconciled
6. ✅ **Client Profitability** — New "Profitability" tab on Clients page with revenue/expenses/profit/margin table + bar chart
7. ✅ **Tax Payment Reminders** — Alert banners on Tax Center for upcoming (30 days) and overdue quarterly payments
8. ✅ **Dashboard Date Filtering** — Already implemented (YTD default via DateRangeContext)
