const pendingMenuItems = new Set();
const adminMenuFilters={category:'all',search:''};

function bindAdminMenu() {
  const search=document.getElementById('adminMenuSearch');
  if(search){
    search.value='';adminMenuFilters.search='';
    const enableSearch=()=>search.removeAttribute('readonly');
    search.addEventListener('focus',enableSearch);search.addEventListener('pointerdown',enableSearch);
  }
  const addBtn = document.getElementById("addAdminMenuItemBtn");
  if (addBtn) {
    addBtn.addEventListener("click", addAdminMenuItem);
  }
  document.getElementById('adminMenuCategoryFilter')?.addEventListener('change',event=>{adminMenuFilters.category=event.target.value;renderAdminMenu();});
  document.getElementById('adminMenuSearch')?.addEventListener('input',event=>{adminMenuFilters.search=event.target.value.trim().toLowerCase();renderAdminMenu();});
  document.getElementById('clearAdminMenuFilters')?.addEventListener('click',()=>{adminMenuFilters.category='all';adminMenuFilters.search='';document.getElementById('adminMenuSearch').value='';renderAdminMenu();});
}

function renderAdminMenu() {
  const rows = document.getElementById("adminMenuRows");
  if (!rows) return;
  const categoryFilter=document.getElementById('adminMenuCategoryFilter');
  const categories=QuvoMenuCategories.filters(state.menu,'all');
  if(!categories.includes(adminMenuFilters.category))adminMenuFilters.category='all';
  if(categoryFilter){
    const options=categories.map(category=>'<option value="'+escapeAttribute(category)+'">'+escapeHtml(category==='all'?'All categories':QuvoMenuCategories.label(category))+'</option>').join('');
    if(categoryFilter.innerHTML!==options)categoryFilter.innerHTML=options;
    categoryFilter.value=adminMenuFilters.category;
  }
  const filtered=state.menu.filter(item=>(adminMenuFilters.category==='all'||item.category===adminMenuFilters.category)&&[item.name,QuvoMenuCategories.label(item.category)].join(' ').toLowerCase().includes(adminMenuFilters.search));
  const count=document.getElementById('adminMenuResultCount');if(count)count.textContent='Showing '+filtered.length+' of '+state.menu.length+' item'+(state.menu.length===1?'':'s');
  const clear=document.getElementById('clearAdminMenuFilters');if(clear)clear.disabled=adminMenuFilters.category==='all'&&!adminMenuFilters.search;

  rows.innerHTML = filtered.length
    ? filtered
        .map(
          (item) => `
    <div class="admin-menu-row">
      <span class="admin-menu-item-name">${item.imageUrl?'<span class="admin-menu-thumbnail">'+QuvoMenuOptions.photoHTML(item)+'</span>':''}${escapeHtml(item.name)}</span>
      <span>${formatCategory(item.category)}</span>
      <span>${QuvoMenuOptions.priceLabel(item)}</span>
      <span class="menu-status ${item.available ? "" : "off"}">${item.available ? "Available" : "Unavailable"}</span>
      <button class="btn light" onclick="selectAdminMenuItem(${item.id})">Edit</button>
    </div>
  `,
        )
        .join("")
    : `<div class="helper-text" style="padding:16px;">${state.menu.length?'No matching menu items. Try another category or clear the search.':'No menu items yet. Click Add item to create one.'}</div>`;

  if (state.selectedAdminMenuItemId) {
    const panel=document.getElementById("adminEditPanel");
    if(panel?.dataset.itemId!==String(state.selectedAdminMenuItemId)||!panel.querySelector("form"))renderAdminEditPanel(state.selectedAdminMenuItemId);
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
  QuvoMenuEditor.capture();
  state.selectedAdminMenuItemId = itemId;
  renderAdminEditPanel(itemId);
  window.QUVO_WORKSPACE?.revealPanel("#adminEditPanel");
}

function renderAdminEditPanel(itemId) {
  const panel = document.getElementById("adminEditPanel");
  const savedItem = state.menu.find((entry) => entry.id === itemId);
  if (!panel || !savedItem) return;
  const item = QuvoMenuEditor.item(savedItem);
  panel.dataset.itemId=String(itemId);

  panel.innerHTML = `
    <div class="eyebrow">Edit item</div>
    <h2>${escapeHtml(item.name)}</h2>

    <form class="admin-edit-form" onsubmit="saveAdminMenuItem(event, ${item.id})">
      <label>
        Item name
        <input id="adminItemName" required maxlength="100" aria-describedby="adminMenuSaveError" value="${escapeAttribute(item.name)}" />
      </label>
      <div id="adminMenuSaveError" class="admin-error hidden" role="alert"></div>

      <label>
        Category
        <select id="adminItemCategory">
          ${QuvoMenuCategories.choices.map(category=>'<option value="'+category.id+'" '+(item.category===category.id?'selected':'')+'>'+escapeHtml(category.label)+'</option>').join('')}
          ${!QuvoMenuCategories.choices.some(category=>category.id===item.category)?'<option value="'+escapeAttribute(item.category)+'" selected>'+escapeHtml(QuvoMenuCategories.label(item.category))+' (previous category)</option>':''}
        </select>
      </label>

      <section id="adminPricingSection" class="admin-pricing-section" aria-labelledby="adminPricingHeading">
      <h3 id="adminPricingHeading">Pricing</h3>
      <label id="adminSinglePriceField">
        <span id="adminSinglePriceLabel">Item price (₱)</span>
        <input id="adminItemPrice" type="number" required
       min="0" max="99999999.99" step="0.01"
       value="${item.price}" />
      </label>
      <div id="adminSizePricing" class="admin-size-pricing"></div>
      <p id="adminPriceHelp" class="helper-text">Set one item price, or enable size prices.</p>
      </section>

      <label>
        Availability
        <div class="availability-toggle">
          <button type="button" class="${(item.manualAvailable ?? item.available) ? "active" : ""}" onclick="setAdminAvailability(true)">Available</button>
          <button type="button" class="${!(item.manualAvailable ?? item.available) ? "active" : ""}" onclick="setAdminAvailability(false)">Unavailable</button>
        </div>
      </label>

      <input id="adminItemAvailable" type="hidden" value="${(item.manualAvailable ?? item.available) ? "true" : "false"}" />

      ${item.stockWarning ? '<p class="helper-text">Recorded ingredients are low. Ordering stays available unless you mark this item Unavailable.</p>' : ''}

      <button class="btn dark" type="submit">Save changes</button>
      <button class="btn light" type="button" onclick="removeAdminMenuItem(${item.id}, this)">
        ${item.id < 0 ? "Discard item" : "Remove item"}
      </button>
    </form>
  `;
  QuvoMenuEditor.mount(panel.querySelector("form"),item);
}

function setAdminAvailability(value) {
  const field = document.getElementById("adminItemAvailable");
  if (!field) return;
  field.value = value ? "true" : "false";

  document.querySelectorAll(".availability-toggle button").forEach((button, index) => {
    button.classList.toggle("active", value ? index === 0 : index === 1);
  });
}

function adminMenuSaveError(message, duplicate = false) {
  const notice = document.getElementById("adminMenuSaveError");
  if (notice) {
    notice.textContent = message;
    notice.classList.toggle("hidden", !message);
  }
  const name = document.getElementById("adminItemName");
  name?.setAttribute("aria-invalid", duplicate ? "true" : "false");
  if (duplicate) name?.focus();
}

async function saveAdminMenuItem(event, itemId) {
  event.preventDefault();

  const item = state.menu.find((entry) => entry.id === itemId);
  if (!item || pendingMenuItems.has(itemId)) return;

  const button = event.target.querySelector('button[type="submit"]');
  if (button.disabled) return;
  adminMenuSaveError("");

  let editorPayload;
  try{editorPayload=QuvoMenuEditor.payload(itemId);}catch(error){showToast(error.message);return;}
  const payload = {
    ...editorPayload,
    name: document.getElementById("adminItemName").value.trim(),
    category: document.getElementById("adminItemCategory").value,
    price: editorPayload.price ?? document.getElementById("adminItemPrice").value,
    available: document.getElementById("adminItemAvailable").value === "true",
  };
  if (state.menu.some((entry) => Number(entry.id) > 0 && Number(entry.id) !== Number(itemId) &&
      entry.category === payload.category && entry.name.trim().toLowerCase() === payload.name.toLowerCase())) {
    adminMenuSaveError("An item with this name already exists in this category. Choose a different name or category.", true);
    return;
  }

  // Draft items have temporary negative IDs.
  if (item.id > 0) {
    payload.id = item.id;
  }

  pendingMenuItems.add(itemId);
  button.disabled = true;
  button.textContent = "Saving...";
  event.target.inert=true;

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
      const error = new Error(data.error || "Unable to save the item.");
      error.duplicateMenuName = data.code === "duplicate_menu_name";
      throw error;
    }

    const index = state.menu.findIndex((entry) => entry.id === itemId);
    if (index >= 0) {
      state.menu[index] = data.item;
    } else {
      state.menu.unshift(data.item);
    }

    QuvoMenuEditor.forget(itemId);
    document.getElementById("adminEditPanel").replaceChildren();
    state.selectedAdminMenuItemId = data.item.id;

    renderMenu();
    renderAdminMenu();

    showToast(`${data.item.name} saved to the database.`);
  } catch (error) {
    adminMenuSaveError(error.message, error.duplicateMenuName === true);
    showToast(error.message);
  } finally {
    pendingMenuItems.delete(itemId);
    event.target.inert=false;
    button.disabled = false;
    button.textContent = "Save changes";
    const nameField = document.getElementById("adminItemName");
    if (nameField?.getAttribute("aria-invalid") === "true") nameField.focus();
  }
}

