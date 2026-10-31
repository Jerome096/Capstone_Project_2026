const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const toast = document.getElementById("toast");

function formatUpdateTime(value) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatCurrency(value) {
  return currencyFormatter.format(value);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 2200);
}

// Escape customer and database text before inserting it into HTML templates.
function escapeCustomerHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
