// Fit the visible area when a mobile browser's keyboard or address bar changes.
// Leave pinch zoom alone so people can magnify the page normally.
(function trackViewport() {
  const viewport = window.visualViewport;
  let pendingFrame = 0;
  function updateHeight() {
    pendingFrame = 0;
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const height = viewport ? viewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-height", height + "px");
    const focused = document.activeElement;
    if (focused && focused.matches("input, textarea, select")) {
      focused.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
  function scheduleUpdate() {
    if (!pendingFrame) pendingFrame = requestAnimationFrame(updateHeight);
  }
  window.addEventListener("resize", scheduleUpdate);
  if (viewport) viewport.addEventListener("resize", scheduleUpdate);
  updateHeight();
})();
