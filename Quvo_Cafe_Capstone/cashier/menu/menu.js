function bindMenu() {
  document.getElementById("customizeMenuBtn").addEventListener("click", () => {
    const openMenuAdmin = () => {
      window.location.assign("../admin/index.php?screen=menuAdmin");
    };

    openAdminWorkspace(openMenuAdmin);
  });

  document.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      document
        .querySelectorAll(".filter")
        .forEach((entry) => entry.classList.remove("active"));
      button.classList.add("active");
      activeMenuFilter = button.dataset.filter;
      renderMenu();
    });
  });

  document.getElementById("menuSearch").addEventListener("input", renderMenu);
  document.getElementById("clearCartBtn").addEventListener("click", clearCart);
  document.getElementById("proceedOrderBtn").addEventListener("click", openCheckoutModal);
}

function renderMenu() {
  const grid = document.getElementById("menuGrid");
  const query = document.getElementById("menuSearch")?.value.toLowerCase().trim() || "";

  const items = state.menu.filter((item) => {
    const matchesFilter =
      activeMenuFilter === "all" || item.category === activeMenuFilter;
    const matchesQuery = item.name.toLowerCase().includes(query);
    return matchesFilter && matchesQuery;
  });

  grid.innerHTML = items.length
    ? items
        .map(
          (item) => `
    <button class="menu-card ${item.available ? "available" : "unavailable"}" ${item.available ? `onclick="openItemModal(${item.id})"` : `onclick="showToast('This item is unavailable.')"`}>
      <span class="category-tag">${item.category}</span>
      <span class="dot menu-dot ${item.available ? "active-dot" : "inactive-dot"}"></span>
      ${item.imageUrl?'<div class="menu-card-photo">'+QuvoMenuOptions.photoHTML(item)+'</div>':''}
      <div class="menu-title">${escapeHtml(item.name)}</div>
      <div class="menu-bottom">
        <span class="price">${QuvoMenuOptions.priceLabel(item)}</span>
        <span class="menu-status ${item.available ? "" : "off"}">${item.available ? "Available" : "Unavailable"}</span>
      </div>
    </button>
  `,
        )
        .join("")
    : `<div class="helper-text">No menu items loaded. Menu data will be populated from the database.</div>`;
}

function openItemModal(itemId) {
  if(posCartLocked())return showToast('Retry the pending POS order before changing the cart.');
  const item = state.menu.find((entry) => entry.id === itemId);
  if (!item || !item.available) return;

  selectedMenuItem = item;
  selectedItemQty = 1;
  selectedDrinkOptions = {
    size: "Regular",
    sugar: "50% sugar",
    ice: "Regular ice",
  };

  document.getElementById("itemModalTitle").textContent = item.name;
  document.getElementById("itemModalPrice").textContent = `₱${item.price}`;
  document.getElementById("itemQty").textContent = selectedItemQty;
  document.getElementById("itemNotes").value = "";

  resetChoiceGroup("size", selectedDrinkOptions.size);
  resetChoiceGroup("sugar", selectedDrinkOptions.sugar);
  resetChoiceGroup("ice", selectedDrinkOptions.ice);

  const isDrink = isDrinkItem(item);
  const configured=item.customOptionsConfigured===true;
  document.getElementById("drinkOptions").classList.toggle("hidden", !isDrink||configured);
  const customRoot=document.getElementById("itemCustomOptions");
  customRoot.hidden=!configured||!QuvoMenuOptions.groups(item).length;
  if(configured)QuvoMenuOptions.render(customRoot,item);else customRoot.replaceChildren();
  updateItemOptionPrice();

  document.getElementById("itemModal").classList.remove("hidden");
  lucide.createIcons();
}

