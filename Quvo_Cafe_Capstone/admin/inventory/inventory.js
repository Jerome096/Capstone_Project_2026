function bindInventory() {
  const search = document.getElementById("inventorySearch");
  if (search) {
    search.addEventListener("input", renderInventoryRows);
  }

  document.querySelectorAll("[data-inventory-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document
        .querySelectorAll("[data-inventory-filter]")
        .forEach((entry) => entry.classList.remove("active"));
      button.classList.add("active");
      state.activeInventoryFilter = button.dataset.inventoryFilter;
      renderInventoryRows();
    });
  });

  const addButton = document.getElementById("addInventoryItemBtn");
  if (addButton) {
    addButton.addEventListener("click", () => openInventoryStockModal());
  }

  const movementButton = document.getElementById("addStockMovementBtn");
  if (movementButton) {
    movementButton.addEventListener("click", addManualStockMovement);
  }

  const closeButton = document.getElementById("inventoryStockClose");
  const cancelButton = document.getElementById("inventoryStockCancel");
  const saveButton = document.getElementById("inventoryStockSave");

  if (closeButton) closeButton.addEventListener("click", closeInventoryStockModal);
  if (cancelButton) cancelButton.addEventListener("click", closeInventoryStockModal);
  if (saveButton) saveButton.addEventListener("click", saveInventoryStockItem);

  const modal = document.getElementById("inventoryStockModal");
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target.id === "inventoryStockModal") closeInventoryStockModal();
    });
  }

  const recipeButton = document.getElementById("addInventoryRecipeBtn");
  if (recipeButton)
    recipeButton.addEventListener("click", () => openInventoryRecipeModal());

  const recipeModal = document.getElementById("inventoryRecipeModal");
  const recipeClose = document.getElementById("inventoryRecipeClose");
  const recipeCancel = document.getElementById("inventoryRecipeCancel");
  const recipeSave = document.getElementById("inventoryRecipeSave");
  const recipeMenu = document.getElementById("inventoryRecipeMenu");

  if (recipeClose) recipeClose.addEventListener("click", closeInventoryRecipeModal);
  if (recipeCancel) recipeCancel.addEventListener("click", closeInventoryRecipeModal);
  if (recipeSave) recipeSave.addEventListener("click", saveInventoryRecipe);
  if (recipeMenu)
    recipeMenu.addEventListener("change", () =>
      fillInventoryRecipeLines(recipeMenu.value),
    );
  if (recipeModal) {
    recipeModal.addEventListener("click", (event) => {
      if (event.target.id === "inventoryRecipeModal") closeInventoryRecipeModal();
    });
  }
}

function renderInventory() {
  if (!document.getElementById("inventoryRows")) return;

  updateInventoryLinkedMenus();
  renderInventoryStats();
  renderInventoryRows();
  renderInventoryImpact();
  renderInventoryMovements();
  renderInventoryRecipes();
}

function getInventoryStatus(item) {
  if (Number(item.current) <= 0) return "out";
  if (Number(item.current) <= Number(item.reorder)) return "low";
  return "normal";
}

function getInventoryStatusLabel(status) {
  return {
    normal: "Normal",
    low: "Low",
    out: "Out",
  }[status];
}

function renderInventoryStats() {
  const tracked = state.inventoryItems.length;
  const low = state.inventoryItems.filter(
    (item) => getInventoryStatus(item) === "low",
  ).length;
  const out = state.inventoryItems.filter(
    (item) => getInventoryStatus(item) === "out",
  ).length;
  const affected = state.inventoryItems.filter(
    (item) => getInventoryStatus(item) !== "normal" && item.linkedMenu,
  ).length;

  document.getElementById("inventoryTrackedStat").textContent = tracked;
  document.getElementById("inventoryLowStat").textContent = low;
  document.getElementById("inventoryOutStat").textContent = out;
  document.getElementById("inventoryAffectedStat").textContent = affected;
}

