# Size prices and customer option charges

In Admin → Menu edit, choose an item and open **Pricing**. For an item without sizes, enter **Item price (₱)**. Enable **This item has size prices** to add size names and full prices. When a size is required, the separate item-price field is hidden and each size is the complete selling price. The section supports adding/removing sizes, a default size, and Dropdown or Radio buttons. Existing size prices appear here automatically. Toggling off and back on before saving retains the size draft and single-price draft.

If **Customer must choose a size** is unchecked, an explicit **Price without a size (₱)** field appears for customers who skip size selection. This keeps optional-size behavior available without an unexplained base-price field. For required sizes, the saved catalog starting price is derived from the cheapest size; the admin does not have to enter a second price. Turning sizes off exposes an editable single Item price.

Under **Customer options and add-ons**, add an option group and choose Dropdown, Radio buttons, or **Checkboxes (multiple choices)**. Select a pricing rule:

- **Same price for all choices** keeps the item's price unchanged.
- **Add an extra charge** adds a per-item charge for milk, add-ons or any other customer option. Enter 0 for a free choice.

The existing required/optional and default-choice controls still apply. If an optional size is not selected, the explicit price without a size applies. Unchecked add-ons cost nothing; a required checkbox group requires at least one selection. Every checked add-on is charged once per item, and customers can select multiple add-ons from one group. A default choice can preselect one checkbox. Save changes to publish prices.

For example, Small = ₱150, Large = ₱180, Oat milk = +₱20 and Extra shot = +₱25. Large with oat milk and a shot costs ₱225 each, or ₱450 for two. The size is a full item price, not a second charge on top of the base price.

Dine-in, online checkout and cashier POS use the same centavo calculation. Customer choices show their prices and update the modal and cart total. Price-varying menu cards show the lowest available starting price. Editing a priced cart item recalculates its price from the current catalog; a changed online payment total requires matching payment proof.

The server resolves IDs against the locked menu catalog, verifies the total, and saves each order line's final unit price and charge snapshot. Client-supplied prices cannot set the total. Catalog changes invalidate old choices, and concurrent or old admin tabs cannot erase priced choices without reloading. Existing saved orders and duplicate-safe retries retain the original prices.

Prices are stored in the existing `menu_items.option_groups_json` column and order customization snapshots. No additional SQL migration is required beyond the existing menu-photo/customer-options setup. Existing unpriced choices remain free and retain their previous shape. Save prices only from the updated admin page after deployment.

Verification: `tests/menu-pricing.cjs` checks shared price calculations; `tests/menu-pricing.php` and `tests/checkbox-addons.php` check catalog validation and all three SQL order channels using temporary transactions that always roll back.
