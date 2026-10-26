// Drafts belong to one server-approved table visit, never to a table alone.
(() => {
  "use strict";
  const prefix = "quvo_dine_cart_v1_";
  let notified = false;
  const key = (sessionId, tableCode) => prefix + encodeURIComponent(tableCode) + "_" + sessionId;
  function warn() {
    if (!notified) { notified = true; Promise.resolve().then(() => showToast("Your browser could not save the cart. Enable browser storage and try again.")); }
  }
  function lines(value) {
    if (!Array.isArray(value) || value.length > 50) throw new Error("Invalid saved cart");
    return value.map(row => {
      if (!row || typeof row !== "object" || typeof row.cartId !== "string" || row.cartId.length > 160 ||
          !["string", "number"].includes(typeof row.itemId) || !String(row.itemId) || String(row.itemId).length > 80 ||
          typeof row.name !== "string" || typeof row.category !== "string" ||
          !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 999 ||
          typeof row.unitPrice !== "number" || !Number.isFinite(row.unitPrice) || row.unitPrice < 0 ||
          !row.customization || typeof row.customization !== "object" || Array.isArray(row.customization)) throw new Error("Invalid saved cart item");
      return { cartId: row.cartId, itemId: String(row.itemId), name: row.name, category: row.category,
        icon: typeof row.icon === "string" ? row.icon : "", imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : null,
        quantity: row.quantity, unitPrice: row.unitPrice, pricedOptions: Boolean(row.pricedOptions),
        customization: { ...row.customization, addons: Array.isArray(row.customization.addons) ? row.customization.addons.filter(item => typeof item === "string") : [],
          notes: typeof row.customization.notes === "string" ? row.customization.notes : "" } };
    });
  }
  function restore(sessionId = dineOrders.sessionId, tableCode = guestTableCode) {
    if (!state.sessionApproved || !sessionId || !tableCode) return [];
    try {
      const raw = localStorage.getItem(key(sessionId, tableCode));
      if (!raw) return [];
      const saved = JSON.parse(raw);
      if (saved?.version !== 1 || String(saved.sessionId) !== String(sessionId) || saved.tableCode !== tableCode) throw new Error("Invalid cart visit");
      const original = lines(saved.cart), restored = QuvoCartLimits.normalize(original);
      if (JSON.stringify(original) !== JSON.stringify(restored)) {
        localStorage.setItem(key(sessionId, tableCode), JSON.stringify({ ...saved, cart: restored }));
        Promise.resolve().then(() => showToast("Your saved cart was adjusted to the limit of 10 per item. Review it before ordering."));
      }
      return restored;
    } catch { warn(); return []; }
  }
  function save() {
    const sessionId = dineOrders.sessionId, tableCode = guestTableCode;
    if (state.accessMode !== "dineIn" || !state.sessionApproved || !sessionId || !tableCode || dineOrders.pending) return false;
    try {
      if (state.cart.length) localStorage.setItem(key(sessionId, tableCode), JSON.stringify({ version: 1, sessionId, tableCode, cart: lines(state.cart) }));
      else localStorage.removeItem(key(sessionId, tableCode));
      notified = false; return true;
    } catch { warn(); return false; }
  }
  function clear(sessionId = dineOrders.sessionId, tableCode = guestTableCode) {
    if (!sessionId || !tableCode) return true;
    try { localStorage.removeItem(key(sessionId, tableCode)); return true; }
    catch { warn(); return false; }
  }
  window.QuvoDineCart = { restore, save, clear };
})();
