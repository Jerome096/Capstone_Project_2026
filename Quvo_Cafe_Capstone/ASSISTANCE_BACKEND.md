# Dine-in staff assistance

Migration `database/08_staff_assistance.sql` adds `staff_assistance_requests`.
It is applied to the local QuvoCafeDB. The twelve tables from migration 07 remain
unconnected; this separate assistance table supports the requested Alerts feature.

An approved dine-in guest opens Call Staff, optionally writes up to 500 characters
and submits. A blank concern becomes “Staff assistance requested.” The request is
saved for that browser's approved table session and stays in staff Alerts until
staff click Resolve. The customer has a 60-second cooldown after each call.
Resolving early does not shorten that customer cooldown.
The latest request and cooldown survive page reloads. Retrying during the minute
returns the saved request rather than creating another. After the cooldown, a
reminder updates the same pending request's concern and last-request time, without
duplicating the staff card. A resolved request can be followed by a new request
once its customer cooldown ends. Concerns are escaped on display.

The customer API uses the existing guest cookie and CSRF token. Staff list/resolution
uses existing Admin/Staff authentication and CSRF protection. Ending a dine-in
session prevents further customer calls, but staff can still see and resolve its
outstanding requests. A new visit at the same table does not replace the previous
guest's pending alert. Previously expired/resolved rows remain in history.

Staff polls every five seconds without a countdown or browser-side alert expiry.
Customer polling uses the existing five-second session check and retains its
one-second countdown. The existing expires_at column is now used only for the
customer cooldown; it does not expire staff requests. The assistance_expire helper
is retained as a no-op for compatibility with existing APIs and the session worker.
Session inactivity and order handling retain their existing behavior.

No SQL migration is required. The existing one-pending-request-per-session index
is preserved. Table locks serialize reminders and staff resolution.

Checks: `C:\php85\php.exe tests/assistance.php` (SQL tests roll back),
`node tests/assistance.cjs` (popup, cooldown and safe concern display).
