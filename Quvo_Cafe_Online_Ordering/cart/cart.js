const floatingCartBtn = document.getElementById("floatingCartBtn");

const cartItems = document.getElementById("cartItems");

const cartBadge = document.getElementById("cartBadge");

const floatingCartCount = document.getElementById("floatingCartCount");

const subtotalText = document.getElementById("subtotalText");

const totalText = document.getElementById("totalText");

function renderCart() {
  const cartCount = getCartCount();
  const subtotal = getCartSubtotal();

  cartBadge.textContent = cartCount;
  floatingCartCount.textContent = cartCount;
  cartBadge.classList.toggle("visible", cartCount > 0);
  subtotalText.textContent = formatCurrency(subtotal);
  totalText.textContent = formatCurrency(subtotal);

  renderOnlinePayment();
  submitOrderBtn.disabled = online.busy || (!online.pending && (cartCount === 0 || !onlinePaymentReady()));
  document.getElementById("onlineRetryNote").hidden = !online.pending;
  document.querySelectorAll('input[name="fulfillmentOption"],input[name="paymentMethod"],#deliveryAddress,#deliveryContact').forEach(input=>input.disabled=onlineCartLocked());
  submitOrderBtn.textContent = online.busy ? "Submitting…" : online.pending ? "Retry order" : "Submit order";
  updateFulfillmentDisplay();

  if (!state.cart.length) {
    cartItems.innerHTML = `
      <div class="empty-card">
        <h3>Your cart is empty</h3>
        <p>Go back to the menu and add your preferred food or drink.</p>
      </div>
    `;
    updateFloatingCart();
    return;
  }

  cartItems.innerHTML = state.cart
    .map((item) => {
      const addons = item.customization.addons.length
        ? item.customization.addons.join(", ")
        : "No add-ons";
      const notes = item.customization.notes || "No special instructions";

      return `
        <article class="cart-item">
          <div>
            <p class="eyebrow">${escapeCustomerHtml(item.category)}</p>
            <h3>${escapeCustomerHtml(item.name)}</h3>
            <strong class="price">${formatCurrency(item.unitPrice * item.quantity)}</strong>
            <div class="cart-meta">
              <span>Size: ${escapeCustomerHtml(item.customization.size)}</span>
              <span>Sugar: ${escapeCustomerHtml(item.customization.sugarLevel)}</span>
              <span>Ice: ${escapeCustomerHtml(item.customization.iceLevel)}</span>
              <span>Add-ons: ${escapeCustomerHtml(addons)}</span>
              <span>Notes: ${escapeCustomerHtml(notes)}</span>
            </div>
            <div class="cart-actions">
              <div class="cart-stepper">
                <button type="button" data-cart-minus="${escapeCustomerHtml(item.cartId)}">−</button>
                <strong>${item.quantity}</strong>
                <button type="button" data-cart-plus="${escapeCustomerHtml(item.cartId)}">+</button>
              </div>
              <div class="cart-item-controls">
                <button class="edit-cart-btn" type="button" data-cart-edit="${escapeCustomerHtml(item.cartId)}" ${onlineCartLocked() ? "disabled" : ""}>Edit</button>
                <button class="remove-btn" type="button" data-cart-remove="${escapeCustomerHtml(item.cartId)}">Remove</button>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  bindCartButtons();
  updateFloatingCart();
}

function bindCartButtons() {
  document.querySelectorAll("[data-cart-edit]").forEach(button=>{
    button.addEventListener("click",()=>openCartItemEditor(button.dataset.cartEdit));
  });
  document.querySelectorAll("[data-cart-minus]").forEach((button) => {
    button.addEventListener("click", () => updateCartQuantity(button.dataset.cartMinus, -1));
  });

  document.querySelectorAll("[data-cart-plus]").forEach((button) => {
    button.addEventListener("click", () => updateCartQuantity(button.dataset.cartPlus, 1));
  });

  document.querySelectorAll("[data-cart-remove]").forEach((button) => {
    button.addEventListener("click", () => removeCartItem(button.dataset.cartRemove));
  });
}

function updateCartQuantity(cartId, change) {
  if (onlineCartLocked()) return showToast("Retry your pending order before changing the cart.");
  const item = state.cart.find((cartItem) => cartItem.cartId === cartId);

  if (!item) {
    return;
  }

  item.quantity = Math.min(999, item.quantity + change);

  if (item.quantity <= 0) {
    removeCartItem(cartId);
    return;
  }

  renderCart();
}

function removeCartItem(cartId) {
  if (onlineCartLocked()) return showToast("Retry your pending order before changing the cart.");
  state.cart = state.cart.filter((item) => item.cartId !== cartId);
  renderCart();
  showToast("Item removed from cart.");
}

function updateFloatingCart() {
  const cartCount = getCartCount();
  const allowedScreen = state.currentScreen === "screenMenu" && cartCount > 0;
  floatingCartBtn.classList.toggle("visible", allowedScreen);
}

function getCartCount() {
  return state.cart.reduce((count, item) => count + item.quantity, 0);
}

function getCartSubtotal() {
  return state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

function bindCartEvents() {
  floatingCartBtn.addEventListener("click", () => showScreen("screenCart"));
}
