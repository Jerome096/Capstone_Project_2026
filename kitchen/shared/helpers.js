const toast=document.getElementById("toast");
function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}

function getElapsedMinutes(dateString) {
  return Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / 60000));
}

function formatElapsed(dateString) {
  const minutes = getElapsedMinutes(dateString);
  if (minutes < 1) return "Just now";
  return `${minutes} min${minutes === 1 ? "" : "s"}`;
}

function formatTime(dateString) {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(dateString));
}

function formatCategory(category) {
  return category
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 2400);
}
