

## Plan: Link Booking Conflict Detection to Job Time Blocks

### Problem
The public booking page currently detects scheduling conflicts by **parsing time ranges from job descriptions** using fragile regex matching (e.g., looking for "📅 Booked Appointment: 9:00 AM – 11:00 AM" in the description text). Now that jobs have proper `start_time` and `estimated_hours` columns, the booking system should use those directly.

### Changes

**1. Update `PublicBookingPage.tsx` — use real job time fields for conflicts**

- Change the jobs query from `select("start_date, description")` to `select("start_date, start_time, estimated_hours")`
- Replace the `jobTimeBlocks` memo that parses description text with simple arithmetic: `start = start_time in minutes`, `end = start + (estimated_hours * 60)`
- Remove the description-parsing regex entirely
- Update the `existingJobs` state type to match the new shape

This means:
- Every job with a `start_time` and `estimated_hours` will properly block booking slots
- Jobs created manually in the scheduler (not just from bookings) will also block availability
- No more reliance on description text formatting

**2. No database changes needed** — `start_time` and `estimated_hours` columns already exist on the jobs table.

**3. No changes to BookingRequestsPanel** — it already sets `start_time` and `estimated_hours` when creating jobs from confirmed bookings.

### Summary
One file change (`PublicBookingPage.tsx`): swap description-based time parsing for direct `start_time`/`estimated_hours` field usage in the conflict checker. This properly links the booking availability engine to the scheduler's time block data.

