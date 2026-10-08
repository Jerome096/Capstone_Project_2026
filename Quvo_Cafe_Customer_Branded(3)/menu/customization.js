const itemModal = document.getElementById("itemModal");

const customizeForm = document.getElementById("customizeForm");

const modalItemIcon = document.getElementById("modalItemIcon");

const modalItemCategory = document.getElementById("modalItemCategory");

const modalItemName = document.getElementById("modalItemName");

const modalItemDesc = document.getElementById("modalItemDesc");

const modalQty = document.getElementById("modalQty");

const decreaseQty = document.getElementById("decreaseQty");

const increaseQty = document.getElementById("increaseQty");

const drinkOptions = document.getElementById("drinkOptions");

const addToCartBtn = document.getElementById("addToCartBtn");

function openItemModal(itemId) {
  if (dineCartLocked()) return showToast("Retry the pending order before adding more items.");
  const item = CUSTOMER_DATA.menuItems.find((menuItem) => menuItem.id === itemId);

  if (!item) {
    showToast("Item not found.");
    return;
  }

  state.selectedItem = item;
  state.modalQuantity = 1;

  customizeForm.reset();
  modalQty.textContent = "1";
  modalItemIcon.textContent = item.icon;
  modalItemCategory.textContent = item.category;
  modalItemName.textContent = item.name;
  modalItemDesc.textContent = item.description;

  const isDrink = ["coffee", "non-coffee"].includes(item.category.toLowerCase());
  drinkOptions.style.display = isDrink ? "grid" : "none";

  itemModal.classList.add("open");
  itemModal.setAttribute("aria-hidden", "false");
  updateModalPrice();
}

function closeItemModal() {
  itemModal.classList.remove("open");
  itemModal.setAttribute("aria-hidden", "true");
}

function getCustomizationSummary() {
  const formData = new FormData(customizeForm);
  const size = formData.get("size") || "Not applicable";
  const addons = formData.getAll("addons");
  const notes = document.getElementById("itemNotes").value.trim();
  const isDrink =
    state.selectedItem && ["coffee", "non-coffee"].includes(state.selectedItem.category.toLowerCase());

  return {
    size,
    sugarLevel: isDrink ? document.getElementById("sugarLevel").value : "Not applicable",
    iceLevel: isDrink ? document.getElementById("iceLevel").value : "Not applicable",
    addons,
    notes,
  };
}

function calculateModalUnitPrice() {
  // No example size surcharges or add-on prices. Use the selected item price.
  return state.selectedItem ? Number(state.selectedItem.price) : 0;
}

function updateModalPrice() {
  modalQty.textContent = state.modalQuantity;

  if (!state.selectedItem) {
    addToCartBtn.textContent = "Add to cart";
    return;
  }

  const total = calculateModalUnitPrice() * state.modalQuantity;
  addToCartBtn.textContent = `Add to cart · ${formatCurrency(total)}`;
}

function handleAddToCart(event) {
  event.preventDefault();
  if (dineCartLocked()) return showToast("Retry the pending order before changing your cart.");
  if (state.cart.length >= 50) return showToast("An order can contain up to 50 item lines.");

  if (!state.selectedItem) {
    return;
  }

  const customization = getCustomizationSummary();
  const unitPrice = calculateModalUnitPrice();
  const cartItem = {
    cartId: `${state.selectedItem.id}-${Date.now()}`,
    itemId: state.selectedItem.id,
    name: state.selectedItem.name,
    category: state.selectedItem.category,
    icon: state.selectedItem.icon,
    quantity: state.modalQuantity,
    unitPrice,
    customization,
  };

  state.cart.push(cartItem);
  closeItemModal();
  renderCart();
  showToast(`${state.selectedItem.name} added to cart.`);
}

function bindCustomizationEvents() {
  document.querySelectorAll("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", closeItemModal);
  });
  decreaseQty.addEventListener("click", () => {
    state.modalQuantity = Math.max(1, state.modalQuantity - 1);
    updateModalPrice();
  });
  increaseQty.addEventListener("click", () => {
    state.modalQuantity = Math.min(999, state.modalQuantity + 1);
    updateModalPrice();
  });
  customizeForm.addEventListener("change", updateModalPrice);
  customizeForm.addEventListener("submit", handleAddToCart);
}
