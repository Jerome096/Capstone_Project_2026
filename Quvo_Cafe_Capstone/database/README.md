# QuvoCafeDB SQL export

## Customer ordering availability

Run `19_ordering_availability.sql` in desktop SQL Server Management Studio before
installing the ordering-control update. It adds a shared setting and operations
workspace leases while preserving existing records. A new installation starts
paused. Staff/admin use Start accepting orders or Pause orders in their workspace
to control both dine-in and online submissions. Customers can still browse.
Ordering also pauses at EOD or on the last operations logout. Closing tabs or
losing Wi-Fi does not pause it automatically. See `docs/ORDERING_AVAILABILITY.md`.

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

## Ten dine-in tables

Apply `17_dining_tables.sql` to add Tables 2–10 to the existing `cafe_tables`
configuration. Table 1 and customer sessions are preserved. The script inserts
only missing table codes, so repeating it does not create duplicates. All nine
new tables are active and use the same indoor area as Table 1. Their customer
links are `/customer/?table=2` through `/customer/?table=10`; each has its own
cashier approval and uses the existing session inactivity rules. See
`docs/DINE_IN_TABLES.md` for all ten links and phone/tablet URL instructions.

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

This stores the dashboard completion boundary. Sales history and SQL closing totals
are added by migration 14 below. Walk-in POS receipts are stored in SQL after
migration 12. Only legacy browser receipts use the old in-memory closure behavior.

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
Previous browser-only POS orders are not imported. Inventory deductions use SQL
after migration 16 and recipe setup. Kitchen SQL readiness is added by migration 13 below.

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
cashier workflow. The kitchen cannot collect payments, cancel or serve
orders. Repeated Ready submissions are idempotent. All API actions require a
server-checked staff session, and writes require CSRF. Verify with
`C:\php85\php.exe tests/kitchen.php`; all test fixtures roll back.

## Sales history and End of day

Apply `14_sales_history.sql` once. It adds retry keys to eod_closures and links each
payment or unpaid cancellation to one EOD using eod_sales_orders. Previous EOD
records are reconstructed only from verifiable completed-order/payment links;
old browser-only totals cannot be recovered. Existing receipts/orders are retained.

The cashier EOD popup reads its preview from SQL. After migration 15, confirmation
recalculates and saves today's approved payments and voids not included in an
earlier EOD, across all order sources and payment methods. Sales
use amount_applied, excluding change. Paid active orders are counted as sales but
continue preparing/serving normally. A later EOD does not count their money again.
The existing completion counter is reset in the same transaction. Multiple EODs
on one date are supported. Same-key retries restore the saved record without
closing new payments. No drawer counts or opening float are fabricated; the
proposed business_days/eod_reports tables remain reserved for that later workflow.

Sales history is restricted to confirmed Admin sessions. Its top cards show
approved payment totals by Philippine payment date, including not-yet-closed
payments. The daily/monthly/yearly table aggregates saved EOD snapshots by the
Philippine operation date. It includes an Other digital column for custom methods
and pagination for older periods. EOD writes require staff/admin and CSRF.

Tests: `C:\php85\php.exe tests/sales-history.php`,
`C:\php85\php.exe tests/dashboard-eod.php`, `node tests/sales-history.cjs`,
`node tests/eod-retry.cjs`, and `node tests/dashboard-eod.cjs`.
SQL tests roll back fixtures and closures, preserving the real operating day.

Apply `15_eod_business_date.sql` after migration 14. It stores the operation date
explicitly on each closure, backfilling existing dates without altering amounts.
The popup displays this date. Payments use their Philippine approval date; voids
use their Philippine cancellation date. Older unclosed transactions remain in
SQL and are excluded from today's closing. The active-order metric covers all
dates and is labelled accordingly. EOD resets today's completions only. An
uncommitted confirmation from a previous date must be reviewed again; a committed
retry still restores its original record. Date-boundary tests cover midnight and
the exclusion of previous/next-day transactions.

## Admin Reports

Reports reads existing SQL orders, payments and immutable item snapshots through
`api/reports/index.php`; no additional migration or sample data is needed. Access
requires a confirmed Admin session. The endpoint is read-only and uses one
serializable transaction so its sections agree during concurrent order activity.

Choose Daily, Monthly or Yearly and select a Philippine calendar date, month or
year. Today, This month or This year returns the selected view to its current
period. Revenue and paid orders use the
payment approval date and amount_applied, excluding change. Orders placed use
creation date, completed orders use serving date, and voids use cancellation
date. Average order value uses the paid-order count. Unpaid counts describe the
current status of orders created in the selected period. All order sources are
included. Reports retains the selected period's values after EOD.

The Overall / All dates option has been removed. Daily activity groups approved
payments by Philippine hour, Monthly by day of the selected month, and Yearly by
month of the selected year. Only buckets with paid orders appear on screen;
an empty-state message appears when there are none. Activity reconciles with
paid-order revenue/counts. Top five items rank quantities sold in paid orders, using saved
item names rather than current menu labels. Payment breakdown includes custom
methods in Other digital; unpaid cancellations appear under No payment.

