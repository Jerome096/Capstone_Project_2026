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

  // Prevent prototype-only submission until dine-in orders have a persistent backend.
  submitOrderBtn.disabled = cartCount === 0 || state.accessMode === "dineIn";
  submitOrderBtn.textContent =
    state.accessMode === "dineIn" ? "Ordering not available yet" : "Submit order";
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
              <button class="remove-btn" type="button" data-cart-remove="${escapeCustomerHtml(item.cartId)}">Remove</button>
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
  const item = state.cart.find((cartItem) => cartItem.cartId === cartId);

  if (!item) {
    return;
  }

  item.quantity += change;

  if (item.quantity <= 0) {
    removeCartItem(cartId);
    return;
  }

  renderCart();
}

function removeCartItem(cartId) {
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