function bindItemModal() {
  document.getElementById('itemCustomOptions').addEventListener('change',updateItemOptionPrice);
  document.getElementById("itemModalClose").addEventListener("click", closeItemModal);
  document.getElementById("cancelItemBtn").addEventListener("click", closeItemModal);

  document.getElementById("itemModal").addEventListener("click", (event) => {
    if (event.target.id === "itemModal") closeItemModal();
  });

  document.querySelectorAll(".choice").forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.dataset.group;
      const value = button.dataset.value;

      selectedDrinkOptions[group] = value;
      resetChoiceGroup(group, value);
    });
  });

  document.getElementById("qtyMinus").addEventListener("click", () => {
    selectedItemQty = Math.max(1, selectedItemQty - 1);
    document.getElementById("itemQty").textContent = selectedItemQty;
    updateItemOptionPrice();
  });

  document.getElementById("qtyPlus").addEventListener("click", () => {
    selectedItemQty += 1;
    document.getElementById("itemQty").textContent = selectedItemQty;
    updateItemOptionPrice();
  });

  document.getElementById("addItemBtn").addEventListener("click", () => {
    if(posCartLocked())return;
    if (!selectedMenuItem) return;

    const configured=selectedMenuItem.customOptionsConfigured===true;
    const customRoot=document.getElementById("itemCustomOptions");
    if(configured&&!QuvoMenuOptions.valid(customRoot))return;
    const custom=configured?QuvoMenuOptions.read(customRoot,selectedMenuItem):null;
    const note = document.getElementById("itemNotes").value.trim();
    const drinkCustomizations = configured ? custom.optionLabels.map(option=>option.label+": "+option.value) : isDrinkItem(selectedMenuItem)
      ? [selectedDrinkOptions.size, selectedDrinkOptions.sugar, selectedDrinkOptions.ice]
      : [];

    const noteCustomizations = note
      ? note
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

    state.posCart.push({
      cartId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      menuId: selectedMenuItem.id,
      category: selectedMenuItem.category,
      name: selectedMenuItem.name,
      price: QuvoMenuOptions.price(selectedMenuItem,configured?custom.options:{}),
      qty: selectedItemQty,
      note,
      customizations: [...drinkCustomizations, ...noteCustomizations],
      drinkOptions: !configured&&isDrinkItem(selectedMenuItem) ? { ...selectedDrinkOptions } : null,
      ...(configured?{optionSelections:custom.options,optionVersion:custom.optionsVersion,optionLabels:custom.optionLabels}:{}),
    });

    const addedItemName = selectedMenuItem.name;
    closeItemModal();
    renderCart();
    window.QUVO_WORKSPACE?.revealPanel("#menu .pos-cart");
    showToast(`${addedItemName} added to manual order.`);
  });
}

function updateItemOptionPrice() {
  if(!selectedMenuItem)return;
  const selected=selectedMenuItem.customOptionsConfigured?QuvoMenuOptions.values(document.getElementById('itemCustomOptions')):{};
  const unit=QuvoMenuOptions.price(selectedMenuItem,selected);
  document.getElementById('itemModalPrice').textContent=QuvoMenuOptions.formatPrice(unit)+' each';
  document.getElementById('addItemBtn').textContent='Add to order · '+QuvoMenuOptions.formatPrice(unit*selectedItemQty);
}

function closeItemModal() {
  document.getElementById("itemModal").classList.add("hidden");
  document.getElementById("drinkOptions").classList.add("hidden");
  selectedMenuItem = null;
  selectedItemQty = 1;
}

function renderCart() {
  const list = document.getElementById("cartItems");
  const empty = document.getElementById("cartEmpty");
  const total = getCartTotal();
  const proceed = document.getElementById("proceedOrderBtn");
  if(posCartLocked()){
    proceed.disabled=true;document.getElementById('clearCartBtn').disabled=true;
  }

  if (state.posCart.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    proceed.disabled = true;
    proceed.classList.add("disabled");
  } else {
    empty.classList.add("hidden");
    proceed.disabled = posCartLocked();
    proceed.classList.remove("disabled");
    list.innerHTML = state.posCart
      .map(
        (item) => `
      <article class="cart-item">
        <div class="cart-item-top">
          <span>${item.qty}× ${item.name}</span>
          <span>₱${(item.qty * item.price).toLocaleString("en-PH")}</span>
        </div>
        ${item.drinkOptions ? `<div class="cart-item-note">${escapeHtml(formatDrinkOptions(item.drinkOptions))}</div>` : ""}
        ${item.optionLabels?.length?`<div class="cart-item-note">${escapeHtml(item.optionLabels.map(option=>option.label+": "+option.value).join(" · "))}</div>`:""}
        ${item.note ? `<div class="cart-item-note">${escapeHtml(item.note)}</div>` : ""}
        <div class="cart-item-actions">
          <span>₱${item.price} each</span>
          <button onclick="removeCartItem('${item.cartId}')">Remove</button>
        </div>
      </article>
    `,
      )
      .join("");
  }

  document.getElementById("cartTotal").textContent = `₱${total.toLocaleString("en-PH")}`;
}

