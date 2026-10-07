const pendingMenuItems = new Set();

function bindAdminMenu() {
  const addBtn = document.getElementById("addAdminMenuItemBtn");
  if (addBtn) {
    addBtn.addEventListener("click", addAdminMenuItem);
  }
}

function renderAdminMenu() {
  const rows = document.getElementById("adminMenuRows");
  if (!rows) return;

  rows.innerHTML = state.menu.length
    ? state.menu
        .map(
          (item) => `
    <div class="admin-menu-row">
      <span class="admin-menu-item-name">${escapeHtml(item.name)}</span>
      <span>${formatCategory(item.category)}</span>
      <span>₱${item.price}</span>
      <span class="menu-status ${item.available ? "" : "off"}">${item.available ? "Available" : "Unavailable"}</span>
      <button class="btn light" onclick="selectAdminMenuItem(${item.id})">Edit</button>
    </div>
  `,
        )
        .join("")
    : `<div class="helper-text" style="padding:16px;">No menu items yet. Click Add item to create one.</div>`;

  if (state.selectedAdminMenuItemId) {
    renderAdminEditPanel(state.selectedAdminMenuItemId);
  } else {
    const panel = document.getElementById("adminEditPanel");
    if (panel)
      panel.innerHTML = `<div class="receipt-empty-preview compact-empty">
      <h2>Select an item</h2>
      <p>Choose a menu item to edit its details for the cashier POS and customer menu.</p>
    </div>`;
  }
}

function selectAdminMenuItem(itemId) {
  state.selectedAdminMenuItemId = itemId;
  renderAdminEditPanel(itemId);
}

function renderAdminEditPanel(itemId) {
  const panel = document.getElementById("adminEditPanel");
  const item = state.menu.find((entry) => entry.id === itemId);
  if (!panel || !item) return;

  panel.innerHTML = `
    <div class="eyebrow">Edit item</div>
    <h2>${escapeHtml(item.name)}</h2>

    <form class="admin-edit-form" onsubmit="saveAdminMenuItem(event, ${item.id})">
      <label>
        Item name
        <input id="adminItemName" value="${escapeAttribute(item.name)}" />
      </label>

      <label>
        Category
        <select id="adminItemCategory">
          <option value="coffee" ${item.category === "coffee" ? "selected" : ""}>Coffee</option>
          <option value="non-coffee" ${item.category === "non-coffee" ? "selected" : ""}>Non-coffee</option>
          <option value="food" ${item.category === "food" ? "selected" : ""}>Food</option>
          <option value="pastry" ${item.category === "pastry" ? "selected" : ""}>Pastry</option>
        </select>
      </label>

      <label>
        Price
        <input id="adminItemPrice" type="number" required
       min="0" max="99999999.99" step="0.01"
       value="${item.price}" />
      </label>

      <label>
        Availability
        <div class="availability-toggle">
          <button type="button" class="${item.available ? "active" : ""}" onclick="setAdminAvailability(true)">Available</button>
          <button type="button" class="${!item.available ? "active" : ""}" onclick="setAdminAvailability(false)">Unavailable</button>
        </div>
      </label>

      <input id="adminItemAvailable" type="hidden" value="${item.available ? "true" : "false"}" />

      <button class="btn dark" type="submit">Save changes</button>
      <button class="btn light" type="button" onclick="removeAdminMenuItem(${item.id}, this)">
        ${item.id < 0 ? "Discard item" : "Remove item"}
      </button>
    </form>
  `;
}

function setAdminAvailability(value) {
  const field = document.getElementById("adminItemAvailable");
  if (!field) return;
  field.value = value ? "true" : "false";

  document.querySelectorAll(".availability-toggle button").forEach((button, index) => {
    button.classList.toggle("active", value ? index === 0 : index === 1);
  });
}

async function saveAdminMenuItem(event, itemId) {
  event.preventDefault();

  const item = state.menu.find((entry) => entry.id === itemId);
  if (!item || pendingMenuItems.has(itemId)) return;

  const button = event.target.querySelector('button[type="submit"]');
  if (button.disabled) return;

  const payload = {
    name: document.getElementById("adminItemName").value.trim(),
    category: document.getElementById("adminItemCategory").value,
    price: document.getElementById("adminItemPrice").value,
    available: document.getElementById("adminItemAvailable").value === "true",
  };

  // Draft items have temporary negative IDs.
  if (item.id > 0) {
    payload.id = item.id;
  }

  pendingMenuItems.add(itemId);
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    const response = await fetch(quvoPath("api/menu/index.php"), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": window.QUVO_CSRF,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Unable to save the item.");
    }

    const index = state.menu.findIndex((entry) => entry.id === itemId);
    if (index >= 0) {
      state.menu[index] = data.item;
    } else {
      state.menu.unshift(data.item);
    }

    state.selectedAdminMenuItemId = data.item.id;

    renderMenu();
    renderAdminMenu();

    showToast(`${data.item.name} saved to the database.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    pendingMenuItems.delete(itemId);
    button.disabled = false;
    button.textContent = "Save changes";
  }
}

async function removeAdminMenuItem(itemId, button) {
  const item = state.menu.find((entry) => entry.id === itemId);
  if (!item || pendingMenuItems.has(itemId)) return;
  const message =
    itemId < 0
      ? `Discard the unsaved item "${item.name}"?`
      : `Permanently remove "${item.name}" from the menu? This cannot be undone.`;
  if (!window.confirm(message)) return;

  pendingMenuItems.add(itemId);
  button.disabled = true;
  button.textContent = "Removing...";
  try {
    if (itemId > 0) {
      const response = await fetch(quvoPath("api/menu/index.php"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.QUVO_CSRF,
        },
        body: JSON.stringify({ action: "delete", id: itemId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to remove the item.");
      }
    }

    state.menu = state.menu.filter((entry) => entry.id !== itemId);
    if (state.selectedAdminMenuItemId === itemId) {
      state.selectedAdminMenuItemId = null;
    }
    renderMenu();
    renderAdminMenu();
    showToast(
      itemId < 0 ? "Unsaved item discarded." : `${item.name} removed from the menu.`,
    );
  } catch (error) {
    showToast(error.message);
  } finally {
    pendingMenuItems.delete(itemId);
    button.disabled = false;
    button.textContent = itemId < 0 ? "Discard item" : "Remove item";
  }
}

function addAdminMenuItem() {
  const draft = state.menu.find((item) => item.id < 0);

  if (draft) {
    selectAdminMenuItem(draft.id);
    showToast("Save your new item before adding another.");
    return;
  }

  const newItem = {
    id: -1,
    name: "New item",
    category: "coffee",
    price: 0,
    available: false,
  };

  state.menu.unshift(newItem);
  state.selectedAdminMenuItemId = newItem.id;

  renderAdminMenu();

  document.getElementById("adminItemName")?.focus();
}

async function loadMenuItems() {
  try {
    const response = await fetch(quvoPath("api/menu/index.php"), {
      credentials: "same-origin",
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Unable to load the menu.");
    }

    state.menu = data.items;

    renderMenu();
    renderAdminMenu();
  } catch (error) {
    showToast(error.message);
  }
}
