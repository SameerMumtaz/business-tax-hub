

## Plan: Labor Budget Visibility & Worker Assignment Tracking in Scheduler

### Problem
The scheduler shows jobs but doesn't display labor budget info (budgeted hours/dollars), and there's no way to see how many labor hours are already assigned vs. remaining. The user needs to see at a glance which jobs need workers and how much labor capacity is left before exceeding the budget.

### Key Concept
Labor budget hours (e.g., 4 hours) represent **total labor capacity**, not per-worker duration. Assigning 2 workers × 2 hours each = 4 labor hours consumed. The system should track assigned hours vs. budgeted hours and warn when assignments would exceed the labor budget.

### Changes

**1. Add `assigned_hours` to job assignments** (DB migration)
- Add `assigned_hours numeric NOT NULL DEFAULT 0` column to `job_assignments` table so each assignment tracks how many hours that worker is allocated.

**2. Update `useJobs` hook**
- Update `JobAssignment` interface to include `assigned_hours`.
- Update `assignWorker` to accept `assignedHours` parameter.

**3. Add labor budget summary to job cards in the scheduler**

In the **Jobs table** (`JobSchedulerContent`), add columns:
- **Price** — job price
- **Labor Budget** — budgeted labor cost (flat or hours × rate)
- **Labor Assigned** — sum of assigned hours from `job_assignments`, shown as `X / Y hrs` with color coding (green = under budget, amber = near, red = over)

In the **Calendar view** (`JobCalendarView`), show a small labor indicator on job chips:
- e.g., `"2/4 hrs"` next to the job title on desktop cells

**4. Worker assignment panel on edit job dialog**

Add a section to the Edit Job dialog showing:
- Current assignments with name, assigned hours, and remove button
- "Assign Worker" button that opens a picker listing team members (employees + contractors) with their pay rates
- When assigning, user specifies hours for that worker
- Running total: `Assigned: X hrs / Y hrs budgeted` with remaining capacity
- Warning badge if total assigned hours would exceed labor budget hours
- For "amount" budget type: show dollar equivalent using each worker's pay rate vs. budget amount

**5. Update Job Profitability tab**

In `JobProfitabilityTab`, add an **"Expected vs. Actual"** comparison column:
- Show budgeted profit (from price/material/labor budget fields) alongside actual profit (from invoices/timesheets/expenses)
- This gives a forecast-to-actual variance view

### Files to modify
- **Migration**: Add `assigned_hours` to `job_assignments`
- `src/hooks/useJobs.ts` — update interface and `assignWorker`
- `src/components/team/JobSchedulerContent.tsx` — add labor columns to jobs table, add assignment panel to edit dialog
- `src/components/team/JobCalendarView.tsx` — show labor indicator on job chips
- `src/components/JobProfitabilityTab.tsx` — add expected profit column
- `src/components/job/JobBudgetFields.tsx` — export helper used by multiple components (already done)

### UI Sketch
```text
Jobs Table:
┌──────────┬────────┬──────────┬────────────────┬────────┬─────────┐
│ Title    │ Site   │ Price    │ Labor Budget   │ Crew   │ Actions │
├──────────┼────────┼──────────┼────────────────┼────────┼─────────┤
│ Lawn Job │ Oak St │ $1,200   │ 2/4 hrs ($200) │ 2 crew │ ✏️ 🗑️  │
│ Hedge    │ Elm Ln │ $800     │ 0/2 hrs ($0)   │ —      │ ✏️ 🗑️  │
└──────────┴────────┴──────────┴────────────────┴────────┴─────────┘

Edit Job Dialog — Assignment Section:
┌─────────────────────────────────────┐
│ 👷 Crew Assignments                 │
│ Labor Budget: 4 hrs ($120)          │
│ Assigned: 2 hrs ($60) — 2 hrs left  │
│                                     │
│ ┌─ John (contractor) · 2 hrs ── ✕ ┐│
│ └──────────────────────────────────┘│
│ [+ Assign Worker]                   │
│   → Pick worker, enter hours        │
│   → Shows warning if over budget    │
└─────────────────────────────────────┘
```

