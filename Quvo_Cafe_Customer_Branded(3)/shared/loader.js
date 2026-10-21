// Assemble fragments before binding controls. Paths are relative to index.html.
(async function loadCustomerApp() {
  const scripts = [
    "shared/menu-options.js",
    "shared/ordering-status.js",
    "shared/order-ready-alerts.js",
    "menu/menu-data.js",
    "shared/state.js",
    "shared/helpers.js",
    "shared/navigation.js",
    "cart/cart.js",
    "dine-in/dine-in.js",
    "dine-in/assistance.js",
    "orders/dine-in-orders.js",
    "menu/menu.js",
    "checkout/checkout.js",
    "menu/customization.js",
    "tracking/tracking.js",
    "shared/bootstrap.js",
  ];
  try {
    if (location.protocol === "file:")
      throw new Error("Open index.html with the project PHP server.");
    while (document.querySelector("template[data-fragment]")) {
      const placeholders = [...document.querySelectorAll("template[data-fragment]")];
      await Promise.all(
        placeholders.map(async (placeholder) => {
          const response = await fetch(placeholder.dataset.fragment);
          if (!response.ok) throw new Error("Unable to load " + placeholder.dataset.fragment);
          const fragment = document.createElement("template");
          fragment.innerHTML = await response.text();
          placeholder.replaceWith(fragment.content);
        }),
      );
    }
    for (const src of scripts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src + "?v=ready-alert-recovery-1";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Unable to load " + src));
        document.body.append(script);
      });
    }
    // Wait for the QR session lookup before marking the customer app ready.
    await initializeCustomerApp();
    document.documentElement.dataset.appReady = "true";
  } catch (error) {
    console.error(error);
    const message = document.createElement("p");
    message.setAttribute("role", "alert");
    message.textContent =
      "Customer ordering could not start. Open this customer page through the project PHP server and reload. " +
      error.message;
    document.querySelector(".app-frame").replaceChildren(message);
  } finally {
    document.getElementById("workspaceLoading")?.remove();
    document.body.classList.remove("workspace-loading");
    document.body.setAttribute("aria-busy", "false");
  }
})();