async function removeAdminMenuItem(itemId, button) {
  const item = state.menu.find((entry) => entry.id === itemId);
  if (!item || pendingMenuItems.has(itemId)) return;
  const message =
    itemId < 0
      ? `Discard the unsaved item "${item.name}"?`
      : `Remove "${item.name}" from the menu? Previous orders and receipts will stay saved.`;
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

    QuvoMenuEditor.forget(itemId);
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
  adminMenuFilters.search='';const search=document.getElementById('adminMenuSearch');if(search)search.value='';
  const draft = state.menu.find((item) => item.id < 0);

  if (draft) {
    if(adminMenuFilters.category!=='all')adminMenuFilters.category=draft.category;
    renderAdminMenu();
    selectAdminMenuItem(draft.id);
    showToast("Save your new item before adding another.");
    return;
  }

  const newItem = {
    id: -1,
    name: "New item",
    category: adminMenuFilters.category==='all'?'hot-coffee':adminMenuFilters.category,
    price: 0,
    available: false,
    optionGroups: [],
    customOptionsConfigured: true,
    imageUrl: null,
  };

  state.menu.unshift(newItem);
  state.selectedAdminMenuItemId = newItem.id;

  renderAdminMenu();

  window.QUVO_WORKSPACE?.revealPanel("#adminEditPanel");
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
