const preparingList=document.getElementById("preparingList"),readyList=document.getElementById("readyList"),preparingCount=document.getElementById("preparingCount"),readyCount=document.getElementById("readyCount");
function bindKitchenOrders(){
  document.getElementById("searchInput").addEventListener("input",event=>{searchTerm=event.target.value.trim().toLowerCase();render();});
  document.getElementById("categoryFilter").addEventListener("change",event=>{categoryFilter=event.target.value;render();});
}
async function markAsReady(id){
  const order=orders.find(entry=>entry.id===id);if(!order||!kitchenCanReady())return;
  if(!window.confirm('Mark the food for '+id+' as ready?'))return;
  kitchenSql.changing=true;kitchenSql.revision++;render();if(activeOrderId)openOrderModal(activeOrderId);
  try{const data=await kitchenApi({action:'ready',id:order.sqlId});kitchenSql.revision++;
    orders=orders.map(entry=>entry.id===id?mapKitchenOrder(data.order):entry);render();if(activeOrderId)openOrderModal(activeOrderId);
    showToast(data.order.has_drinks&&data.order.order_status==='preparing'?'Food ready. Cashier can mark the full order ready when drinks are finished.':'Food ready for serving.');
  }catch(error){showToast(error.message+' Refresh to check the saved status before retrying.');}
  finally{kitchenSql.changing=false;render();if(activeOrderId)openOrderModal(activeOrderId);await loadKitchenOrders();}
}

function normalizeKitchenOrders(orderList) {
  return orderList
    .map(order => {
      const kitchenItems = order.items.filter(item => KITCHEN_ITEM_CATEGORIES.includes(item.category));
      return {
        ...order,
        items: kitchenItems,
        categoryMix: [...new Set(kitchenItems.map(item => item.category))]
      };
    })
    .filter(order => order.items.length > 0);
}

function renderOrderColumn(container, list, status) {
  if (!list.length) {
    container.innerHTML = `<p class="empty-state">No ${status === "preparing" ? "preparing" : "ready"} food tickets match the current view.</p>`;
    return;
  }

  container.innerHTML = list
    .slice()
    .sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt))
    .map(order => createOrderCard(order))
    .join("");
}

function createOrderCard(order) {
  const elapsed = formatElapsed(order.receivedAt);
  const delayedClass = order.status === "preparing" && getElapsedMinutes(order.receivedAt) >= 12 ? "delayed" : "";
  const badgeClass = order.status === "ready" ? "ready" : getElapsedMinutes(order.receivedAt) >= 12 ? "delay" : "warm";
  const badgeText = order.status === "ready" ? "Ready" : elapsed;
  const firstThreeItems = order.items.slice(0, 3);

  return `
    <article class="order-ticket ${delayedClass}">
      <div class="ticket-top">
        <div>
          <h3>${escapeHtml(order.id)}</h3>
          <p>${escapeHtml(order.table)} • ${escapeHtml(order.customer)}</p>
        </div>
        <span class="status-badge ${badgeClass}">${badgeText}</span>
      </div>

      <div class="ticket-meta">
        <span>Received ${formatTime(order.receivedAt)}</span>
        <span>${order.paymentStatus}</span>
      </div>

      <div class="ticket-items">
        ${firstThreeItems.map(item => `
          <div class="item-row">
            <div>
              <strong>${item.qty}x ${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(item.customizations)}</small>
            </div>
            <span class="item-category">${formatCategory(item.category)}</span>
          </div>
        `).join("")}
      </div>

      ${order.status==='ready'&&order.orderStatus==='preparing'?'<p>Food ready · Drinks/full order awaiting cashier readiness.</p>':''}

      <div class="ticket-actions">
        <button class="text-btn" onclick="openOrderModal('${order.id}')">View Details</button>
        ${order.status === "preparing" ? `<button class="primary-btn" ${kitchenCanReady()?'':'disabled'} onclick="markAsReady('${order.id}')">Mark as Ready</button>` : ""}
      </div>
    </article>
  `;
}

function filteredOrders(status) {
  return orders.filter(order => {
    const matchesStatus = order.status === status;
    const matchesCategory = categoryFilter === "all" || order.categoryMix.includes(categoryFilter);
    const searchable = [
      order.id,
      order.table,
      order.customer,
      order.notes,
      ...order.items.flatMap(item => [item.name, item.customizations, item.category])
    ].join(" ").toLowerCase();
    const matchesSearch = !searchTerm || searchable.includes(searchTerm);

    return matchesStatus && matchesCategory && matchesSearch;
  });
}
