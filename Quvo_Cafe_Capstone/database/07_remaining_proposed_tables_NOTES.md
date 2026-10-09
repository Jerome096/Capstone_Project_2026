# Remaining proposed tables — schema only

Status: applied to the local `localhost\SQLEXPRESS` / `QuvoCafeDB`. All 12 new
tables were verified empty, with 12 primary keys and 21 enabled, trusted foreign
keys. Existing table definitions were preserved. Website integration is deferred.
Do not rerun migration 07 against this database; the existing-table guard will refuse it.

`07_remaining_proposed_tables.sql` creates the 12 remaining tables from the proposed
overall diagram. It does not activate their website features. Apply it once after
the current migrations in SSMS against `QuvoCafeDB`. It refuses to overwrite an
existing proposed table and rolls back the whole migration if creation fails.

| Area | New tables |
|---|---|
| Customers | `customer_accounts`, `customer_addresses` |
| Ordering | `order_fulfillments`, `order_status_history` |
| Inventory | `inventory_units`, `inventory_items`, `menu_recipes`, `recipe_ingredients`, `inventory_movements` |
| Business days and reports | `business_days`, `eod_reports` |
| Audit | `system_audit_log` |

The current database has the original eight application tables plus `eod_closures`
and `eod_completed_orders`. These 12 additions bring it to **22 application tables**.
The two existing EOD tables continue serving the current dashboard; the new business
day and EOD report tables stay empty until a later integration.

The script includes primary keys, foreign keys, defaults, checks and indexes. It
enforces one active default address per customer, one active recipe per menu item,
one open business day, one fulfillment per order, and one EOD report per business
day. Consumption rows must reference the same inventory item as their recipe
ingredient, and cannot duplicate an order-line/ingredient pair. `cash_variance`
is computed from counted cash minus expected cash. Email uniqueness is case insensitive.

No sample records, passwords, triggers, procedures, PHP changes or website bindings
are included. Existing data and table definitions are preserved.

## Deferred integration work

- The proposal's `orders` extension is deferred: source, online customer, creating
  staff, business-day links, nullable session and source-specific retry indexes.
  Existing orders remain compatible with the current dine-in system.
- New history/audit rows and fulfillment records will require explicit application
  writes later. Nothing populates them automatically.
- Inventory balance is the sum of movements. The future service must enforce stock
  availability under locks, immutable movement/recipe history and the correct menu
  recipe for each consumed order item. No stock is deducted by this script.
- Future fulfillment code must check saved-address ownership and preserve snapshots.
- EOD integration must reconcile the existing completion closures with business days,
  calculate totals from actual payments and decide overnight/carryover handling.
- Password hashing and validation belong to the future account service. Do not insert
  plain-text passwords into `password_hash`.

The earlier diagram remains a proposal; its planned `orders` changes are not applied
by this schema-only migration. Split payments and refunds remain out of scope.
