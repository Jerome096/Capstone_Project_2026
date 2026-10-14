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
  if (onlineCartLocked()) { return showToast("Retry your pending order before changing the cart."); }
  const item = CUSTOMER_DATA.menuItems.find((menuItem) => menuItem.id === itemId);

  if (!item) {
    showToast("Item not found.");
    return;
  }

  state.selectedItem = item;
  state.editingCartId = null;
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
  state.editingCartId = null;
}

function openCartItemEditor(cartId) {
  if(onlineCartLocked())return showToast("Retry your pending order before changing the cart.");
  const cartItem=state.cart.find(item=>item.cartId===cartId);if(!cartItem)return;
  if(!CUSTOMER_DATA.menuItems.some(item=>item.id===cartItem.itemId))return showToast("This item is no longer available in the menu.");
  openItemModal(cartItem.itemId);state.editingCartId=cartId;
  state.selectedItem={...state.selectedItem,price:cartItem.unitPrice};state.modalQuantity=cartItem.quantity;
  document.getElementById("sugarLevel").value=cartItem.customization.sugarLevel;
  document.getElementById("iceLevel").value=cartItem.customization.iceLevel;
  document.getElementById("itemNotes").value=cartItem.customization.notes||"";
  updateModalPrice();
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
  addToCartBtn.textContent = `${state.editingCartId ? "Save changes" : "Add to cart"} · ${formatCurrency(total)}`;
}

function handleAddToCart(event) {
  event.preventDefault();
  if (onlineCartLocked()) { return showToast("Retry your pending order before changing the cart."); }
  if (!state.editingCartId && state.cart.length >= 50) return showToast("An order can contain up to 50 item lines.");

  if (!state.selectedItem) {
    return;
  }

  const customization = getCustomizationSummary();
  if(state.editingCartId){
    const existing=state.cart.find(item=>item.cartId===state.editingCartId);
    if(!existing){closeItemModal();return showToast("This item was removed from your cart.");}
    existing.quantity=state.modalQuantity;existing.customization=customization;
    closeItemModal();renderCart();showToast("Cart item updated.");return;
  }
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
