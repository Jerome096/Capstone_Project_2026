# Dine-in staff assistance

Migration `database/08_staff_assistance.sql` adds `staff_assistance_requests`.
It is applied to the local QuvoCafeDB. The twelve tables from migration 07 remain
unconnected; this separate assistance table supports the requested Alerts feature.

An approved dine-in guest opens Call Staff, optionally writes up to 500 characters
and submits. A blank concern becomes “Staff assistance requested.” The request is
saved for that browser's approved table session, appears in staff Alerts and expires
60 seconds after submission. Resolve removes it from staff Alerts sooner, but the
customer still waits until the original minute ends before making another call.
The latest request and cooldown survive page reloads. Retrying during the minute
returns the saved request rather than creating another. Concerns are escaped on display.

The customer API uses the existing guest cookie and CSRF token. Staff list/resolution
uses existing Admin/Staff authentication and CSRF protection. Closure of a dine-in
session also removes its calls from active Alerts. Expired/resolved rows are retained.

Staff polls every five seconds and displays a one-second countdown, automatically
removing expired calls. Customer polling uses the existing five-second session check.
The existing scheduled expiry worker marks timed-out requests expired even when
browsers close; active API lists exclude them immediately at their deadline.

Checks: `C:\php85\php.exe tests/assistance.php` (SQL tests roll back),
`node tests/assistance.cjs` (popup, cooldown and safe concern display).
