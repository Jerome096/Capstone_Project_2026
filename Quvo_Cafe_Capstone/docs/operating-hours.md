# Operating hours and reporting days

Admin > Operating hours saves an opening time, closing time and future effective
business date. Staff can read the shared reporting clock but cannot change hours.
Write requests require a confirmed administrator session and CSRF protection.

Run `database/21_operating_hours.sql` once against the existing cafe database. It is
idempotent and has no `USE` statement. It preserves calendar-day history and adds
the initial 15:00–02:00 schedule starting on the next Philippine calendar date.
It does not change orders, payments, receipts or saved EOD records. Running setup
again keeps the existing schedules and settings version.

Sales History cards, daily/monthly/yearly Reports, dashboard completed counts and
EOD use the opening date. A 01:00 payment with 15:00–02:00 hours belongs to the
previous calendar date. Payment ranges end at the next opening, exclusively;
payments after scheduled closing remain included and the daily report identifies
their count. Receipt timestamps and customer-upload date filters keep their
existing calendar-date behavior.

Schedules are versioned by effective business date. Editing an active or past day
is rejected. A future opening must also be after the database server's current
time. Old EOD dates and totals remain immutable. When the next opening changes,
the preceding unfinished reporting day extends or shortens to that opening, so
there is no overlap or gap. Reports display their actual time range.

The settings version prevents an older browser draft from overwriting another
admin's save. A retry after a lost successful response returns the saved matching
schedule without a second audit entry. Every successful change is audited.

Operating hours define reporting dates. Existing Start/Pause ordering controls
continue to control customer ordering. The separate ten-minute last-logout timer
can pause ordering; the operating-hour schedule itself does not close ordering.

Verification: `tests/operating-hours.php` checks permissions, overnight boundaries,
month/year totals, minute precision, future changes, EOD, audit and retries in a
rollback transaction. `tests/reports.php`, `tests/sales-history.php` and
`tests/dashboard-eod.php` explicitly use the legacy schedule inside rollback
transactions to retain calendar-history regression coverage. The database-free
`tests/business-day.cjs` and `tests/report-periods.php` check clock and period math.
