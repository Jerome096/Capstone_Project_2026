const submitOrderBtn = document.getElementById("submitOrderBtn");
const paymentNote = document.getElementById("paymentNote");

// Dine-in orders are submitted only through the existing authenticated SQL endpoint.
function submitOrder() { return submitDineOrder(); }

function bindCheckoutEvents() {
  document.getElementById("dineOrderSelect").addEventListener("change", event => selectDineOrder(event.target.value));
  submitOrderBtn.addEventListener("click", submitOrder);
}
