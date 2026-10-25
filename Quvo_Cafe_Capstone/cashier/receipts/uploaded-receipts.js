(() => {
  "use strict";
  const model = { items: [], selectedId: null, date: null, filter: "all", nextOffset: null, loading: false, loaded: false, error: "", request: 0, controller: null, previewKey: null };
  let bound = false, view = "records", searchTimer;
  const node = id => document.getElementById(id);
  const labels = { pending: "Pending", paid: "Paid", served: "Served", cancelled: "Canceled" };
  const timestamp = value => {
    if (!value) return "Not available";
    let text = String(value).replace(" ", "T");
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) text += "Z";
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
  const selectedDate = () => {
    if (!node("uploadedReceiptDate").value) node("uploadedReceiptDate").value = receiptDay();
    return node("uploadedReceiptDate").value;
  };
  function setView(next) {
    view = next;
    node("receiptRecordsPanel").hidden = next !== "records";
    node("receiptUploadsPanel").hidden = next !== "uploads";
    document.querySelectorAll("[data-receipt-view]").forEach(button => {
      const active = button.dataset.receiptView === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    if (next === "uploads" && !model.loading) load();
  }
  function renderPreview(force = false) {
    const item = model.items.find(item => item.order_id === model.selectedId), preview = node("uploadedReceiptPreview");
    if (!item) {
      model.previewKey = null;
      preview.innerHTML = '<div class="receipt-empty-preview"><h2>Select an uploaded receipt</h2><p>Choose an online order to view the original image submitted by the customer.</p></div>';
      return;
    }
    const key = model.date + "|" + item.order_id;
    if (!force && model.previewKey === key) return;
    model.previewKey = key;
    const e = escapeHtml, attribute = value => escapeHtml(value).replaceAll('"', "&quot;");
    const field = (label, value) => '<div><dt>' + e(label) + '</dt><dd>' + e(value) + '</dd></div>';
    const url = quvoPath("api/orders/index.php?receipt=" + encodeURIComponent(item.order_id));
    const orderStatus = { received: "Received", preparing: "Preparing", ready: "Ready", served: "Served", cancelled: "Canceled" }[item.order_status] || item.order_status;
    preview.innerHTML = '<div class="eyebrow">Customer payment upload</div><h2>' + e(item.order_number) + '</h2>' +
      '<dl class="uploaded-receipt-details">' + field("Customer", item.customer_name || "Guest") + field("Order status", orderStatus) +
      field("Payment method", item.payment_method_label || item.payment_method) + field("Order total", money(item.total_amount)) +
      field("Uploaded", timestamp(item.uploaded_at)) + (item.paid_at ? field("Payment confirmed", timestamp(item.paid_at)) : "") +
      (item.order_status === "cancelled" ? field("Canceled", timestamp(item.cancelled_at || item.record_at)) + field("Cancellation reason", item.cancellation_reason || "Not provided") : "") + '</dl>' +
      '<p id="uploadedReceiptImageStatus" class="helper-text" role="status">Loading customer image...</p>' +
      '<div class="uploaded-receipt-image-frame" id="uploadedReceiptImageFrame" hidden><img id="uploadedReceiptImage" class="uploaded-receipt-image" alt="Customer payment receipt for ' + attribute(item.order_number) + '" hidden /></div>' +
      '<div class="uploaded-receipt-image-actions"><button type="button" class="btn light uploaded-receipt-retry" id="uploadedReceiptImageRetry" hidden>Retry image</button>' +
      '<a class="btn light" href="' + attribute(url) + '" target="_blank" rel="noopener">Open full image</a></div>';
    const image = node("uploadedReceiptImage"), frame = node("uploadedReceiptImageFrame"), status = node("uploadedReceiptImageStatus"), retry = node("uploadedReceiptImageRetry");
    image.onload = () => {
      if (!image.isConnected || model.previewKey !== key) return;
      image.hidden = false; frame.hidden = false; status.textContent = "Original image submitted with this online order."; retry.hidden = true;
    };
    image.onerror = () => {
      if (!image.isConnected || model.previewKey !== key) return;
      image.hidden = true; frame.hidden = true; status.textContent = "The uploaded image could not load. Try again."; retry.hidden = false;
    };
    retry.addEventListener("click", () => renderPreview(true));
    image.src = url;
  }
  function render() {
    node("uploadedReceiptsRefresh").disabled = model.loading;
    node("uploadedReceiptsMore").hidden = model.nextOffset === null;
    node("uploadedReceiptsMore").disabled = model.loading;
    node("uploadedReceiptNotice").textContent = model.loading ? "Loading customer uploads..." : model.error || (model.loaded
      ? model.items.length ? "Showing " + receiptDateLabel(model.date) + ". " + model.items.length + " upload" + (model.items.length === 1 ? "" : "s") + " loaded." : "No customer receipt uploads for " + receiptDateLabel(model.date) + " with these filters."
      : "Choose a date to view customer payment uploads.");
    if (!model.items.some(item => item.order_id === model.selectedId)) model.selectedId = model.items[0]?.order_id || null;
    const e = escapeHtml, attribute = value => escapeHtml(value).replaceAll('"', "&quot;");
    node("uploadedReceiptList").innerHTML = model.items.map(item => {
      const status = labels[item.upload_status] ? item.upload_status : "pending";
      const dateLabel = item.date_basis === "cancellation" ? "Canceled" : item.date_basis === "payment" ? "Payment confirmed" : "Uploaded";
      return '<button type="button" class="receipt-list-item uploaded-receipt-item ' + (model.selectedId === item.order_id ? "active" : "") + '" data-upload-order="' + attribute(item.order_id) + '">' +
        '<div class="receipt-list-top"><b>' + e(item.order_number) + '</b><span class="upload-status ' + status + '">' + labels[status] + '</span></div>' +
        '<div class="receipt-list-bottom"><span>' + e(item.customer_name || "Guest") + '</span><span>' + e(money(item.total_amount)) + ' · ' + e(item.payment_method_label || item.payment_method) + '</span></div>' +
        '<div class="receipt-list-date">' + e(dateLabel + ": " + timestamp(item.record_at)) + '</div></button>';
    }).join("");
    renderPreview();
  }
  async function load(append = false) {
    clearTimeout(searchTimer);
    if (append && (model.loading || model.nextOffset === null || model.date !== selectedDate())) return;
    model.controller?.abort();
    const request = ++model.request, date = selectedDate(), filter = model.filter, query = node("uploadedReceiptSearch").value.trim();
    if (!append) { model.items = []; model.selectedId = null; model.nextOffset = null; model.previewKey = null; model.loaded = false; }
    model.date = date; model.loading = true; model.error = "";
    const controller = new AbortController(); model.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    render();
    try {
      const params = new URLSearchParams({ view: "uploaded-receipts", receipt_date: date, status: filter, offset: String(append ? model.nextOffset : 0), q: query });
      const response = await fetch(quvoPath("api/orders/index.php") + "?" + params, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      let result;
      try { result = await response.json(); } catch { throw new Error("Could not load customer receipt uploads. Refresh to try again."); }
      if (!response.ok || !result.ok || !Array.isArray(result.uploads)) throw new Error(result.error || "Could not load customer receipt uploads.");
      if (request !== model.request || date !== selectedDate() || filter !== model.filter || query !== node("uploadedReceiptSearch").value.trim()) return;
      const items = result.uploads.map(item => ({ ...item, order_id: String(item.order_id) }));
      model.items = [...new Map((append ? [...model.items, ...items] : items).map(item => [item.order_id, item])).values()];
      model.nextOffset = result.next_offset ?? null; model.loaded = true;
    } catch (error) {
      if (request === model.request) model.error = error.name === "AbortError" ? "The request timed out. Refresh uploads to try again." : error.message;
    } finally {
      clearTimeout(timeout);
      if (request === model.request) { model.loading = false; model.controller = null; render(); }
    }
  }
  function bind() {
    if (bound || !node("uploadedReceiptDate")) return;
    bound = true; node("uploadedReceiptDate").value = receiptDay(); node("uploadedReceiptSearch").value = "";
    document.querySelectorAll("[data-receipt-view]").forEach(button => {
      button.addEventListener("click", () => setView(button.dataset.receiptView));
      button.addEventListener("keydown", event => {
        const keys = ["ArrowLeft", "ArrowRight", "Home", "End"]; if (!keys.includes(event.key)) return;
        event.preventDefault(); const next = event.key === "Home" ? "records" : event.key === "End" ? "uploads" : view === "records" ? "uploads" : "records";
        setView(next); node(next === "records" ? "receiptRecordsTab" : "receiptUploadsTab").focus();
      });
    });
    node("uploadedReceiptDate").addEventListener("change", () => load());
    node("uploadedReceiptToday").addEventListener("click", () => { node("uploadedReceiptDate").value = receiptDay(); load(); });
    node("uploadedReceiptsRefresh").addEventListener("click", () => load());
    node("uploadedReceiptsMore").addEventListener("click", () => load(true));
    const search = node("uploadedReceiptSearch"), unlock = () => search.removeAttribute("readonly");
    search.addEventListener("focus", unlock); search.addEventListener("pointerdown", unlock);
    search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => load(), 250); });
    node("uploadedReceiptSearchForm").addEventListener("submit", event => { event.preventDefault(); load(); });
    document.querySelectorAll("[data-upload-status]").forEach(button => button.addEventListener("click", () => {
      model.filter = button.dataset.uploadStatus;
      document.querySelectorAll("[data-upload-status]").forEach(entry => { const active = entry === button; entry.classList.toggle("active", active); entry.setAttribute("aria-pressed", String(active)); });
      load();
    }));
    node("uploadedReceiptList").addEventListener("click", event => {
      const button = event.target.closest("[data-upload-order]"); if (!button) return;
      model.selectedId = button.dataset.uploadOrder; render(); window.QUVO_WORKSPACE?.revealPanel("#uploadedReceiptPreview");
    });
  }
  window.QuvoUploadedReceipts = { bind, showRecords: () => { if (bound) setView("records"); } };
})();
