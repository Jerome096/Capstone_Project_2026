const trackingOrderCode = document.getElementById("trackingOrderCode");

const trackingPayment = document.getElementById("trackingPayment");

const statusTimeline = document.getElementById("statusTimeline");

const trackingDetails = document.getElementById("trackingDetails");

const trackingStatus = document.getElementById("trackingStatus");

const trackingUpdatedAt = document.getElementById("trackingUpdatedAt");

function renderTracking() {
  if (state.accessMode === "dineIn" && state.order?.persisted) {
    renderDineTracking();
    return;
  }
  if (!state.order) {
    trackingOrderCode.textContent = "No order yet";
    trackingPayment.textContent = "Payment";
    statusTimeline.innerHTML = CUSTOMER_DATA.orderStatuses
      .map((status) => {
        return `
          <article class="timeline-item">
            <div class="timeline-dot">•</div>
            <div>
              <h3>${status.title}</h3>
              <p>${status.description}</p>
            </div>
          </article>
        `;
      })
      .join("");

    trackingDetails.innerHTML = `
      <div class="empty-card">
        <h3>No submitted order</h3>
        <p>Your order details will appear here after you submit your cart.</p>
      </div>
    `;
    trackingStatus.textContent = "Waiting";
    trackingUpdatedAt.textContent = "Waiting for an order";
    return;
  }

}

// Retained for the existing dine-in session reset; SQL polling owns order progress.
function clearOrderStatusTimers() {
  state.orderStatusTimers.forEach(timer => window.clearTimeout(timer));
  state.orderStatusTimers = [];
}
