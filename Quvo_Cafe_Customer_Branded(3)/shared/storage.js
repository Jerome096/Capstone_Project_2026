// A fresh namespace prevents old prototype accounts, sessions, and orders from loading.
// Browser storage remains temporary until PHP/SQL Server integration.
const ONLINE_STORAGE_KEY = "quvo_customer_empty_start_orders_v1";

const ACCOUNT_STORAGE_KEY = "quvo_customer_empty_start_accounts_v1";

const ORDER_SEQUENCE_KEY = "quvo_customer_empty_start_sequence_v1";

const ACTIVE_ACCOUNT_KEY = "quvo_customer_empty_start_session_v1";

function generateOrderCode(now = new Date()) {
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  let sequence = { date: dateKey, count: 0 };

  try {
    const saved = JSON.parse(window.localStorage.getItem(ORDER_SEQUENCE_KEY) || "null");
    if (saved && saved.date === dateKey) sequence = saved;
  } catch (error) {
    sequence = { date: dateKey, count: 0 };
  }

  sequence.count += 1;
  window.localStorage.setItem(ORDER_SEQUENCE_KEY, JSON.stringify(sequence));
  const shortDate = dateKey.slice(2);
  return `QVO-${shortDate}-${String(sequence.count).padStart(3, "0")}`;
}

function loadAccounts() {
  return readStoredRecords(ACCOUNT_STORAGE_KEY);
}

function saveAccounts() {
  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(state.accounts));
}

function persistActiveOnlineSession() {
  if (!state.onlineCustomer?.email) return;
  window.localStorage.setItem(ACTIVE_ACCOUNT_KEY, state.onlineCustomer.email);
}

function clearActiveOnlineSession() {
  window.localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}

function restoreActiveOnlineSession() {
  const activeEmail = window.localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  if (!activeEmail) return false;

  const account = state.accounts.find(
    (entry) => String(entry.email || "").toLowerCase() === activeEmail.toLowerCase(),
  );
  if (!account) {
    clearActiveOnlineSession();
    return false;
  }

  state.accessMode = "online";
  state.onlineCustomer = { ...account };
  state.customerName = account.name;
  return true;
}

function loadOnlineOrders() {
  return readStoredRecords(ONLINE_STORAGE_KEY);
}

function saveOnlineOrders() {
  window.localStorage.setItem(ONLINE_STORAGE_KEY, JSON.stringify(state.onlineOrders));
}

function readStoredRecords(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}
