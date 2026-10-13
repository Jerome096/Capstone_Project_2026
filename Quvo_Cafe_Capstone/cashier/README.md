# Cashier workspace

Open `cashier/index.php` through the PHP server and sign in with a staff account. Individual module `.html` files are protected routes; their actual markup is stored in the matching `.fragment.html` file.

Walk-in POS checkout uses the SQL catalog and saves the order and payment together
through `api/pos/index.php` after database migration 12. It shares SQL order management,
Mark ready/served actions, dated receipts and the food/drink preparation print prompt.
If checkout is interrupted, use the pending-order Retry button before starting
another order. Refreshing the same tab preserves the retry key for that cashier.
