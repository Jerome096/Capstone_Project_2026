const modal=document.getElementById("orderModal"),modalTitle=document.getElementById("modalTitle"),modalStatus=document.getElementById("modalStatus"),modalBadge=document.getElementById("modalBadge"),modalBody=document.getElementById("modalBody"),modalActions=document.getElementById("modalActions");
function bindKitchenDetails(){
  document.getElementById("closeModal").addEventListener("click",closeOrderModal);
  modal.addEventListener("click",event=>{if(event.target===modal)closeOrderModal();});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeOrderModal();});
}

function openOrderModal(orderId) {
  const order = orders.find(item => item.id === orderId);
  if (!order) return;
  activeOrderId = orderId;

  modalTitle.textContent = `${order.id} Food Ticket Details`;
  modalStatus.textContent = order.status === "ready" ? (order.orderStatus==='preparing'?'Food ready · Full order preparing':'Ready for Serving') : "Preparing";
  modalBadge.textContent = order.table;
  modalBadge.className = `status-badge ${order.status === "ready" ? "ready" : "warm"}`;

  modalBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail-box">
        <p>Customer</p>
        <strong>${escapeHtml(order.customer)}</strong>
      </div>
      <div class="detail-box">
        <p>Received</p>
        <strong>${formatTime(order.receivedAt)}</strong>
      </div>
      <div class="detail-box">
        <p>Status</p>
        <strong>${order.status === "ready" ? "Ready" : "Preparing"}</strong>
      </div>
    </div>

    <div class="detail-box">
      <p>Food Preparation Note</p>
      <strong>${escapeHtml(order.notes || "No special note.")}</strong>
    </div>

    <h3>Food Items and Customizations</h3>
    <div class="modal-items">
      ${order.items.map(item => `
        <div class="item-row">
          <div>
            <strong>${item.qty}x ${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.customizations)}</small>
          </div>
          <span class="item-category">${formatCategory(item.category)}</span>
        </div>
      `).join("")}
    </div>
  `;

  modalActions.innerHTML = `
    <button class="secondary-btn" onclick="closeOrderModal()">Close</button>
    ${order.status === "preparing" ? `<button class="primary-btn" ${kitchenCanReady()?'':'disabled'} onclick="markAsReady('${order.id}')">Mark as Ready</button>` : ""}
  `;

  modal.classList.remove("hidden");
}

function closeOrderModal() {
  modal.classList.add("hidden");
  activeOrderId = null;
}
