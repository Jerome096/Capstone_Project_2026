// The limit belongs to the menu item, including all sizes and customizations.
(() => {
  const max = 10;
  const message = 'You can order up to 10 of each item per order, including different sizes and options.';
  function remaining(itemId, excludingCartId = null) {
    return Math.max(0, max - state.cart.reduce((sum, row) =>
      String(row.itemId) === String(itemId) && row.cartId !== excludingCartId ? sum + row.quantity : sum, 0));
  }
  function allowed(itemId, quantity, excludingCartId = null) {
    return Number.isInteger(quantity) && quantity >= 1 && quantity <= remaining(itemId, excludingCartId);
  }
  // Older unsubmitted drafts keep their options and notes, up to the new limit.
  // An uncertain submitted order is recovered separately with its exact payload.
  function normalize(rows) {
    const used = new Map();
    return rows.flatMap(row => {
      const id = String(row.itemId), count = used.get(id) || 0;
      const quantity = Math.min(row.quantity, Math.max(0, max - count));
      used.set(id, count + quantity);
      return quantity ? [{ ...row, quantity }] : [];
    });
  }
  window.QuvoCartLimits = { max, message, remaining, allowed, normalize };
})();
