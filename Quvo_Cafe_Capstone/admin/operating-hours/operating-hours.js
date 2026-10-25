(() => {
  "use strict";
  let saved = null, busy = false, dirty = false, bound = false;
  const node = id => document.getElementById(id), allowed = () => window.QUVO_CONFIG.allowedScreens.includes("operatingHours");
  const formatTime = value => window.QuvoBusinessDay.time(value);
  const localDate = value => value.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
  function controls() {
    node("saveOperatingHours").disabled = busy || !dirty || !saved?.version || saved.setupRequired;
    node("reloadOperatingHours").disabled = busy;
    node("operatingHoursForm").querySelectorAll("input").forEach(field => field.disabled = busy || Boolean(saved?.setupRequired));
  }
  function preview() {
    const opening = node("storeOpeningTime").value, closing = node("storeClosingTime").value, date = node("storeHoursEffectiveDate").value;
    if (!opening || !closing || !date || opening === closing) { node("storeHoursPreviewWindow").textContent = "Choose an opening, a different closing time, and a future business date."; node("storeHoursPreviewExample").textContent = ""; return; }
    const start = new Date(date + "T" + opening + ":00+08:00"), close = new Date(date + "T" + closing + ":00+08:00");
    const overnight = closing < opening; if (overnight) close.setTime(close.getTime() + 86400000);
    node("storeHoursPreviewTitle").textContent = "Business day: " + localDate(start);
    node("storeHoursPreviewWindow").textContent = "Opens " + formatTime(opening) + " on " + localDate(start) + "; closes " + formatTime(closing) + " on " + localDate(close) + ".";
    if (overnight) {
      const minutes = Number(closing.slice(0, 2)) * 60 + Number(closing.slice(3)), sample = Math.floor(minutes / 2);
      const time = String(Math.floor(sample / 60)).padStart(2, "0") + ":" + String(sample % 60).padStart(2, "0");
      node("storeHoursPreviewExample").textContent = "A sale at " + formatTime(time) + " on " + localDate(close) + " belongs to the " + localDate(start) + " business day.";
    } else node("storeHoursPreviewExample").textContent = "Sales use the date the store opens. Later hour changes will start on a future business day.";
  }
  function fill(hours) {
    saved = hours; window.QuvoBusinessDay.install(hours);
    const next = hours.schedule.find(rule => !rule.legacy && rule.effectiveDate >= hours.earliestEffectiveDate) || (hours.active.legacy ? { opening: "15:00", closing: "02:00", effectiveDate: hours.earliestEffectiveDate } : { ...hours.active, effectiveDate: hours.earliestEffectiveDate });
    node("storeOpeningTime").value = next.opening; node("storeClosingTime").value = next.closing;
    node("storeHoursEffectiveDate").min = hours.earliestEffectiveDate; node("storeHoursEffectiveDate").value = next.effectiveDate;
    node("currentOperatingDay").textContent = receiptDateLabel(hours.businessDate);
    node("currentOperatingWindow").textContent = hours.active.legacy ? "Existing calendar-day history is preserved. The next scheduled opening begins the new reporting day." : formatTime(hours.active.opening) + "–" + formatTime(hours.active.closing) + (hours.active.overnight ? " (next day)" : "") + ". Sales after midnight keep the opening date.";
    node("operatingHoursScheduleRows").innerHTML = [...hours.schedule].reverse().map(rule => '<tr><td>' + escapeHtml(rule.legacy ? "Earlier saved history" : receiptDateLabel(rule.effectiveDate)) + '</td><td>' + escapeHtml(rule.legacy ? "Calendar day" : formatTime(rule.opening)) + '</td><td>' + escapeHtml(rule.legacy ? "Calendar day" : formatTime(rule.closing) + (rule.overnight ? " (next day)" : "")) + '</td><td>' + (rule.legacy ? "Preserved" : rule.effectiveDate > hours.businessDate ? "Scheduled" : rule.effectiveDate === hours.active.effectiveDate ? "Active" : "Previous") + '</td></tr>').join("");
    dirty = false; preview(); controls();
  }
  async function load(force = false) {
    if (!allowed() || busy || (dirty && !force)) return;
    busy = true; controls(); node("operatingHoursError").textContent = "";
    try {
      const response = await fetch(quvoPath("api/operating-hours/index.php"), { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || "Could not load operating hours.");
      fill(data.hours); node("operatingHoursStatus").textContent = data.hours.setupRequired ? "Install the included operating-hours SQL setup, then reload this page to save." : "Choose the hours and the future business date when they should begin.";
    } catch (error) { node("operatingHoursError").textContent = error.message; }
    finally { busy = false; controls(); }
  }
  function bind() {
    if (bound || !allowed()) return; bound = true; controls();
    node("operatingHoursForm").addEventListener("input", () => { dirty = true; preview(); controls(); });
    node("reloadOperatingHours").addEventListener("click", () => { if (!dirty || window.confirm("Discard the unsaved hours and reload the saved schedule?")) load(true); });
    node("operatingHoursForm").addEventListener("submit", async event => {
      event.preventDefault(); if (busy || !dirty || !saved?.version || !event.currentTarget.reportValidity()) return;
      const input = { version: saved.version, opening: node("storeOpeningTime").value, closing: node("storeClosingTime").value, effectiveDate: node("storeHoursEffectiveDate").value };
      busy = true; controls(); node("operatingHoursError").textContent = "";
      try {
        const response = await fetch(quvoPath("api/operating-hours/index.php"), { method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", "X-CSRF-Token": window.QUVO_CSRF || "" }, body: JSON.stringify(input) });
        const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || "Could not save operating hours.");
        fill(data.hours); node("operatingHoursStatus").textContent = "Saved for business days starting " + receiptDateLabel(input.effectiveDate) + ". Earlier history is preserved.";
        showToast("Future operating hours saved.");
      } catch (error) { node("operatingHoursError").textContent = error.message; }
      finally { busy = false; controls(); }
    });
  }
  window.QuvoOperatingHours = { bind, load };
})();
