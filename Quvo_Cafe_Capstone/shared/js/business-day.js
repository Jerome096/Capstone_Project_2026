(() => {
  "use strict";
  let hours = null, clockOffset = 0, pending = null;
  const clock = () => new Date(Date.now() + clockOffset);
  function install(value) {
    if (!value || !Array.isArray(value.schedule)) return;
    hours = value;
    const server = Date.parse(value.serverTime); if (Number.isFinite(server)) clockOffset = server - Date.now();
  }
  function date(at = clock()) {
    const local = new Date(new Date(at).getTime() + 8 * 3600000);
    let day = local.toISOString().slice(0, 10), opening = 0;
    for (const rule of hours?.schedule || []) { if (rule.effectiveDate > day) break; opening = Number(rule.openingMinute); }
    if (local.getUTCHours() * 60 + local.getUTCMinutes() < opening) day = new Date(local.getTime() - 86400000).toISOString().slice(0, 10);
    return day;
  }
  function time(value) {
    const [hour, minute] = String(value).split(":").map(Number);
    return (hour % 12 || 12) + ":" + String(minute).padStart(2, "0") + (hour < 12 ? " AM" : " PM");
  }
  async function load(force = false) {
    if (pending) return pending;
    if (hours && !force) return hours;
    pending = (async () => {
      try {
        const response = await fetch(quvoPath("api/operating-hours/index.php"), { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10000) });
        const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || "Operating hours are unavailable.");
        install(data.hours); return hours;
      } catch (error) { console.warn("Operating hours refresh failed:", error.message); return hours; }
      finally { pending = null; }
    })();
    return pending;
  }
  window.QuvoBusinessDay = { date, time, clock, install, load, get settings() { return hours; } };
})();