function removeCartItem(cartId) {
  if(posCartLocked())return;
  state.posCart = state.posCart.filter((item) => item.cartId !== cartId);
  renderCart();
}

function clearCart() {
  if(posCartLocked())return;
  state.posCart = [];
  document.getElementById("counterCustomerName").value = "";
  document.getElementById("paidState").classList.add("hidden");
  document.getElementById("posReceiptActions").classList.add("hidden");
  renderCart();
}

function getCartTotal() {
  return state.posCart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function bindCheckoutModal() {
  document.getElementById("checkoutClose").addEventListener("click", closeCheckoutModal);
  document.getElementById("checkoutCancel").addEventListener("click", closeCheckoutModal);
  document.getElementById("checkoutModal").addEventListener("click", (event) => {
    if (event.target.id === "checkoutModal") closeCheckoutModal();
  });

  document.querySelectorAll(".method").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPaymentMethod = button.dataset.method;
      document
        .querySelectorAll(".method")
        .forEach((entry) => entry.classList.remove("selected"));
      button.classList.add("selected");

      const amountInput = document.getElementById("amountReceived");
      const isCash = selectedPaymentMethod === "Cash";
      document.getElementById("checkoutCashBlock").classList.toggle("hidden", !isCash);
      document.getElementById("checkoutChangeLine").classList.toggle("hidden", !isCash);
      document
        .getElementById("checkoutReferenceBlock")
        .classList.toggle("hidden", isCash);
      document.getElementById("paymentReferenceLabel").textContent =
        `${getPaymentReferenceLabel(selectedPaymentMethod)} no. optional`;
      document.getElementById("paymentReference").placeholder =
        `Enter ${selectedPaymentMethod} reference number if available`;
      if (!isCash) {
        amountInput.value = getCartTotal();
      }

      validateCheckout();
    });
  });

  document.getElementById("amountReceived").addEventListener("input", validateCheckout);
  document.getElementById("confirmPaidBtn").addEventListener("click", confirmPaidOrder);
}

function openCheckoutModal() {
  if(posSql.pending)return openPosPendingReview();
  if(posSql.busy)return;
  if (state.posCart.length === 0) return;

  selectedPaymentMethod = null;

  document
    .querySelectorAll(".method")
    .forEach((button) => button.classList.remove("selected"));
  document.getElementById("amountReceived").value = "";
  document.getElementById("paymentReference").value = "";
  document.getElementById("checkoutCashBlock").classList.remove("hidden");
  document.getElementById("checkoutChangeLine").classList.remove("hidden");
  document.getElementById("checkoutReferenceBlock").classList.add("hidden");
  document.getElementById("changeAmount").textContent = "₱0";

  const total = getCartTotal();
  const summary = document.getElementById("checkoutSummary");

  summary.innerHTML = `
    ${state.posCart
      .map(
        (item) => `
      <div>
        <div class="checkout-row">
          <span>${item.qty}× ${item.name}</span>
          <b>₱${(item.qty * item.price).toLocaleString("en-PH")}</b>
        </div>
        ${item.customizations.length ? `<div class="checkout-note">${escapeHtml(item.customizations.join(", "))}</div>` : ""}
      </div>
    `,
      )
      .join("")}
    <div class="checkout-row checkout-total">
      <span>Total</span>
      <b>₱${total.toLocaleString("en-PH")}</b>
    </div>
  `;

  const confirm = document.getElementById("confirmPaidBtn");
  confirm.disabled = true;
  confirm.classList.add("disabled");

  document.getElementById("checkoutModal").classList.remove("hidden");
  lucide.createIcons();
}

function validateCheckout() {
  const total = getCartTotal();
  const amount =
    selectedPaymentMethod === "Cash"
      ? Number(document.getElementById("amountReceived").value)
      : total;
  const change = selectedPaymentMethod === "Cash" ? Math.max(0, amount - total) : 0;
  const confirm = document.getElementById("confirmPaidBtn");

  document.getElementById("changeAmount").textContent =
    `₱${change.toLocaleString("en-PH")}`;

  if (selectedPaymentMethod && amount >= total && total > 0) {
    confirm.disabled = false;
    confirm.classList.remove("disabled");
  } else {
    confirm.disabled = true;
    confirm.classList.add("disabled");
  }
}

function confirmPaidOrder() { startSqlPosReview(); }

function closeCheckoutModal() {
  document.getElementById("checkoutModal").classList.add("hidden");
  selectedPaymentMethod = null;
}
