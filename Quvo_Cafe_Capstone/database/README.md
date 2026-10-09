# QuvoCafeDB SQL export

This folder contains the application database schema and a public-safe data snapshot exported on October 8, 2026 (Asia/Manila).

## Included

- All five application tables: roles, staff_users, menu_items, cafe_tables, and customer_sessions.
- Primary keys, foreign keys, unique constraints, defaults, checks, and indexes.
- Data: 2 roles, Table 1, and 2 menu items, preserving their existing IDs.

Staff account rows, password hashes, customer session rows, and guest token hashes are excluded from the data export. Their table definitions are included. SSMS diagram metadata is excluded.

This is a development snapshot, not a full database backup. A fresh import will have no login accounts; an admin account must be created separately with a PHP password_hash-generated password hash before login can work.

## Import with SSMS

Use SQL Server 2022 or newer. Connect to the intended instance and run these files in order:

1. 00_create_database.sql — creates QuvoCafeDB only if absent.
2. 01_schema.sql — creates the application tables and constraints.
3. 02_public_data.sql — inserts the exported roles, table, and menu records.

The schema script requires that the application tables do not already exist. The data script requires empty roles, cafe_tables, and menu_items tables. Both refuse to overwrite existing application data. Do not rerun them against the working database on your current PC.

For another database name, change QuvoCafeDB consistently in all three scripts before running them.

The export-manifest.json file records which tables and row counts were exported.

## Dine-in ordering migration

After the base schema and public data have been imported, run
`03_dine_in_orders.sql` once to add `orders`, `order_items`, and `payments`.
It preserves the existing tables and stops if any of these new objects already
exist. Do not rerun scripts 00-02 against an existing working database.

The PHP order backend and session closure checks require this migration.
See `../ORDER_BACKEND.md` for the API contract and local rollback checks.
The export manifest describes the original five-table snapshot, not this migration.

## Dine-in inactivity timeout

After migration 03, run `04_session_inactivity.sql`. It adds activity and expiry
timestamps without deleting visit or order history. Existing active visits receive
a fresh ten minutes on the first migration run; rerunning does not reset their clock.

After migration 04, run `05_session_order_cancellation.sql`. It preserves all orders
and distinguishes staff cancellations from session cancellations, including automatic
cancellations with no staff actor.

Approved visits close after ten minutes without customer interaction. API polling
does not count as activity. Only paid outstanding orders suspend expiry. Unpaid
orders do not stop the clock. Once all paid orders are served, the most recent paid
completion time starts a fresh ten minutes. Cancelling an unpaid order does not
reset the clock. Pending approval requests are
outside this timeout. Expired visits use `closed` plus `idle_expired_at`, freeing
the table while retaining history. Its unpaid orders are cancelled in the same
transaction, with an automatic cancellation reason. Staff closure also cancels unpaid
orders, but is blocked while paid orders remain unserved. A new visit needs staff approval.

APIs enforce expiry before accepting activity or new orders. To close visits even
when all browsers are closed, run `scripts/install-session-expiry-task.ps1` once
in PowerShell on the host PC after applying migration 04. The task runs
`C:\php85\php.exe scripts/expire-dining-sessions.php` every minute while the
installing Windows user is logged in; the PC and SQL Server must remain running.
Its visible database closure can occur up to a minute after the ten-minute deadline,
but APIs reject expired sessions immediately. A deployed server should schedule
the same CLI worker every minute using its scheduler and database identity.

Verify with `C:\php85\php.exe tests/session-inactivity.php` and
`node tests/session-inactivity.cjs`; database tests roll back all test records.

## Dashboard completion reset at EOD

After migration 05, run `06_eod_completed_orders.sql`. Completed Today counts all
paid, served SQL orders completed on the current Philippine calendar date, excluding
orders already included in an EOD closure. EOD saves the closure and the included
order IDs in SQL, preserving orders, payments and receipts. A completed order can
belong to only one closure. The counter stays reset through refreshes, receipt
pagination and staff logins; newly served orders start counting again.

This stores the dashboard completion boundary. Other report totals still use the
existing frontend EOD summary. Counter/manual POS receipts remain prototype data;
completed manual receipts are marked closed in memory when EOD succeeds.

Verify with `C:\php85\php.exe tests/dashboard-eod.php` (all test changes roll back)
and `node tests/dashboard-eod.cjs`.

## GitHub hosting

## Customer staff assistance

Apply `08_staff_assistance.sql` after the previous migrations to add the assistance
request table. Approved dine-in customers can send an optional concern. Calls stay
active for 60 seconds; resolving early does not shorten the customer cooldown.
Requests and expiry are enforced through SQL/PHP. See `../ASSISTANCE_BACKEND.md`.

These files let you download and recreate the database. Uploading SQL files does not host or run SQL Server, and this export does not change the application or demo configuration.
