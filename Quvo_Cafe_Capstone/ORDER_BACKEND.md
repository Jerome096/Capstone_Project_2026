# Dine-in ordering backend

Requires the existing PHP SQL connection and database/03_dine_in_orders.sql.
Customer dine-in checkout, tracking, cashier orders, payment confirmation and
receipt records now use these endpoints. Online ordering and manual POS retain
their existing prototype behavior.

## Screen workflow (Step 4)

Refresh both customer and staff pages after updating. A customer with an approved
table visit submits a cart and pays at the cashier. Orders appear in the staff
Received column. Collect payment records one full Cash, GCash or PayMaya payment,
calculates cash change and moves the order to Preparing. Staff mark the entire
order Ready, then Served. The customer tracking screen polls saved statuses and
allows selecting earlier orders in the same visit. Receipt records load saved
payments; Load older records retrieves additional history.

The customer keeps a pending submission key in sessionStorage before sending.
After a lost response, Retry order reuses that key to recover the original order.
Confirmed payments and submitted item snapshots cannot be edited. An admin can
cancel an unpaid received order with a reason. Split payments and refunds are
not implemented. Dashboard totals cover loaded receipt records, not a complete
SQL sales report.

## Customer API

Use the existing quvo_guest cookie. GET /customer/api/session.php?table=1
provides the CSRF token; send it in X-CSRF-Token on POST. The backend identifies
the visit from the cookie and table code, never from a submitted session ID.

POST /customer/api/orders.php?table=1 with Content-Type: application/json:

```json
{
  "action": "submit",
  "submission_key": "8e7a866f-3a8b-4c6d-b824-a17105d01972",
  "expected_total": "30.50",
  "items": [
    {
      "itemId": "123",
      "quantity": 2,
      "customization": {
        "sugarLevel": "50%",
        "iceLevel": "Less ice",
        "notes": "No lid"
      }
    }
  ]
}
```

The ID and price above only illustrate the request format; use actual available
menu items. No example menu records are added to the application.

Generate a fresh UUID per intended order, and retain the same key and payload
until the request succeeds or definitively fails. A network retry must reuse them.
New orders return HTTP 201; matching retries return 200 with replayed: true.
A reused key with different order contents returns 409.

PHP reads names, categories and prices from SQL. expected_total must be a decimal
string matching the calculated SQL total; stale prices produce 409 for review.
Neither the customer's amount nor their selected payment method records payment.
Sugar/ice options apply to drinks; sizes and add-ons have no configured catalog and
are rejected. Notes are limited to 1,000 UTF-16 units, quantities to 1–999, and
each request to 50 lines and 64 KiB.

GET /customer/api/orders.php?table=1 lists only that browser's visit.
GET /customer/api/orders.php?table=1&id=123 reads an owned order with its items.
The owning guest can retrieve history after closure while the cookie still maps
to that visit; closed visits cannot submit new orders. Starting a new visit changes
the current cookie-to-visit mapping.

## Staff API

Use the existing quvo_staff login cookie and X-CSRF-Token for POST.
GET /api/orders/index.php lists open orders.
GET /api/orders/index.php?id=123 returns an order with items.

Customer and staff lists accept status=open|all|received|preparing|ready|served|cancelled
and offset (default 0). Lists return at most 50 summaries and next_offset.
Fetch an order's detail endpoint when its item lines are needed. Money is returned
as decimal strings, and bigint record IDs as strings.

POST /api/orders/index.php accepts these actions:

```json
{"action":"pay","id":"123","payment_method":"Cash","amount_received":"50.00"}
```

Payment methods: Cash, GCash, PayMaya. Digital payments must equal the full total;
an optional payment_reference string can be supplied for digital payments.
The cashier confirms collection manually; this is not a payment-gateway integration.
Cash must cover the total, and PHP calculates change. One payment per order is
enforced in SQL. Repeating the same payment returns the saved result; conflicting
payment details return 409. Payment atomically moves received to preparing.

```json
{"action":"status","id":"123","status":"ready"}
{"action":"status","id":"123","status":"served"}
{"action":"cancel","id":"123","reason":"Customer requested cancellation"}
```

Ready requires preparing and payment; served requires ready and payment.
Repeating the same current status is safe. Cancellation requires an active Admin
account and an unpaid received order. Paid cancellation, split payments, refunds,
and editing/deleting submitted items or confirmed payments have no endpoints.

Order status and payment status are separate. payment_status is derived:
unpaid (no payment), paid (confirmed payment), or not_due (cancelled unpaid order).
Submitted item names, prices and customer names are historical snapshots.
Closing a visit now requires all orders to be paid and served, or cancelled.

All mutations run in transactions and lock the cafe table before the order, matching
session closure's locking order. Failed requests roll back. Error responses use
400 for malformed JSON, 401/403 for authentication or access, 404 for missing owned
records, 409 for conflicts, 413 for oversized requests, 422 for invalid values,
and 503 for unexpected service failures.

## Verification

From the staff application folder:

```powershell
& "C:\php85\php.exe" tests/orders.php
```

The integration checks need an existing active Admin account. They create temporary
table, session, menu, order and payment rows inside a transaction that always rolls
back. They create no accounts and retain no test rows, but identity numbers may
have gaps. They are intended for the local development database.

Verified on this PC: PHP syntax checks; 38 rollback integration checks; 10 HTTP
checks covering existing session access, anonymous staff/guest restrictions,
CSRF, malformed/oversized requests, method validation, protected menu access and
blocked web access to tests/private helpers.

Step 4 verification (2026-10-09): all 41 JavaScript files passed syntax checks;
the PHP order helper passed lint; all 38 rollback database checks passed again.
Run `node tests/order-screens.cjs` for the request-mocked screen logic checks:
queue loading, HTML escaping, partial-payment rejection, payment retry, receipt
change, ready/served progression, cart totals, and recovering a pending order
after reload. Those checks passed. A signed-in browser walkthrough with customer
and cashier pages remains the next manual verification step; physical mobile
network access has not been rechecked.