function renderInventoryRows() {
  const container = document.getElementById("inventoryRows");
  if (!container) return;

  const query = (document.getElementById("inventorySearch")?.value || "")
    .toLowerCase()
    .trim();

  const items = state.inventoryItems.filter((item) => {
    const status = getInventoryStatus(item);
    const matchesFilter =
      state.activeInventoryFilter === "all" || status === state.activeInventoryFilter;
    const haystack = `${item.name} ${item.category} ${item.linkedMenu}`.toLowerCase();
    return matchesFilter && haystack.includes(query);
  });

  container.innerHTML = items.length
    ? items
        .map((item) => {
          const status = getInventoryStatus(item);

          return `
      <div class="inventory-row">
        <div>
          <div class="inventory-item-name">${item.name}</div>
          <div class="inventory-subtext">Bill of Materials-based deduction enabled when linked</div>
        </div>
        <span>${item.category}</span>
        <span><b>${item.current}</b> ${item.unit}</span>
        <span>${item.reorder} ${item.unit}</span>
        <span><span class="inventory-status ${status}">${getInventoryStatusLabel(status)}</span></span>
        <span>${item.linkedMenu || "Not linked"}</span>
        <span class="inventory-row-actions">
          <button class="btn light" onclick="openInventoryStockModal(${item.id})">Edit</button>
          <button class="btn dark" onclick="quickInventoryRestock(${item.id})">Restock</button>
        </span>
      </div>
    `;
        })
        .join("")
    : `<div class="inventory-row"><span>No inventory items found.</span></div>`;

  lucide.createIcons();
}

function renderInventoryImpact() {
  const impact = document.getElementById("inventoryImpactList");
  if (!impact) return;

  const affected = state.inventoryItems.filter(
    (item) => getInventoryStatus(item) !== "normal",
  );

  if (!state.inventoryItems.length) {
    impact.innerHTML = `<article class="inventory-impact-card"><b>No inventory data loaded.</b><p>Inventory records will be populated from the database.</p></article>`;
    return;
  }

  impact.innerHTML = affected.length
    ? affected
        .map((item) => {
          const status = getInventoryStatus(item);
          const links = String(item.linkedMenu || "")
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);

          return `
      <article class="inventory-impact-card">
        <div class="inventory-card-top">
          <div>
            <b>${item.name}</b>
            <p>${item.current} ${item.unit} left · reorder at ${item.reorder} ${item.unit}</p>
          </div>
          <span class="inventory-status ${status}">${getInventoryStatusLabel(status)}</span>
        </div>
        <div class="inventory-chip-row">
          ${links.map((link) => `<span class="inventory-chip">${link}</span>`).join("") || `<span class="inventory-chip">No menu link</span>`}
        </div>
        <p class="${status === "out" ? "inventory-danger" : "inventory-warning"}" style="margin-top:10px;">
          ${status === "out" ? "Recommended action: mark affected menu items unavailable until restocked." : "Recommended action: prepare restock before the item runs out."}
        </p>
      </article>
    `;
        })
        .join("")
    : `<article class="inventory-impact-card"><b>No menu impact detected.</b><p>All linked stock items are above reorder level.</p></article>`;
}

function renderInventoryMovements() {
  const log = document.getElementById("inventoryMovementLog");
  if (!log) return;

  log.innerHTML = state.inventoryMovements.length
    ? state.inventoryMovements
        .map(
          (entry) => `
    <article class="inventory-movement-card">
      <div class="inventory-card-top">
        <b>${entry.type}</b>
        <span>${entry.time}</span>
      </div>
      <p>${entry.item} · ${entry.qty}</p>
      <p>${entry.note}</p>
    </article>
  `,
        )
        .join("")
    : `<article class="inventory-movement-card"><b>No stock records yet.</b><p>Restock, adjustments, and automatic order deductions will appear here.</p></article>`;
}

