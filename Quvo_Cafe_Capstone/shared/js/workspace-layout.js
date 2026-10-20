(() => {
  "use strict";
  const sidebar = document.querySelector("body > .sidebar");
  const main = document.querySelector("body > .main");
  const topbar = main?.querySelector(".topbar");
  if (!sidebar || !main || !topbar) return;

  const tablet = matchMedia("(max-width: 1180px)");
  const icon = (name) => name === "menu"
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  sidebar.id ||= "workspace-navigation";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "workspace-menu-toggle";
  toggle.setAttribute("aria-controls", sidebar.id);
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open workspace menu");
  toggle.innerHTML = icon("menu") + '<span>Menu</span>';
  const menuBadge = document.createElement("span");
  menuBadge.className = "workspace-menu-badge";
  menuBadge.hidden = true;
  menuBadge.setAttribute("aria-hidden", "true");
  toggle.append(menuBadge);
  topbar.prepend(toggle);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "workspace-nav-close";
  close.setAttribute("aria-label", "Close workspace menu");
  close.innerHTML = icon("close");
  sidebar.prepend(close);
  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "workspace-nav-backdrop";
  backdrop.hidden = true;
  backdrop.tabIndex = -1;
  backdrop.setAttribute("aria-label", "Close workspace menu");
  document.body.append(backdrop);
  let navOpen = false;
  let activeModal = null;
  let restoreModalFocus = null;

  // Reuse the existing queues; opening the menu never acknowledges a request.
  const notificationTypes = { sessions: "Sessions", orders: "Payments", alerts: "Assistance" };
  const notificationCounts = { sessions: 0, orders: 0, alerts: 0 };
  const notificationLinks = new Map();
  const notificationGroup = document.createElement("div");
  notificationGroup.className = "workspace-notifications";
  notificationGroup.hidden = true;
  const notificationTitle = document.createElement("div");
  notificationTitle.className = "nav-section-label";
  notificationTitle.textContent = "Needs attention";
  notificationGroup.append(notificationTitle);
  for (const [screen, label] of Object.entries(notificationTypes)) {
    if (sidebar.querySelector(`.nav-item[data-screen="${screen}"]`)) continue;
    const link = document.createElement("a");
    link.className = "nav-item portal-link workspace-notification-link";
    link.href = `../cashier/index.php?screen=${screen}`;
    link.hidden = true;
    link.innerHTML = `<span class="workspace-notification-dot" aria-hidden="true"></span><span>${label}</span><span class="nav-badge">0</span>`;
    notificationLinks.set(screen, link);
    notificationGroup.append(link);
  }
  sidebar.querySelector(".nav")?.prepend(notificationGroup);
  function updateNotifications() {
    const currentScreen = document.querySelector(".screen.active-screen")?.id;
    const pending = Object.entries(notificationCounts).filter(([screen, count]) => count > 0 && screen !== currentScreen);
    const total = pending.reduce((sum, [, count]) => sum + count, 0);
    const description = pending.map(([screen, count]) => `${notificationTypes[screen]}: ${count}`).join(", ");
    menuBadge.hidden = total === 0;
    menuBadge.textContent = total > 99 ? "99+" : String(total);
    const menuLabel = navOpen ? "Close workspace menu" : "Open workspace menu";
    toggle.setAttribute("aria-label", total ? `${menuLabel}. Needs attention: ${description}` : menuLabel);
    toggle.title = total ? `Needs attention: ${description}` : "Workspace menu";
    for (const [screen, link] of notificationLinks) {
      link.hidden = notificationCounts[screen] === 0;
      link.querySelector(".nav-badge").textContent = notificationCounts[screen];
      link.setAttribute("aria-label", `${notificationTypes[screen]}: ${notificationCounts[screen]} pending`);
    }
    notificationGroup.hidden = !Array.from(notificationLinks.values()).some(link => !link.hidden);
  }
  window.QUVO_WORKSPACE = {
    setNotificationCount(screen, count) {
      if (!Object.hasOwn(notificationCounts, screen)) return;
      notificationCounts[screen] = Math.max(0, Math.floor(Number(count) || 0));
      updateNotifications();
    },
  };
  const screenRoot = document.getElementById("screen-fragment-root");
  if (screenRoot) new MutationObserver(records => {
    if (records.some(record => record.target.classList.contains("screen"))) updateNotifications();
  }).observe(screenRoot, { subtree: true, attributes: true, attributeFilter: ["class"] });

  function setNavOpen(open, restoreFocus = true) {
    navOpen = tablet.matches && open;
    document.body.classList.toggle("workspace-nav-open", navOpen);
    toggle.setAttribute("aria-expanded", String(navOpen));
    backdrop.hidden = !navOpen;
    sidebar.inert = Boolean(activeModal) || (tablet.matches && !navOpen);
    main.inert = Boolean(activeModal) || navOpen;
    if (tablet.matches) sidebar.setAttribute("aria-hidden", String(!navOpen));
    else sidebar.removeAttribute("aria-hidden");
    if (navOpen) close.focus({ preventScroll: true });
    else if (restoreFocus && tablet.matches) toggle.focus({ preventScroll: true });
    updateNotifications();
  }
  toggle.addEventListener("click", () => setNavOpen(!navOpen));
  close.addEventListener("click", () => setNavOpen(false));
  backdrop.addEventListener("click", () => setNavOpen(false));
  sidebar.addEventListener("click", (event) => {
    if (event.target.closest(".nav-item, .eod-button, .staff-logout-button")) setNavOpen(false);
  });
  tablet.addEventListener("change", () => setNavOpen(false, false));

  // Move existing nodes, preserving their IDs, event listeners and form ownership.
  // The content scrolls inside the card while its action buttons stay visible.
  document.querySelectorAll(".modal-backdrop").forEach((modal) => {
    const card = modal.firstElementChild;
    if (!card) return;
    const form = Array.from(card.children).find((child) => child.tagName === "FORM" && child.querySelector(":scope > .modal-actions"));
    const container = form || card;
    const actions = container.querySelector(":scope > .modal-actions");
    if (!actions) return;
    card.classList.add("workspace-modal-card");
    if (!card.hasAttribute("tabindex")) card.tabIndex = -1;
    if (form) {
      card.classList.add("workspace-modal-form-card");
      form.classList.add("workspace-modal-form");
    }
    const scroll = document.createElement("div");
    scroll.className = "workspace-modal-scroll";
    if (form) {
      // Keep the heading in the same scroll area as the form when a keyboard opens.
      for (const node of Array.from(card.childNodes)) {
        if (node !== form && !(node.nodeType === 1 && node.classList.contains("modal-close"))) scroll.append(node);
      }
    }
    for (const node of Array.from(container.childNodes)) {
      if (node !== actions && !(node.nodeType === 1 && node.classList.contains("modal-close"))) scroll.append(node);
    }
    container.insertBefore(scroll, actions);
  });

  const board = document.getElementById("kanbanBoard");
  const hint = document.createElement("p");
  hint.className = "workspace-board-hint";
  hint.textContent = "Swipe sideways to view the other order stages.";
  hint.hidden = true;
  board?.before(hint);
  function updateBoardHint() {
    if (board) hint.hidden = !tablet.matches || board.clientWidth === 0 || board.scrollWidth <= board.clientWidth + 1;
  }
  if (board) {
    new ResizeObserver(updateBoardHint).observe(board);
    new MutationObserver(updateBoardHint).observe(board, { childList: true });
  }

  let focusFrame = 0;
  function keepFocusedFieldVisible() {
    const field = document.activeElement;
    if (!activeModal?.contains(field) || !field.matches("input, select, textarea")) return;
    const scroll = field.closest(".workspace-modal-scroll");
    if (!scroll) return;
    const bounds = scroll.getBoundingClientRect();
    const group = field.closest(".amount-field");
    const target = group && group.getBoundingClientRect().height <= bounds.height - 12 ? group : field;
    const rect = target.getBoundingClientRect();
    if (rect.bottom > bounds.bottom - 6) scroll.scrollTop += rect.bottom - bounds.bottom + 6;
    else if (rect.top < bounds.top + 6) scroll.scrollTop -= bounds.top + 6 - rect.top;
  }
  function updateViewport() {
    const viewport = window.visualViewport;
    const height = Math.floor(viewport?.height || innerHeight);
    document.documentElement.style.setProperty("--workspace-viewport-height", `${height}px`);
    document.documentElement.style.setProperty("--workspace-viewport-top", `${Math.floor(viewport?.offsetTop || 0)}px`);
    document.body.classList.toggle("workspace-modal-compact", Boolean(activeModal) && height <= 360);
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(keepFocusedFieldVisible);
    updateBoardHint();
  }
  document.addEventListener("focusin", updateViewport);
  window.addEventListener("resize", updateViewport);
  window.visualViewport?.addEventListener("resize", updateViewport);
  window.visualViewport?.addEventListener("scroll", updateViewport);

  function syncModal() {
    const visible = Array.from(document.querySelectorAll(".modal-backdrop"))
      .filter((modal) => !modal.hidden && !modal.classList.contains("hidden") && getComputedStyle(modal).display !== "none").at(-1) || null;
    document.body.classList.toggle("workspace-modal-open", Boolean(visible || document.querySelector("dialog[open]")));
    if (visible === activeModal) return;
    if (visible) {
      if (!activeModal) restoreModalFocus = document.activeElement;
      activeModal = visible;
      setNavOpen(false, false);
      if (!visible.contains(document.activeElement)) visible.firstElementChild?.focus({ preventScroll: true });
    } else {
      activeModal = null;
      setNavOpen(false, false);
      if (restoreModalFocus?.isConnected && restoreModalFocus.getClientRects().length) restoreModalFocus.focus({ preventScroll: true });
      restoreModalFocus = null;
    }
    updateViewport();
  }
  let modalFrame = 0;
  const modalRoot = document.getElementById("modal-fragment-root");
  if (modalRoot) new MutationObserver(() => {
    cancelAnimationFrame(modalFrame);
    modalFrame = requestAnimationFrame(syncModal);
  }).observe(modalRoot, { subtree: true, attributes: true, attributeFilter: ["class", "hidden", "open"] });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (activeModal) {
        const cancel = activeModal.querySelector("button.modal-close, button[id$='Cancel'], #cancelItemBtn");
        if (cancel && !cancel.disabled) { event.preventDefault(); cancel.click(); }
      } else if (navOpen) { event.preventDefault(); setNavOpen(false); }
    }
    if (event.key !== "Tab") return;
    const scope = activeModal || (navOpen ? sidebar : null);
    if (!scope) return;
    const focusable = Array.from(scope.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex='0']"))
      .filter((element) => element.getClientRects().length > 0);
    const first = focusable[0], last = focusable.at(-1);
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
  setNavOpen(false, false);
  updateViewport();
  syncModal();
})();
