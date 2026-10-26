# Dine-in cart recovery

Unsubmitted dine-in carts save to localStorage whenever the guest adds, edits or
removes a line, or changes its quantity. Sizes, options, paid add-ons and notes
are retained. Keys include both the table code and the server-approved visit ID.
The cart is restored only after the server verifies that same visit is active.
A different table or a new customer visit at the same table has a separate cart.

A temporary session/menu verification failure hides protected content without
erasing its saved draft. Once the same active visit is verified again, recovery
runs even when its visit ID has not changed. Normal polling does not overwrite
current edits. Explicit server confirmation that a visit is closed, cancelled or
rejected clears that visit's cache. The existing session inactivity policy and
cashier approval requirement remain unchanged.

Unconfirmed submissions save their original payload, cart and idempotency key to
a separate durable table-and-visit key before being sent. Browser restarts can
restore the same pending retry without relying on sessionStorage. Legacy
sessionStorage pending records migrate when their visit matches. Storage failure
prevents sending a new submission whose key could not be saved for recovery.

When SQL accepts an order, its visit's ordinary draft is cleared before pending
recovery is removed. A crash between those operations can only replay the original
accepted request. A response from an old visit cannot clear the new visit's cart.
Intentionally removing all lines keeps the cart empty after refresh. Current
prices and menu availability remain validated by the server at submission.

Saved carts are local to the browser/device and require the same valid guest
cookie and approved visit. Clearing website data removes its browser cache. This
does not extend table-session lifetimes or introduce cross-device cart syncing.
No SQL migration is required.

Verification: tests/dine-cart-storage.cjs, tests/order-screens.cjs,
tests/cart-customization.cjs and tests/session-inactivity.cjs. Browser checks use
actual reloads and a complete browser close/restart, and cover outages, visit/table
isolation, closed visits, cashier approval, exact retries, accepted-cart cleanup
and phone/tablet layouts with mock data only.
