# Online cart recovery

Online ordering saves a draft to localStorage whenever a signed-in customer adds,
edits or removes an item, or changes its quantity. It includes line IDs, item IDs,
names, quantities, displayed prices, customization choices, add-ons and notes.
An explicit catalog reconciliation also saves its reviewed cart. Rendering,
startup and public browsing do not overwrite a saved draft with an empty cart.

Draft keys are scoped to the customer account. After a refresh or browser restart,
the draft is restored only after that account is authenticated. Signing out hides
the cart; signing back into the same account restores it on the same browser and
device. Another account has its own cart. Deliberately removing all items clears
the draft. Browser storage must be enabled and retained; clearing site data also
clears saved carts. This does not add cross-device cart synchronization.

Normal cart drafts contain no credentials, delivery address or uploaded payment
photo. The customer must reattach an unsubmitted receipt after reloading checkout.
Current menu prices, availability and options remain validated by the server when
the order is submitted; the stored draft is not authority to accept an old price.

Before sending an order, the exact unconfirmed payload and receipt are saved to a
separate account-scoped localStorage key for safe recovery. A restart with a
pending submission restores that snapshot ahead of the editable draft and keeps
the original idempotency key, payment image and fulfillment details. Retrying does
not generate a new order key. Existing sessionStorage pending records migrate to
the durable key where possible. If storing a new recovery payload fails, checkout
does not send an unrecoverable order. The customer receives an actionable error.

Once an order is accepted, its account's draft is cleared before pending recovery
is removed. A crash between those steps can only replay the original accepted
submission. Completed orders do not become fresh cart orders after refresh. A late
response for a previous account does not clear another account's stored draft.

No SQL migration is required. Verify with tests/online-cart-storage.cjs,
tests/online-screens.cjs, tests/cart-customization.cjs --online and
tests/menu-pricing.cjs. Local browser checks cover actual page reloads, a complete
browser close/restart, account isolation, edited options/notes, quantity changes,
removal, interrupted checkout and identical recovery without duplicate orders.