The API accepts `period=daily&date=YYYY-MM-DD`, `period=monthly&date=YYYY-MM`, or
`period=yearly&date=YYYY`. Omitting period preserves the daily default. Every
range includes its first Philippine midnight and excludes the next period's
first midnight, including leap February and December/January transitions.

Verify with `C:\php85\php.exe tests/reports.php` (all fixtures and EOD markers
roll back), `C:\php85\php.exe tests/report-periods.php` (calendar validation
without database access), and `node tests/reports.cjs`.

## Inventory and Bill of Materials

Apply `16_inventory_connection.sql` once after the previous migrations. The
inventory tables created by migration 07 now power the admin Inventory screen.
Migration 16 adds stock categories, row versions, unique active stock names and
staff-scoped retry records. It does not create sample ingredients, recipes or
movements, or deduct stock for historical paid orders.

`api/inventory/index.php` requires confirmed Admin access. Writes require CSRF.
Add real stock items with their unit, opening quantity and reorder level, then
link each menu item to its ingredients through Add/Edit Bill of Materials.
Recipe lines describe **one serving** in the stock item's own unit. There is no
automatic unit conversion. A stock item's unit cannot change after creation;
recipe revisions preserve previous versions and movement references.

Stock balances are the sum of SQL movements, using integer thousandths and
decimal strings with up to three decimal places. Restock adds an explicit
quantity, waste removes one, and adjustments support signed changes. Reasons
are required for movements and stock-count reductions. Editing a physical count
checks the version captured when the form opened, so another cashier's deduction
or admin's restock cannot be overwritten by a stale form. The movement log records
staff, time, reason and originating order, with older records available by pagination.

Cashier payment approval consumes the active recipe for each order line across
dine-in, online and walk-in/POS orders. Consumption, payment and the Preparing
status commit together. Submission checks available stock but does not reserve
or deduct it. Approval rechecks the combined ingredient quantities across all
lines, rejecting shortages without a payment or partial deduction. Accepted
payment/submission retries never deduct again, including after recipe changes.
The stock lock is acquired before order/table/account locks to serialize stock
updates and approvals. Browser inventory deductions are disabled.

Insufficient stock for one serving automatically hides a linked menu item from
customer menus and makes it unavailable in the POS. Restocking restores effective
availability while preserving the admin's manual menu availability setting.
Low-stock and out-of-stock totals are separate from the count of affected menus.
Menus without a configured recipe continue to work without stock deductions.
Recipes currently use fixed quantities per menu item; sugar, size and other drink
choices do not alter ingredient quantities. Inventory refreshes every ten seconds
while its screen is open and can also be refreshed manually.

Interrupted inventory writes retain their exact payload and retry key in the
admin's tab. Retry saved change confirms the original transaction after reload;
it cannot create another movement. Input errors unlock the form for correction,
and version conflicts require reviewing the current values in a fresh form.
Save stock marks missing or invalid fields with a visible message and focuses
the field to correct. Stock item name, current quantity and one unit are required;
a blank reorder level defaults to zero. An interrupted stock save can also be
retried using the Save button inside the popup, with the original payload and key.

Verify with `C:\php85\php.exe tests/inventory.php` and `node tests/inventory.cjs`.
SQL fixtures always roll back. Existing POS, dine-in and online SQL checks also
cover their unchanged order workflows.

For the expanded cafe menu categories, run `22_menu_categories.sql` after the
existing schema/ordering scripts and before deploying the matching runtime files.
It adds twelve menu categories, maps current Coffee to Cold Coffee and current
Food/Pastry to Appetizer, and retains historical order categories. It can be run
again safely. See `../docs/MENU_CATEGORIES.md` for labels and preparation routing.

Run `23_customer_booked_delivery.sql` before deploying customer-booked Lalamove
checkout. It adds café pickup/contact snapshots and a protected booking image
table while preserving historical delivery destinations and order data. The
script can be run again safely. Set the café Address, Phone and Facebook Social
link through Website content. See `../docs/CUSTOMER_BOOKED_DELIVERY.md`.

Run `24_guest_wifi.sql` before using Admin > Guest Wi-Fi. It creates a separate
private settings row with blank initial credentials. The café enters its real
network name/password in that admin module. Paid active dine-in visits can then
open the Wi-Fi note in tracking. Existing orders, accounts and settings are
preserved, and repeating the migration retains saved Wi-Fi details. See
`../docs/GUEST_WIFI.md`.

Run `25_registration_email_otp.sql` before deploying online registration email
verification. The migration adds pending-code/rate-limit tables and a nullable
email-verification timestamp; existing accounts remain usable. Configure Gmail
SMTP privately using `config/mail.example.php` as a template. See
`../docs/REGISTRATION_EMAIL_OTP.md` for installation and verification steps.
