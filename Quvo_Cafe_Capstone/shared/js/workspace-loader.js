const QUVO_SCREEN_FRAGMENTS = [
  "cashier/dashboard/dashboard.fragment.html",
  "cashier/menu/menu.fragment.html",
  "cashier/sessions/sessions.fragment.html",
  "cashier/orders/orders.fragment.html",
  "barista/dashboard/barista.fragment.html",
  "cashier/receipts/receipts.fragment.html",
  "admin/reports/reports.fragment.html",
  "admin/menu-management/menu-management.fragment.html",
  "admin/website-content/website-content.fragment.html",
  "admin/records/records.fragment.html",
  "admin/sales-history/sales-history.fragment.html",
  "admin/accounts/accounts.fragment.html",
  "admin/inventory/inventory.fragment.html",
  "cashier/alerts/alerts.fragment.html",
];

const QUVO_MODAL_FRAGMENTS = [
  "cashier/dashboard/eod-modal.html",
  "shared/components/admin-access-modal.html",
  "cashier/menu/item-modal.html",
  "cashier/menu/checkout-modal.html",
  "cashier/orders/order-payment-modal.html",
  "cashier/orders/sql-payment-modal.html",
  "cashier/orders/online-order-details-modal.html",
  "cashier/orders/preparation-tickets.html",
  "barista/dashboard/barista-ticket-modal.html",
  "cashier/receipts/payment-review-modal.html",
  "cashier/receipts/receipt-success-modal.html",
  "cashier/orders/edit-order-modal.html",
  "admin/inventory/inventory-stock-modal.html",
  "admin/inventory/inventory-recipe-modal.html",
  "admin/inventory/inventory-movement-modal.html",
];

const QUVO_WORKSPACE_SCRIPTS = [
  "shared/js/ordering-control.js",
  "shared/js/menu-options.js",
  "admin/menu-management/menu-photo.js",
  "admin/menu-management/menu-editor.js",
  "shared/js/workspace-layout.js",
  "shared/js/state.js",
  "shared/js/navigation.js",
  "cashier/dashboard/dashboard.js",
  "cashier/menu/menu.js",
  "cashier/menu/pos-sql.js",
  "cashier/sessions/sessions.js",
  "cashier/orders/orders.js",
  "cashier/orders/sql-orders.js",
  "shared/js/thermal-print.js",
  "cashier/orders/preparation-tickets.js",
  "barista/dashboard/barista.js",
  "cashier/receipts/receipts.js",
  "cashier/alerts/alerts.js",
  "admin/reports/reports.js",
  "admin/menu-management/menu-management.js",
  "admin/website-content/website-content.js",
  "admin/records/records.js",
  "login/login.js",
  "admin/sales-history/sales-history.js",
  "admin/accounts/accounts.js",
  "admin/inventory/inventory.js",
  "shared/js/helpers.js",
  "shared/js/bootstrap.js",
];

function quvoPath(path) {
  const base = (window.QUVO_CONFIG && window.QUVO_CONFIG.base) || "";
  return `${base}${path}`;
}

async function appendQuvoFragments(paths, targetId) {
  const target = document.getElementById(targetId);
  for (const path of paths) {
    const response = await fetch(quvoPath(path), {cache:"no-store"});
    if (!response.ok) throw new Error(`Could not load ${path}`);
    target.insertAdjacentHTML("beforeend", await response.text());
  }
}

function loadQuvoScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = quvoPath(path) + "?v=home-about-editor-1";
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${path}`));
    document.body.appendChild(script);
  });
}

(async function bootProtectedWorkspace() {
  try {
    await appendQuvoFragments(QUVO_SCREEN_FRAGMENTS, "screen-fragment-root");
    await appendQuvoFragments(QUVO_MODAL_FRAGMENTS, "modal-fragment-root");

    for (const script of QUVO_WORKSPACE_SCRIPTS) {
      await loadQuvoScript(script);
    }
    window.QuvoOrderingStaff?.start();
  } catch (error) {
    console.error(error);
    document.getElementById("screenTitle").textContent = "Workspace unavailable";
    document.getElementById("screenSub").textContent = "Refresh the page to try again.";
    const notice = document.createElement("div");
    notice.setAttribute("role", "alert");
    notice.style.cssText =
      "position:fixed;inset:auto 16px 16px 16px;padding:14px 16px;background:#7f1d1d;color:white;border-radius:10px;z-index:99999";
    notice.textContent = "The workspace could not be loaded. Check your connection, then refresh the page.";
    document.body.appendChild(notice);
  } finally {
    document.getElementById("screen-fragment-root").setAttribute("aria-busy", "false");
    document.getElementById("workspaceLoading")?.remove();
    document.body.classList.remove("workspace-loading");
  }
})();
