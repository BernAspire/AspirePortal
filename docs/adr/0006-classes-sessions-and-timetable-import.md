# 0006 · Classes, sessions and the timetable import

Date: 29 Oct 2026 · Status: accepted (owner approved the Classes scope and spreadsheet input on 29 Oct 2026)

## Context

The student portal's Classes section (My Classes, Tutorials, Calendar, Attendance) needs timetables, rosters and attendance. There is no admin or teacher portal yet, and the owner chose a spreadsheet as the way staff enter this data for now.

## Decisions

1. **Tables** (migration `20261029000700_scheduling.sql`): `rooms`, `classes` (weekly template: weekday, start time, duration, first/last date), `class_sessions` (dated occurrences, from a class or one-off with its own code), `class_enrolments` (class roster with from/until dates), `bookings` (a student's seat in a session) and `attendance_records` (one per booking). Every table carries `centre_id` with composite foreign keys, and RLS is forced.
2. **Recurrence is weekly only** (weekday + time), generated in SQL in Singapore time. That covers the centre's timetable; `rrule` can replace it if fortnightly or irregular patterns appear.
3. **Clashes are exclusion constraints:** one room, and one teacher (by name, per centre), cannot be in two scheduled sessions that overlap. Cancelled sessions don't count. Teachers are stored by name with an optional `teacher_user_id`, because teachers may not have logins yet.
4. **Writes go through one function, `public.apply_timetable(centre, json)`**, run by the GitHub job with the service-role key (rule 5). It is a single transaction: the whole file succeeds or nothing changes. A class listed in an upload replaces its *upcoming* sessions; past sessions, bookings and attendance are never touched (attendance rows block deleting their booking). Capacity is checked after every upload. The spreadsheet is parsed and checked in Python first (`scripts/timetable_import`), so staff get row-level messages before anything reaches the database.
5. **Live-tutorial links are not columns students can read.** Column privileges hide `meeting_url`; `public.session_join_url()` returns it only to a booked student (or their guardian) whose programme covers the course today (rule 12), from 15 minutes before the start until the end, or to staff. The Join page redirects; the link is never written into the HTML.
6. **Reads:** students and guardians see only sessions, classes and attendance of their own students; teachers see nothing yet (teacher access via sessions comes with the teacher portal). Attendance and roster changes are audit-logged.
7. **Module:** `modules/scheduling` owns these tables for now (reads in `queries.ts`, rules in `service.ts`). When bookings and attendance get their own write paths (admin/teacher portals), they can move to `bookings` and `attendance` modules.

## Consequences

- Staff must keep class codes stable; a renamed code is a new class.
- Re-uploading a whole term is safe and idempotent.
- Homework on the calendar, booking rules (cut-offs, credits, make-ups by families) and teacher access are later work.
