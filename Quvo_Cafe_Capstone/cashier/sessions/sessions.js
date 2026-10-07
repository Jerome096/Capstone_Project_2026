// Staff actions update SQL records, and polling shows requests from other customer devices.
const diningSessionState = {
  filter: "open",
  offset: 0,
  counts: {},
  busy: false,
  changing: false,
  revision: 0,
};
async function diningApi(resource, input, query = "") {
  const response = await fetch(quvoPath("api/dining/index.php") + "?resource=" + resource + query, {
    method: input ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": window.QUVO_CSRF || "" },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not complete the request.");
  return data;
}
function diningDate(value) {
  if (!value) return "—";
  return new Date(
    value.replace(" ", "T") + (/[zZ]|[+-]\d\d:\d\d$/.test(value) ? "" : "Z"),
  ).toLocaleString("en-PH");
}
function diningConfirm(message) {
  // The confirmation prevents accidental clicks; the API still validates every permission.
  return window.confirm(message);
}
async function loadSessions() {
  if (diningSessionState.busy || diningSessionState.changing) return;
  diningSessionState.busy = true;
  const revision = diningSessionState.revision;
  try {
    const data = await diningApi(
      "sessions",
      null,
      "&status=" + diningSessionState.filter + "&offset=" + diningSessionState.offset,
    );
    if (revision !== diningSessionState.revision) return;
    state.sessions = data.sessions.map((s) => ({
      ...s,
      id: s.session_id,
      customer: s.guest_name,
      table: s.table_name,
    }));
    diningSessionState.counts = Object.fromEntries(
      data.counts.map((row) => [row.status, Number(row.total)]),
    );
    document.getElementById("sessionNotice").textContent = "";
    renderSessions();
    renderStats();
  } catch (error) {
    document.getElementById("sessionNotice").textContent =
      error.message + " The list may be out of date.";
  } finally {
    diningSessionState.busy = false;
    if (revision !== diningSessionState.revision) loadSessions();
  }
}
function renderSessions() {
  const counts = diningSessionState.counts;
  document.getElementById("pendingCount").textContent = counts.pending || 0;
  document.getElementById("activeCount").textContent = counts.active || 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  document.getElementById("totalCount").textContent = total;
  const filter = diningSessionState.filter;
  const filteredTotal =
    filter === "all"
      ? total
      : filter === "open"
        ? (counts.pending || 0) + (counts.active || 0)
        : counts[filter] || 0;
  document.getElementById("sessionsPrevious").disabled = diningSessionState.offset === 0;
  document.getElementById("sessionsNext").disabled =
    diningSessionState.offset + 50 >= filteredTotal;
  document.getElementById("sessionsPage").textContent = filteredTotal
    ? `Page ${Math.floor(diningSessionState.offset / 50) + 1} · ${filteredTotal} requests`
    : "No requests";
  document.getElementById("sessionRows").innerHTML =
    state.sessions
      .map((s) => {
        const actions =
          s.status === "pending" ? ["approve", "reject"] : s.status === "active" ? ["close"] : [];
        return `<div class="table-row session-row">
      <div class="customer-name">${escapeHtml(s.guest_name)}<div class="guest">Guest · #${Number(s.session_id)}</div></div>
      <div>${escapeHtml(s.table_name)}</div>
      <div class="time-cell">${escapeHtml(diningDate(s.requested_at))}</div>
      <div><span class="pill ${s.status === "active" ? "active-pill" : s.status === "pending" ? "pending-pill" : "neutral-pill"}">${escapeHtml(capitalize(s.status))}</span></div>
      <div class="actions">${actions.map((action) => `<button class="btn ${action === "approve" ? "dark" : "red-outline"}" data-session-action="${action}" data-session-id="${Number(s.session_id)}">${capitalize(action)}</button>`).join("") || "—"}</div>
    </div>`;
      })
      .join("") || '<p class="helper-text dining-empty">No sessions in this view.</p>';
}
async function changeDiningSession(id, action) {
  if (diningSessionState.changing) return;
  const session = state.sessions.find((s) => Number(s.session_id) === id);
  if (
    !session ||
    !diningConfirm(
      `${capitalize(action)} the session for ${session.guest_name} at ${session.table_name}?${action === "close" ? " Customer access will end." : ""}`,
    )
  )
    return;
  diningSessionState.changing = true;
  diningSessionState.revision++;
  document.querySelectorAll("[data-session-action]").forEach((b) => (b.disabled = true));
  try {
    await diningApi("sessions", { id, action });
    showToast("Session updated.");
  } catch (error) {
    showToast(error.message);
  } finally {
    diningSessionState.changing = false;
    await loadSessions();
  }
}
function bindDiningSessions() {
  if (!window.QUVO_CONFIG.allowedScreens.includes("sessions")) return;
  document.getElementById("sessionRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-session-action]");
    if (button) changeDiningSession(Number(button.dataset.sessionId), button.dataset.sessionAction);
  });
  document.getElementById("sessionFilter").addEventListener("change", (event) => {
    diningSessionState.filter = event.target.value;
    diningSessionState.offset = 0;
    diningSessionState.revision++;
    loadSessions();
  });
  document.getElementById("refreshSessions").addEventListener("click", loadSessions);
  for (const [id, step] of [
    ["sessionsPrevious", -50],
    ["sessionsNext", 50],
  ])
    document.getElementById(id).addEventListener("click", () => {
      diningSessionState.offset = Math.max(0, diningSessionState.offset + step);
      diningSessionState.revision++;
      loadSessions();
    });
  loadSessions();
  setInterval(() => {
    if (!document.hidden) loadSessions();
  }, 5000);
}
