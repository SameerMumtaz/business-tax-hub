

# Crew Dashboard UX Overhaul

## Current State
The crew dashboard is a single page with 4 tabs (Jobs, Calendar, Map, Profile). The Jobs tab shows ALL assigned jobs in a flat list — no distinction between today, this week, or past jobs. The sidebar only has "My Jobs" and "Check-in History" (history route doesn't even exist in App.tsx).

## Plan

### 1. Restructure CrewJobsList into "This Week's Jobs"
**What changes:** Instead of showing all jobs in one flat list, split them into sections:
- **Today** — highlighted section at top with check-in buttons, bold styling
- **This Week** (remaining days) — upcoming jobs this week, lighter styling, no check-in button (only available on the day)
- **Upcoming** — next 2-3 jobs beyond this week as a teaser, with a "View all in Calendar" link

Jobs that are past and not recurring get filtered out entirely from the list view.

**File:** `src/components/crew/CrewJobsList.tsx`

### 2. Improve Job Cards Visual Design
**What changes:**
- Add color-coded left border (green = today, blue = upcoming, gray = completed)
- Show day-of-week labels ("Today", "Tomorrow", "Wednesday", etc.) instead of raw dates
- Make check-in button more prominent with a gradient or filled style for today's jobs
- Add subtle time-remaining indicator ("starts in 2h")
- Compact the info layout — site name, time, and pay on one line

**File:** `src/components/crew/CrewJobsList.tsx`

### 3. Improve Active Check-in Card
**What changes:**
- Move the active check-in card to be more visually prominent — add a green gradient border/glow
- Add a progress bar showing elapsed time vs expected hours
- Make photo upload buttons more touch-friendly with larger tap targets

**File:** `src/pages/CrewDashboardPage.tsx`

### 4. Clean Up Page Header & Navigation
**What changes:**
- Add a greeting ("Good morning, [First Name]") using profile data
- Show a compact summary strip: "2 jobs today · 5 this week"
- Remove the Sign Out button from the header (it's already in the sidebar)
- Make tabs bottom-anchored on mobile for thumb-friendly navigation

**File:** `src/pages/CrewDashboardPage.tsx`

### 5. Add Quick Stats Strip
**What changes:** Add a horizontal scrollable strip of mini stat cards above the job list:
- Hours this week (from check-ins)
- Earnings this week (hours × pay rate)
- Jobs completed this week
- Next job countdown

**File:** `src/pages/CrewDashboardPage.tsx`

### 6. Calendar View Polish
**What changes:**
- Calendar already works well; add a "View full calendar" CTA from the jobs list
- No major structural changes needed

### Technical Details

**Job filtering logic (CrewJobsList):**
```text
today = getTodayDateOnlyKey()
weekEnd = addDaysToDateOnly(today, 6 - todayDayOfWeek) // end of week (Sun)

todayJobs = jobs where getNextInstanceDate(job) === today
thisWeekJobs = jobs where date > today && date <= weekEnd
upcomingJobs = jobs where date > weekEnd (show first 3)
```

**Files to modify:**
- `src/components/crew/CrewJobsList.tsx` — Section-based layout with Today/This Week/Upcoming
- `src/pages/CrewDashboardPage.tsx` — Greeting, stats strip, improved check-in card, mobile-friendly tabs
- `src/components/CrewSidebar.tsx` — Minor label updates if needed

**No database changes required.** All data is already available from existing queries.

