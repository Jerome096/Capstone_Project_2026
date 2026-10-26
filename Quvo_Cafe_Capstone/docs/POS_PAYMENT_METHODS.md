# Configured payment methods in walk-in POS

Walk-in checkout reads active method names from the existing Payment QR codes
configuration through authenticated staff/admin `GET api/pos/index.php?view=payment-methods`.
Cash is always available. Configured methods appear even without an uploaded QR;
POS shows their names and generic icons and never downloads or displays QR images.
Online checkout retains its existing QR-image requirements.

The list refreshes whenever POS checkout opens and offers a retry action if loading
fails. Cash remains available during a configuration-list outage. New selections
use the configured internal method code; review displays its human name separately.
Additional methods act as digital payments, requiring the exact total, allowing an
optional reference up to 100 characters, and producing zero cash change. Cash
collection and change retain their existing behavior.

For new orders, POS validates that a noncash method is active after idempotency
lookup and before creating the order. Payment approval permits that saved walk-in
preferred method, matching the existing online-order rule. A configuration change
after selection can reject an unaccepted new payment without losing the cart.
An exact retry for an already accepted order still succeeds after method removal.

Order/receipt APIs already resolve stored codes to display names, including
inactive historical methods. Review, receipt preview, thermal receipt, Orders and
Records show the name; method names are escaped and long names wrap on small screens.
Records includes named counts for additional methods. Reports adds Payment method
details with counts and revenue for every used method, including removed methods.
Existing report breakdowns, sales-history records and EOD include these amounts in
Other digital without double-counting totals. No schema migration is required;
the existing configurable-methods setup used by Payment QR codes is reused.

Validation: 26 rollback-only SQL checks cover no-QR methods, exact payments,
references, labels, inactive-method retries, rejection of new removed/forged
methods, named report details, sales history and saved EOD totals. 22 client
behavior checks cover loading, safe labels, cash/digital review, removal, failed
loads, recovery and stale responses. 64 full-browser checks cover phone/tablet/
desktop checkout, receipts/printing, order mapping, Records, Reports, absent QR
requests and maximum-length names. Existing payment/order, POS, report, online
ordering and zero-floor regressions pass. All SQL fixtures are rolled back.
