# Stock notices before accepting orders

Orders > Approve payment / Collect payment now checks recorded stock when the
payment popup opens and again before a new payment confirmation. The popup and
existing confirmation show affected menu items, ingredient balance, units and the
amount needed for the whole order. Shared ingredients are totaled across lines.
Zero balances, insufficient quantities and manually unavailable menu
items are shown. Low reorder-level stock that can still cover the order does not
claim an order shortage. Items without linked recipes do not invent shortages.

Notices are advisory. Staff can cancel the confirmation to review stock or continue
accepting the order. A stock-check failure shows an unavailable message and permits
payment. Existing amounts, receipt approval, payment retries, preparation tickets,
customer ordering gates and stock deduction rules are unchanged. A preview does
not reserve or deduct stock; stock can change after the check. Payment retains the
existing non-blocking ordering policy and idempotent deductions. Recorded stock now
stops at zero; see `INVENTORY_ZERO_FLOOR.md`. Legacy deficits are shown as zero and
corrected with preserved movement history when inventory is opened.

The authenticated staff/admin Orders API exposes `GET ?view=stock-check&id=...`.
It holds the existing inventory transaction lock while reading the order and stock,
uses the same recipe requirement calculation as payment, and never writes stock.
Paid, cancelled and otherwise non-received orders return no acceptance warnings.
This inventory detail is not added to customer/public order responses.

The client ignores late responses after a popup is closed or another order is
selected, including closing/reopening the same order. Duplicate submission during
the check is ignored. An uncertain payment retry keeps its exact original payload
and skips a new preflight that could reinterpret an already-applied deduction.

No schema migration is required. Validation: 22 rollback-only SQL stock-notice
checks; 20 isolated behavior checks; 78 full cashier browser checks across phone,
tablet portrait/landscape and desktop, covering online and dine-in orders. Existing
41 SQL order checks, 86 SQL inventory checks and order/POS JavaScript checks pass.
