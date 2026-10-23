const STAFF_SESSION_KEY = "quvo_staff_session";

const state = {
  adminUnlocked: false,
  activeSalesView: "daily",
  currentUser: null,
  insideTables: [],
  outsideTables: [],
  longTableSeats: [],
  sessions: [],
  orders: [],
  menu: [],
  posCart: [],
  receipts: [],
  selectedReceiptId: null,
  activeReceiptFilter: "all",
  selectedAdminMenuItemId: null,
  records: [],
  eodRecords: [],
  inventoryItems: [],
  inventoryMovements: [],
  inventoryRecipes: [],
  activeInventoryFilter: "all",
  editingInventoryItemId: null,
  editingInventoryRecipeMenu: null,
  alerts: [],
  activities: [],
};

let editOrderId = null;
let activeMenuFilter = "all";
let selectedMenuItem = null;
let selectedItemQty = 1;
let selectedPaymentMethod = null;
let paymentOrderId = null;
let pendingPaymentReview = null;
let lastReceiptId = null;
let selectedDrinkOptions = {
  size: "Regular",
  sugar: "50% sugar",
  ice: "Regular ice",
};

function getOrderSourceLabel(source) {
  if (source === "manual") return "Manual counter";
  if (source === "online") return "Online order";
  return "Dine-in QR";
}

function isDigitalPayment(method) {
  return method === "GCash" || method === "PayMaya";
}

function getPaymentReferenceLabel(method) {
  return method === "PayMaya" ? "PayMaya reference" : "GCash reference";
}

function getPaymentPendingText(method) {
  if (method === "Cash") return "Awaiting cash collection";
  if (method === "PayMaya") return "Awaiting PayMaya confirmation";
  if (method === "GCash") return "Awaiting GCash confirmation";
  return "Awaiting payment confirmation";
}

function getPaymentActionLabel(method) {
  if (method === "Cash") return "Collect cash & start preparing";
  if (method === "PayMaya") return "Verify PayMaya & start preparing";
  return "Verify GCash & start preparing";
}

function formatStockQty(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return "0";
  return Number(number.toFixed(3)).toString();
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function findInventoryItemByName(name) {
  const target = normalizeName(name);
  return state.inventoryItems.find((item) => normalizeName(item.name) === target);
}

function findInventoryRecipe(menuName) {
  const target = normalizeName(menuName);
  return state.inventoryRecipes.find((recipe) => normalizeName(recipe.menu) === target);
}

function getRecipeIngredients(recipe) {
  if (!recipe) return [];
  if (Array.isArray(recipe.ingredients)) return recipe.ingredients;
  if (Array.isArray(recipe.uses)) {
    return recipe.uses.map((item) => ({ item, qty: 1 }));
  }
  return [];
}

function updateInventoryLinkedMenus() {
  state.inventoryItems.forEach((item) => {
    const linked = state.inventoryRecipes
      .filter((recipe) =>
        getRecipeIngredients(recipe).some(
          (ingredient) => normalizeName(ingredient.item) === normalizeName(item.name),
        ),
      )
      .map((recipe) => recipe.menu);

    if (linked.length) {
      item.linkedMenu = [...new Set(linked)].join(", ");
    }
  });
}

// Availability and deductions are computed by SQL, including payment retries.
function updateMenuAvailabilityFromInventory() {}
function deductInventoryForOrder() { return []; }
const screenText = {
  dashboard: {
    eyebrow: "Live overview",
    title: "Dashboard",
    sub: "Current shift overview",
  },
  menu: {
    eyebrow: "Counter POS",
    title: "Menu",
    sub: "Manual ordering for customers ordering from the counter",
  },
  sessions: {
    eyebrow: "Dine-in QR",
    title: "Session Approvals",
    sub: "Review and approve incoming dine-in session requests",
  },
  orders: {
    eyebrow: "Kanban board",
    title: "Order Management",
    sub: "Track and advance order status across kitchen stages",
  },
  receipts: {
    eyebrow: "Transactions",
    title: "Receipts",
    sub: "Review paid, served, completed, and voided orders",
  },
  reports: {
    eyebrow: "Analytics",
    title: "Reports",
    sub: "Current shift performance summary",
  },
  websiteContent: {eyebrow:"Admin access",title:"Website content",sub:"Edit your cafe story, address, opening hours and contact details"},
  menuAdmin: {
    eyebrow: "Admin access",
    title: "Menu customization",
    sub: "Edit menu items, prices, categories, and availability",
  },
  records: {
    eyebrow: "Admin access",
    title: "System records",
    sub: "Review staff actions, payment confirmations, voided orders, and transaction activity",
  },
  salesHistory: {
    eyebrow: "Admin access",
    title: "Sales history",
    sub: "Review saved EOD, daily, monthly, and yearly sales records",
  },
  accounts: {
    eyebrow: "Admin access",
    title: "Account management",
    sub: "Manage authorized staff sign-in credentials",
  },
  inventory: {
    eyebrow: "Admin access",
    title: "Inventory Monitoring",
    sub: "Track estimated stock levels, restock activity, and menu availability impact",
  },
  alerts: {
    eyebrow: "Staff requests",
    title: "Alerts",
    sub: "Guest assistance requests requiring immediate attention",
  },
};

const ADMIN_SCREENS = [
  "reports",
  "menuAdmin",
  "websiteContent",
  "records",
  "salesHistory",
  "accounts",
  "inventory",
];

function isAdminScreen(screen) {
  return ADMIN_SCREENS.includes(screen);
}

const stageMeta = {
  received: { title: "Received", dotClass: "received-dot", countClass: "tag-blue" },
  preparing: { title: "Preparing", dotClass: "pending-dot", countClass: "tag-amber" },
  ready: { title: "Ready", dotClass: "active-dot", countClass: "tag-green" },
};
