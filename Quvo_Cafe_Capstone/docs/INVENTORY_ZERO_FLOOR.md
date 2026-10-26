# Nonnegative current stock

Current stock stops at zero. Physical counts and manual waste/adjustment validation
continue rejecting values that would take stock negative. During a paid order,
deductions are capped at the available recorded quantity and shared ingredients
are allocated across all order lines under the existing inventory lock.

For example, an order requiring 5 eggs with only 2 recorded deducts 2, leaves 0,
and can still be accepted. A permanent `inventory_order_consumed` entry in
`system_audit_log` retains required, deducted and unmet quantities. Partial
deductions also explain the cap in their movement reason. A zero deduction makes
no invalid zero-valued movement row. The order marker prevents a later helper
retry after restocking from consuming previously skipped quantities. Preserve
these lifecycle entries with their order history. Payment retry checks remain
unchanged and do not deduct twice.

Legacy negative balances are bounded to zero in inventory, dashboard and
order-stock-notice reads. Opening the authenticated admin Inventory page repairs
active negative ledgers with positive **Adjustment** movements attributed to the
admin; old rows are not changed or removed. The reason states the original deficit
and correction to zero. Reopening Inventory does not repeat a correction. Stock
mutations repair active legacy deficits before applying new quantities; payment
only repairs affected ingredient IDs. Thus restocking 5 from a legacy -3 leaves 5,
not 2. No schema update or separate SQL script is required.

The repair and new deductions share the caller's database transaction and inventory
lock. Correction, consumption marker, payment and order changes roll back together
if the enclosing operation fails. Customer-facing availability stays controlled
by the cafe. Online, dine-in and walk-in ordering/payment continue at zero stock;
staff notices remain informational. Orders, totals, payments and saved movement
history are preserved. Individual movement deltas may remain negative because
deductions/waste are decreases; it is the current stock balance that is nonnegative.

Validation includes 29 rollback-only zero-floor SQL checks, 86 updated inventory
checks across all three ordering channels, and 22 stock-notice checks. Checks cover
real ledger sums, partial/shared deductions, zero rows, deficit correction history,
repeated page loads, restock retries, direct consumption retries after restocking,
manual count validation, and rollback/retry atomicity.
