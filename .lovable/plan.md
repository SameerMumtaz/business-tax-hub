

# Smart Job Drop Positioning — Revised Drag Logic

## What's Changing

Replace the current `computeTimeForIndex` function with smarter time-slot calculation that accounts for the moved job's duration and adds a 20-minute buffer between jobs.

## Current Behavior
- **Drop above first job**: Starts 30 min before the first job (arbitrary)
- **Drop below last job**: Starts right when last job ends (no buffer)
- **Drop between jobs**: Midpoint of gap (ignores moved job's duration)

## New Behavior

**Drop ABOVE a job (index 0 or before a specific job):**
- Calculate: `new_start = next_job_start - moved_job_duration - 20min_buffer`
- Ensures the moved job ends 20 minutes before the next job starts
- Floor at 00:00 if result goes negative

**Drop BELOW a job (after last job, or after a specific job):**
- Calculate: `new_start = previous_job_end + 20min_buffer`
- Where `previous_job_end = prev_start_time + prev_estimated_hours`
- Cap at 23:59 if result overflows

**Drop BETWEEN two jobs (middle position):**
- Same as "drop below" — start 20 min after the job above ends
- Then validate: would the moved job end before the next job starts? If not, warn but still allow (user can edit after)

**Drop on empty day:**
- Keep existing behavior (no time set, or default to 8:00 AM)

**Drop on same position as adjacent job (side-by-side / next to):**
- Match the start time of the neighboring job

## Additional Improvements to Add

1. **Visual time preview on drag**: Show the computed start time in the drop zone label (e.g., "↓ Move here · 2:20 PM") so the user knows what time will be assigned before dropping

2. **Overflow warning**: If the computed end time exceeds 6:00 PM (end of typical workday), show a subtle amber indicator on the drop zone

3. **Snap to 5-minute increments**: Round computed times to nearest 5 minutes for cleaner scheduling

## Crew Conflict Logic
Unchanged — `detectConflicts` already checks crew overlap using time windows. The new `computeTimeForIndex` feeds a more accurate `proposedStartTime` into the conflict check, making it more reliable.

## Files to Modify

- **`src/components/team/JobCalendarView.tsx`**:
  - Rewrite `computeTimeForIndex` with the new buffer-aware logic
  - Update drop zone labels to show computed time preview
  - Add 5-minute rounding helper
  - Pass moved job's duration into time calculation

## Technical Detail

```text
computeTimeForIndex(dateStr, dropIndex, excludeJobId, movedJobDuration):

  dayJobs = sorted jobs on dateStr (excluding moved job)
  BUFFER = 20 minutes

  if dayJobs empty → return "08:00" (sensible default)

  if dropIndex <= 0 (above all):
    nextJob = dayJobs[0]
    nextStart = parseTime(nextJob.start_time)
    newStart = nextStart - movedJobDuration - BUFFER
    return roundTo5Min(max(0, newStart))

  if dropIndex >= dayJobs.length (below all):
    prevJob = dayJobs[last]
    prevEnd = parseTime(prevJob.start_time) + prevJob.estimated_hours
    newStart = prevEnd + BUFFER
    return roundTo5Min(min(23:59, newStart))

  else (between):
    prevJob = dayJobs[dropIndex - 1]
    prevEnd = parseTime(prevJob.start_time) + prevJob.estimated_hours
    newStart = prevEnd + BUFFER
    return roundTo5Min(newStart)
```

