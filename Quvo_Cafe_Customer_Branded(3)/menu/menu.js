const categoryTabs = document.getElementById("categoryTabs");

const menuList = document.getElementById("menuList");

const menuSearch = document.getElementById("menuSearch");

const menuCount = document.getElementById("menuCount");

const accessModeLabel = document.getElementById("accessModeLabel");

const menuCustomerName = document.getElementById("menuCustomerName");

const menuContextLabel = document.getElementById("menuContextLabel");

const staffBtnHeader = document.getElementById("staffBtnHeader");

function configureMenuHeader() {
  if (state.accessMode === "online") {
    accessModeLabel.textContent = "Online order";
    menuCustomerName.textContent = state.customerName || "Online customer";
    menuContextLabel.textContent = "Pickup or delivery request";
    staffBtnHeader.style.display = "none";
    paymentNote.textContent =
      "Your selected payment method will be confirmed by Quvo Café staff before preparation begins.";
    fulfillmentCard.classList.remove("hidden");
    return;
  }

  accessModeLabel.textContent = "Dine-in QR";
  menuCustomerName.textContent = state.customerName || "Customer";
  menuContextLabel.textContent = CUSTOMER_DATA.tableNumber;
  staffBtnHeader.style.display = "inline-flex";
  paymentNote.textContent =
    // Sessions are connected now; order submission is a separate database integration.
    "Order submission is not available yet. Please place your order with staff.";
  fulfillmentCard.classList.add("hidden");
}

function renderCategories() {
  categoryTabs.innerHTML = CUSTOMER_DATA.categories
    .map((category) => {
      const activeClass = category === state.selectedCategory ? "active" : "";
      return `<button class="category-btn ${activeClass}" type="button" data-category="${escapeCustomerHtml(category)}">${escapeCustomerHtml(category)}</button>`;
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
      item.category.toLowerCase().includes(state.searchTerm) ||
      item.description.toLowerCase().includes(state.searchTerm);

    return matchesCategory && matchesSearch;
  });
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
        <article class="menu-card clickable-card" role="button" tabindex="0" data-card-item-id="${escapeCustomerHtml(item.id)}" aria-label="Customize ${escapeCustomerHtml(item.name)}">
          <div class="item-icon">${escapeCustomerHtml(item.icon)}</div>
          <div>
            <p class="eyebrow">${escapeCustomerHtml(item.category)}</p>
            <h3>${escapeCustomerHtml(item.name)}</h3>
            <p>${escapeCustomerHtml(item.description)}</p>
            <div class="card-bottom">
              <strong class="price">${formatCurrency(item.price)}</strong>
              <span class="tap-hint">Tap to customize</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

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
