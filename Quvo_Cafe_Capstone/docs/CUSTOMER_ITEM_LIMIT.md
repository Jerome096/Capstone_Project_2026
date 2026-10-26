Online and dine-in ordering allow at most 10 units of each menu item per submitted order. Quantities are summed by menu item ID across sizes, add-ons, special instructions and separate cart lines. Different menu items each have their own allowance. This is a per-order limit, not a lifetime or per-day limit.

The item modal explains the limit and disables its plus button when its remaining allowance is reached. Add/save and cart steppers enforce the same total; reducing/removing one variant releases allowance for the others. `shared/cart-limits.js` is identical in both customer applications and loads before cart storage and controls.

Older unsubmitted drafts are normalized on restoration, keeping the first quantities up to 10 in their original order and retaining options/notes for remaining lines. Other menu items are preserved. The adjusted draft is saved, and the customer receives a notice to review it. Exact pending submissions bypass draft normalization so an interrupted request can recover its original accepted result.

The server calls `orders_require_customer_quantities` in `orders_submit` and `online_submit` after the idempotency lookup and before new order insertion. New oversized requests return HTTP 422 with `item_quantity_limit`. Previously accepted submissions can still replay, including orders accepted before this limit. Staff walk-in POS, stored orders, payments and inventory are unchanged.

Validation: `tests/customer-item-limit.php` has 15 rollback-only SQL checks for the two customer submission services, repeated IDs, ten-unit boundaries, no insertion on rejection, retries and independent POS behavior. Customer cart customization and storage tests cover aggregate limits and restoration. Full browser checks cover both ordering apps at 390, 768, 1024 and 1440 pixels, real button events, size variants, edits, refresh recovery, older drafts, and successful checkout. Existing 41 order/payment and 85 online-ordering checks pass.

No database migration is required. Deploy customer and server files together, then reload the customer pages to pick up `customer-item-limit-1` assets.