function renderInventoryRecipes() {
  const list = document.getElementById("inventoryRecipeList");
  if (!list) return;

  updateInventoryLinkedMenus();

  if (!state.inventoryRecipes.length) {
    list.innerHTML = `<article class="inventory-recipe-card"><b>No Bill of Materials records loaded.</b><p>Recipe and ingredient links will be populated from the database.</p></article>`;
    return;
  }

  list.innerHTML = state.inventoryRecipes
    .map((recipe) => {
      const ingredients = getRecipeIngredients(recipe);
      return `
      <article class="inventory-recipe-card">
        <div class="inventory-card-top">
          <div>
            <b>${recipe.menu}</b>
            <p>${ingredients.length} linked ingredient${ingredients.length === 1 ? "" : "s"}</p>
          </div>
          <span class="inventory-chip">Bill of Materials</span>
        </div>
        <div class="inventory-chip-row">
          ${
            ingredients
              .map((ingredient) => {
                const stockItem = findInventoryItemByName(ingredient.item);
                const unit = stockItem?.unit || "units";
                return `<span class="inventory-chip">${ingredient.item}: ${formatStockQty(ingredient.qty)} ${unit}</span>`;
              })
              .join("") || `<span class="inventory-chip">No ingredient links</span>`
          }
        </div>
        <div class="inventory-recipe-actions">
          <button class="btn light" onclick="openInventoryRecipeModal('${escapeAttribute(recipe.menu)}')">Edit Bill of Materials</button>
        </div>
      </article>
    `;
    })
    .join("");

  lucide.createIcons();
}

function openInventoryStockModal(itemId = null) {
  const item = itemId ? state.inventoryItems.find((entry) => entry.id === itemId) : null;
  state.editingInventoryItemId = itemId;

  document.getElementById("inventoryStockEyebrow").textContent = item
    ? "Edit stock"
    : "Add stock item";
  document.getElementById("inventoryStockTitle").textContent = item
    ? "Update stock item"
    : "New inventory item";
  document.getElementById("inventoryItemName").value = item?.name || "";
  document.getElementById("inventoryCategory").value = item?.category || "Coffee";
  document.getElementById("inventoryCurrent").value = item?.current ?? "";
  document.getElementById("inventoryUnit").value = item?.unit || "";
  document.getElementById("inventoryReorder").value = item?.reorder ?? "";
  document.getElementById("inventoryLinkedMenu").value = item?.linkedMenu || "";
  document.getElementById("inventoryNote").value = "";

  document.getElementById("inventoryStockModal").classList.remove("hidden");
  lucide.createIcons();
}

function closeInventoryStockModal() {
  document.getElementById("inventoryStockModal").classList.add("hidden");
  state.editingInventoryItemId = null;
}

function saveInventoryStockItem() {
  const name = document.getElementById("inventoryItemName").value.trim();
  const category = document.getElementById("inventoryCategory").value;
  const current = Number(document.getElementById("inventoryCurrent").value);
  const unit = document.getElementById("inventoryUnit").value.trim() || "units";
  const reorder = Number(document.getElementById("inventoryReorder").value);
  const linkedMenu = document.getElementById("inventoryLinkedMenu").value.trim();
  const note =
    document.getElementById("inventoryNote").value.trim() || "Manual inventory update";

  if (!name || Number.isNaN(current) || Number.isNaN(reorder)) {
    showToast("Please complete item name, current stock, and reorder level.");
    return;
  }

  if (state.editingInventoryItemId) {
    const item = state.inventoryItems.find(
      (entry) => entry.id === state.editingInventoryItemId,
    );
    if (!item) return;

    const difference = current - Number(item.current);
    item.name = name;
    item.category = category;
    item.current = current;
    item.unit = unit;
    item.reorder = reorder;
    item.linkedMenu = linkedMenu;

    state.inventoryMovements.unshift({
      time: "now",
      type: difference >= 0 ? "Restock" : "Adjustment",
      item: name,
      qty: `${difference >= 0 ? "+" : ""}${difference.toFixed(2)} ${unit}`,
      note,
    });

    addSystemRecord(
      "Inventory updated",
      `${name} stock changed by ${difference.toFixed(2)} ${unit}`,
      "Inventory",
    );
  } else {
    const nextId = Math.max(...state.inventoryItems.map((entry) => entry.id), 0) + 1;
    state.inventoryItems.unshift({
      id: nextId,
      name,
      category,
      current,
      unit,
      reorder,
      linkedMenu,
    });

    state.inventoryMovements.unshift({
      time: "now",
      type: "New item",
      item: name,
      qty: `${current} ${unit}`,
      note,
    });

    addSystemRecord(
      "Inventory item added",
      `${name} added to inventory monitoring`,
      "Inventory",
    );
  }

  updateMenuAvailabilityFromInventory();
  closeInventoryStockModal();
  renderInventory();
  renderMenuAdmin();
  renderRecords();
  showToast("Inventory record updated.");
}

