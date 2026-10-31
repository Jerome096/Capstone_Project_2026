(function () {
  "use strict";
  const appRoot = new URL("../../", document.currentScript.src);
  async function request(action, body) {
    const endpoint = new URL(`api/auth/${action}.php`, appRoot);
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": window.QUVO_CSRF || "",
      },
      body: JSON.stringify(body || {}),
    });
    const result = await response.json();
    if (!response.ok || !result.ok)
      throw new Error(result.error || "The request failed. Please try again.");
    if (result.redirect) result.redirect = new URL(result.redirect, endpoint).href;
    return result;
  }
  function hasAllowedRole(session, roles) {
    return !!session && (!roles?.length || roles.includes(session.role));
  }
  window.QUVO_AUTH = {
    getSession: () => window.QUVO_SESSION || null,
    hasAllowedRole,
    login: (username, password, access) =>
      request("login", { username, password, access }),
    logout: () => request("logout"),
    checkAdmin: () => request("admin"),
    confirmAdmin: (password) => request("admin-confirm", { password }),
    requireAuth(options = {}) {
      const session = window.QUVO_SESSION;
      if (!hasAllowedRole(session, options.allowedRoles)) {
        window.location.replace(new URL("index.php", appRoot));
        return null;
      }
      return session;
    },
  };
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });
})();
