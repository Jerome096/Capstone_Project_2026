# Customer ordering availability

Staff and admins control both dine-in and online customer ordering from the
Customer orders card below the header in Cashier and Admin. Choose
**Start accepting orders** when operations are ready. Choose **Pause orders** to
stop new customer submissions immediately. Everyone sees the same SQL status.
Signing in alone does not start ordering. A new installation starts paused.
Both buttons first show a confirmation dialog explaining their effect. Cancel,
Escape or clicking outside the dialog leaves the setting unchanged. A pause
confirmation explicitly explains that existing orders stay saved.

Customers can continue browsing menus, choosing options and editing carts while
ordering is paused. Trying to submit shows an Ordering is paused message. An
unapproved dine-in visitor can use Browse menu; cashier approval is still needed
before placing any order. Existing orders remain available for tracking, payment,
preparation and serving. Staff POS remains available. Online payment QR codes are
hidden while ordering is paused so visitors are not prompted to pay for a new
order that cannot be submitted.

## Operations going offline

The automatic 90-second pause is disabled. Closing a workspace tab or losing
Wi-Fi does not change the shared ordering setting. Staff should use Pause orders
when they want to stop new customer submissions. Presence is refreshed every
25 seconds for connected-workspace information; expired presence records do not
close ordering. A customer's open browser cannot renew these presence records.

Logging out removes that browser's workspace leases immediately. Other connected
staff/admin browsers can keep ordering open; logging out the last one pauses it.
Disabled accounts, changed credentials and expired leases do not count as online.
Reconnecting preserves the existing setting. Heartbeats cannot undo a manual
pause or a logout pause. End of day pauses customer ordering while preserving
active orders.

## SQL and deployment

Run `database/19_ordering_availability.sql` in desktop SQL Server Management Studio
against the intended database before uploading the application update. The web
SQL Studio portal may reject transaction/control statements in migration scripts.
The migration adds `ordering_settings` and `ordering_workspaces`; it preserves
existing cafe records and can be repeated without resetting an existing setting.
It does not include a database password or require a database restore.

Start accepting orders remains available after a status error. Clicking it
reconnects and starts ordering once setup is ready and the action is confirmed.
If another staff member
already opened ordering during the outage, the same click keeps it open.
Staff see a specific message if the SQL setup or backend files are incomplete.
Extract updates with existing-file replacement enabled and refresh the page;
the SQL update must complete before ordering can start.

`api/ordering/index.php` requires an active staff/admin session and CSRF validation
for every mutation. A revision prevents a stale control from undoing another
staff member's change. Leases use hashed session identities and credential stamps,
never a stored browser cookie or a plaintext password.

Both customer submission functions enforce availability within their order
transaction. A shared application lock is held until commit, so a pause waits for
earlier submissions and blocks later new orders. Previously accepted submissions
are replayed by their original key even while paused. Definitive closed responses
unlock the cart and retain its contents; uncertain network responses keep the
original retry key.

Public availability lives at `customer/api/session.php?view=ordering` and
`online/api/index.php?view=ordering`. Customer pages refresh it every 15 seconds
and recheck before sending a new order. The server remains authoritative if a
pause happens between the availability check and the submission.

## Verification

Run `C:\php85\php.exe tests/ordering-availability.php` for SQL behavior, access,
pause/start, disconnected-workspace behavior, logout, safe retry, POS and EOD checks. Temporary
staff, customer, order, payment and availability records all roll back. Existing
SQL ordering tests explicitly open a rollback-only test workspace using
`tests/ordering-fixture.php`. No test automatically opens the working cafe.

An isolated browser preview covers the three staff portals and both customer
apps at 390x800, 853x600 and 1440x1000, including closed messages, browsing without
approval, close-during-submit, cart preservation and accepted-request recovery.
