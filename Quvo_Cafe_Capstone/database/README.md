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
existing frontend EOD summary. Walk-in POS receipts are stored in SQL after migration 12;
Only legacy browser receipts use the old in-memory closure behavior.

Verify with `C:\php85\php.exe tests/dashboard-eod.php` (all test changes roll back)
and `node tests/dashboard-eod.cjs`.

## GitHub hosting

## Customer staff assistance

Apply `08_staff_assistance.sql` after the previous migrations to add the assistance
request table. Approved dine-in customers can send an optional concern. Calls stay
active for 60 seconds; resolving early does not shorten the customer cooldown.
Requests and expiry are enforced through SQL/PHP. See `../ASSISTANCE_BACKEND.md`.

These files let you download and recreate the database. Uploading SQL files does not host or run SQL Server, and this export does not change the application or demo configuration.

## Online payments and images

Apply `09_online_ordering.sql`, then `10_online_payment_images.sql`. Migration 10 adds
`payment_qr_codes` (one administrator-configured image per supported method) and
`online_payment_receipts` (one immutable payment proof per submitted order). It seeds
no QR images or receipts. The local database receives these tables without deleting
existing orders. The admin QR page requires confirmed admin access and CSRF protection.

PNG/JPG images up to 2 MB are stored in SQL rather than executable upload folders.
Receipt endpoints require the owning customer or authorized cashier/admin staff.
New online orders require a configured method, the current QR version, and a receipt;
the receipt never marks an order paid automatically. Identical accepted submissions
can still be recovered after a QR is replaced. The admin receipt gallery is deferred.

Run `C:\php85\php.exe tests/online-ordering.php` and `node tests/online-screens.cjs`.
SQL tests roll back all fixtures, including temporary QR images and receipts.

## Administrator-managed payment methods

Apply `11_manage_online_payment_methods.sql` after migration 10. It registers the
existing GCash/PayMaya methods and preserves their QR images. Additional methods use
stable internal codes and human-readable names. Removing a QR disables that method;
removing a method deactivates it and removes its QR from new checkouts without
deleting orders, payments, or customer receipt images. Re-adding a removed name
restores the same identity. New online submissions require an active method and QR;
accepted retries and cashier settlement of historical orders remain supported.

The admin controls require confirmed admin access and CSRF. Checkout lists are
loaded from SQL; the cashier sees each order's selected method, including removed
methods needed for settling existing orders. Cash and dine-in/POS workflows keep
their existing payment choices. `tests/online-ordering.php` covers removal, QR
replacement, dynamic-method settlement, and preservation of history transactionally.

## Receipt operation dates

The staff Receipts screen defaults to the current Philippine calendar date. Its
date picker queries paid/served and voided records for that date directly, with
pagination confined to the chosen day. Paid receipts use the payment date; voided
receipts use the cancellation date. UTC SQL timestamps are converted to Asia/Manila
for these day boundaries. Date selection does not delete records or change EOD.
Tests: `node tests/receipt-dates.cjs` and `C:\php85\php.exe tests/online-ordering.php`.

## Walk-in POS

Apply `12_pos_walkin.sql` once after migration 11. It adds the originating cashier
to walk-in orders and a unique cashier/submission key without changing existing
dine-in or online records. No customer account or dining session is required.

`api/pos/index.php` requires a signed-in cashier/admin and CSRF token. SQL validates
the current catalog price and availability, then saves the order, item snapshots
and full payment in one transaction. Cash stores received amount and change;
GCash/PayMaya store the exact total and optional reference. A successful checkout
enters Preparing, offers the existing food/drink print tickets, and appears in
SQL order management, dated receipts and completed-order EOD counts.

Interrupted requests retain the same payload and submission key in the cashier's
tab for safe retry after refresh. Accepted retries never create another payment.
Previous browser-only POS orders are not imported. Inventory remains the existing
prototype behavior. Kitchen SQL readiness is added by migration 13 below.

Verify with `C:\php85\php.exe tests/pos-sql.php` (all fixture rows roll back) and
`node tests/pos-orders.cjs`.

## Kitchen food readiness

Apply `13_kitchen_tickets.sql` once. It adds kitchen_ticket_readiness with one
readiness record per order, linked to the originating staff member. It does not
replace existing orders, payments or item snapshots. Open `/kitchen/` on the PHP
server and use an existing Staff/Admin account (Kitchen role also accepted).

Only paid Preparing/Ready food tickets are listed, across all order sources.
Food-only Ready actions update the existing order to Ready; mixed tickets save
food readiness separately and leave the full order Preparing for the existing
cashier/barista workflow. The kitchen cannot collect payments, cancel or serve
orders. Repeated Ready submissions are idempotent. All API actions require a
server-checked staff session, and writes require CSRF. Verify with
`C:\php85\php.exe tests/kitchen.php`; all test fixtures roll back.
