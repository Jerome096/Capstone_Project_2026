const categoryTabs = document.getElementById("categoryTabs");

const menuList = document.getElementById("menuList");

const menuSearch = document.getElementById("menuSearch");

const menuCount = document.getElementById("menuCount");

const accessModeLabel = document.getElementById("accessModeLabel");

const menuCustomerName = document.getElementById("menuCustomerName");

const menuContextLabel = document.getElementById("menuContextLabel");

const staffBtnHeader = document.getElementById("staffBtnHeader");

function configureMenuHeader() {
  accessModeLabel.textContent = "Dine-in QR";
  menuCustomerName.textContent = state.customerName || "Customer";
  menuContextLabel.textContent = CUSTOMER_DATA.tableNumber;
  staffBtnHeader.style.display = "inline-flex";
  paymentNote.textContent =
    "Pay at the cashier after submitting. Preparation starts after payment is confirmed.";
}

function renderCategories() {
  categoryTabs.innerHTML = CUSTOMER_DATA.categories
    .map((category) => {
      const activeClass = category === state.selectedCategory ? "active" : "";
      return `<button class="category-btn ${activeClass}" type="button" data-category="${escapeCustomerHtml(category)}" aria-pressed="${category === state.selectedCategory}">${escapeCustomerHtml(category === "All" ? "All items" : QuvoMenuCategories.label(category))}</button>`;
    })
    .join("");

  document.querySelectorAll(".category-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCategory = button.dataset.category;
      renderCategories();
      renderMenu();
    });
  });
}

function getFilteredMenuItems() {
  return CUSTOMER_DATA.menuItems.filter((item) => {
    const matchesCategory =
      state.selectedCategory === "All" || item.category === state.selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(state.searchTerm) ||
      QuvoMenuCategories.label(item.category).toLowerCase().includes(state.searchTerm) ||
      item.description.toLowerCase().includes(state.searchTerm);

    return matchesCategory && matchesSearch;
  });
}

// Presentation only: reuse the online menu's artwork when an item has no uploaded photo.
function dineMenuArt(item) {
  if (QuvoMenuCategories.isFood(item.category)) return "food-plate";
  if (/matcha/i.test(item.name)) return "matcha";
  return item.category === "hot-coffee" || /hot|espresso|cappuccino/i.test(item.name) ? "hot-coffee" : "iced-coffee";
}

function dineMenuPhoto(item) {
  if (item.imageUrl) return QuvoMenuOptions.photoHTML(item);
  return `<img class="dine-menu-art" src="assets/menu-art/${dineMenuArt(item)}.svg" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
}

function renderMenu() {
  const items = getFilteredMenuItems();
  menuCount.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;

  if (!CUSTOMER_DATA.menuItems.length) {
    menuList.innerHTML =
      '<div class="empty-card"><h3>No menu items available</h3><p>Please check back later.</p></div>';
    return;
  }

  if (!items.length) {
    menuList.innerHTML = `
      <div class="empty-card">
        <h3>No items found</h3>
        <p>Try another category or search term.</p>
      </div>
    `;
    return;
  }

  menuList.innerHTML = items
    .map((item) => {
      return `
        <article class="menu-card clickable-card dine-menu-card" role="button" tabindex="0" data-card-item-id="${escapeCustomerHtml(item.id)}" aria-label="Customize ${escapeCustomerHtml(item.name)}">
          <div class="item-icon dine-product-image dine-art-${dineMenuArt(item)}">${dineMenuPhoto(item)}</div>
          <div class="dine-product-info">
            <p class="eyebrow">${escapeCustomerHtml(QuvoMenuCategories.label(item.category))}</p>
            <h3>${escapeCustomerHtml(item.name)}</h3>
            <p class="dine-product-description">${escapeCustomerHtml(item.description || "Make it your own. View available options.")}</p>
            <div class="card-bottom">
              <strong class="price">${QuvoMenuOptions.priceLabel(item)}</strong>
              <span class="dine-add-item" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  QuvoMenuOptions.bindPhotos(menuList);
  document.querySelectorAll("[data-card-item-id]").forEach((card) => {
    card.addEventListener("click", () => openItemModal(card.dataset.cardItemId));

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openItemModal(card.dataset.cardItemId);
      }
    });
  });
}

function bindMenuEvents() {
  menuSearch.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim().toLowerCase();
    renderMenu();
  });
  staffBtnHeader.addEventListener("click", requestStaffAssistance);
}