function quickInventoryRestock(itemId) {
  const item = state.inventoryItems.find((entry) => entry.id === itemId);
  if (!item) return;

  const addQty = Math.max(Number(item.reorder), 1);
  item.current = Number((Number(item.current) + addQty).toFixed(2));

  state.inventoryMovements.unshift({
    time: "now",
    type: "Restock",
    item: item.name,
    qty: `+${addQty} ${item.unit}`,
    note: "Quick restock from inventory dashboard",
  });

  addSystemRecord(
    "Inventory restocked",
    `${item.name} quick restocked by ${addQty} ${item.unit}`,
    "Inventory",
  );
  updateMenuAvailabilityFromInventory();
  renderInventory();
  renderMenuAdmin();
  renderRecords();
  showToast(`${item.name} restocked.`);
}

function addManualStockMovement() {
  const item = state.inventoryItems[0];
  if (!item) {
    showToast("No inventory item is loaded yet.");
    return;
  }

  const movementQty = Math.min(Number(item.current), 0.25);
  item.current = Math.max(0, Number((Number(item.current) - movementQty).toFixed(2)));

  state.inventoryMovements.unshift({
    time: "now",
    type: "Manual stock-out",
    item: item.name,
    qty: `-${movementQty} ${item.unit}`,
    note: "Manual stock adjustment record",
  });

  addSystemRecord(
    "Inventory movement added",
    `Manual stock-out recorded for ${item.name}`,
    "Inventory",
  );
  updateMenuAvailabilityFromInventory();
  renderInventory();
  renderRecords();
  showToast("Manual stock movement added.");
}

function openInventoryRecipeModal(menuName = "") {
  const modal = document.getElementById("inventoryRecipeModal");
  if (!modal) return;

  const select = document.getElementById("inventoryRecipeMenu");
  select.innerHTML = state.menu
    .map(
      (item) =>
        `<option value="${escapeAttribute(item.name)}">${escapeHtml(item.name)}</option>`,
    )
    .join("");

  const recipe = menuName ? findInventoryRecipe(menuName) : state.inventoryRecipes[0];
  const selectedMenu = recipe?.menu || state.menu[0]?.name || "";
  state.editingInventoryRecipeMenu = selectedMenu;
  select.value = selectedMenu;
  fillInventoryRecipeLines(selectedMenu);

  modal.classList.remove("hidden");
  lucide.createIcons();
}

function fillInventoryRecipeLines(menuName) {
  const recipe = findInventoryRecipe(menuName);
  const ingredients = getRecipeIngredients(recipe);
  const lines = ingredients
    .map((ingredient) => `${ingredient.item} | ${formatStockQty(ingredient.qty)}`)
    .join("\n");
  document.getElementById("inventoryRecipeLines").value = lines;
}

function closeInventoryRecipeModal() {
  const modal = document.getElementById("inventoryRecipeModal");
  if (modal) modal.classList.add("hidden");
  state.editingInventoryRecipeMenu = null;
}

function parseInventoryRecipeLines(rawValue) {
  return String(rawValue || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.includes("|") ? line.split("|") : line.split(":");
      const item = (parts[0] || "").trim();
      const qty = Number((parts[1] || "").trim());
      return { item, qty };
    })
    .filter((entry) => entry.item && !Number.isNaN(entry.qty) && entry.qty > 0);
}

function saveInventoryRecipe() {
  const menu = document.getElementById("inventoryRecipeMenu").value;
  const ingredients = parseInventoryRecipeLines(
    document.getElementById("inventoryRecipeLines").value,
  );

  if (!menu || !ingredients.length) {
    showToast("Add at least one ingredient and deduction quantity.");
    return;
  }

  let recipe = findInventoryRecipe(menu);
  if (recipe) {
    recipe.ingredients = ingredients;
    delete recipe.uses;
  } else {
    recipe = { menu, ingredients };
    state.inventoryRecipes.push(recipe);
  }

  updateInventoryLinkedMenus();
  updateMenuAvailabilityFromInventory();
  addSystemRecord(
    "Bill of Materials updated",
    `${menu} ingredient deduction setup updated`,
    "Inventory",
  );
  closeInventoryRecipeModal();
  renderInventory();
  renderMenuAdmin();
  renderRecords();
  showToast(`Bill of Materials setup updated for ${menu}.`);
}
