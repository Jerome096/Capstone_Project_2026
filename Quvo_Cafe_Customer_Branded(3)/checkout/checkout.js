const submitOrderBtn = document.getElementById("submitOrderBtn");

const fulfillmentCard = document.getElementById("fulfillmentCard");

const deliveryDetails = document.getElementById("deliveryDetails");

const paymentNote = document.getElementById("paymentNote");

function updateFulfillmentDisplay() {
  const isOnline = state.accessMode === "online";
  fulfillmentCard.classList.toggle("hidden", !isOnline);

  const selectedFulfillment = getSelectedFulfillment();
  const isDelivery = isOnline && selectedFulfillment === "Staff-coordinated delivery request";
  deliveryDetails.classList.toggle("hidden", !isDelivery);

  if (isDelivery) {
    prefillDeliveryDetails();
  }
}

function getSelectedFulfillment() {
  const selected = document.querySelector("input[name='fulfillmentOption']:checked");
  return selected ? selected.value : "Pickup";
}

function submitOrder() {
  // Dine-in orders must wait for an order API instead of reporting prototype-only success.
  if (state.accessMode === "dineIn") {
    showToast("Order submission is not available yet. Please order with staff.");
    return;
  }
  if (!state.cart.length) {
    showToast("Add at least one item before submitting.");
    return;
  }

  if (state.accessMode === "online" && !state.onlineCustomer) {
    showToast("Please log in or register first.");
    return;
  }

  const fulfillment =
    state.accessMode === "online" ? getSelectedFulfillment() : "Dine-in table service";
  const deliveryAddress = document.getElementById("deliveryAddress").value.trim();
  const deliveryContact = document.getElementById("deliveryContact").value.trim();

  if (
    fulfillment === "Staff-coordinated delivery request" &&
    (!deliveryAddress || !deliveryContact)
  ) {
    showToast("Please enter delivery address and contact details for staff reference.");
    return;
  }

  const paymentMethod = document.querySelector("input[name='paymentMethod']:checked").value;
  const now = new Date();
  const orderCode = generateOrderCode(now);

  state.order = {
    orderCode,
    accessMode: state.accessMode,
    source: state.accessMode === "online" ? "Online order" : "Dine-in QR",
    customerName: state.customerName,
    tableNumber: state.accessMode === "dineIn" ? CUSTOMER_DATA.tableNumber : "Not applicable",
    accountEmail: state.onlineCustomer ? state.onlineCustomer.email : "Not applicable",
    contact: state.onlineCustomer ? state.onlineCustomer.contact : "Not applicable",
    fulfillment,
    deliveryAddress,
    deliveryContact,
    paymentMethod,
    submittedAt: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    items: [...state.cart],
    total: getCartSubtotal(),
    status: "Received",
    statusIndex: 0,
    lastUpdated: now.toISOString(),
  };

  state.orderStatusIndex = 0;
  state.cart = [];

  if (state.accessMode === "online") {
    addOrderToOnlineHistory(state.order);
  }

  renderCart();
  renderTracking();
  renderHistory();
  showToast("Order submitted successfully.");
  showScreen("screenTracking");
  startOrderStatusWatch();
}

function prefillDeliveryDetails(force = false) {
  if (!state.onlineCustomer) return;

  const addressField = document.getElementById("deliveryAddress");
  const contactField = document.getElementById("deliveryContact");

  if (addressField && (force || !addressField.value.trim())) {
    addressField.value = state.onlineCustomer.address || "";
  }

  if (contactField && (force || !contactField.value.trim())) {
    contactField.value = state.onlineCustomer.contact || "";
  }
}

function bindCheckoutEvents() {
  document.querySelectorAll("input[name='fulfillmentOption']").forEach((input) => {
    input.addEventListener("change", updateFulfillmentDisplay);
  });
  submitOrderBtn.addEventListener("click", submitOrder);
}
