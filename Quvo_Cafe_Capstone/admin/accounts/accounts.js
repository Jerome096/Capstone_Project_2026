let accountRows = [];
let accountBusy = false;
let accountLoading = false;
let accountInitialized = false;
const accountElement = (id) => document.getElementById(id);

async function accountRequest(data) {
  const response = await fetch("../api/accounts/index.php", {
    method: data ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: data
      ? { "Content-Type": "application/json", "X-CSRF-Token": window.QUVO_CSRF || "" }
      : {},
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw new Error(result.error || "Account request failed.");
  return result;
}

function accountNotice(message, failed = false) {
  const target = accountElement("accountsNotice");
  target.textContent = message;
  target.classList.remove("hidden");
  target.classList.toggle("is-error", failed);
}

function accountError(id, message) {
  const target = accountElement(id);
  target.textContent = message;
  target.classList.toggle("hidden", !message);
}

function accountSetBusy(busy) {
  accountBusy = busy;
  document.querySelectorAll("#accounts button").forEach((button) => {
    button.disabled = busy;
  });
}

function confirmAccountChange(title, message) {
  const dialog = accountElement("accountConfirmDialog");
  accountElement("accountConfirmTitle").textContent = title;
  accountElement("accountConfirmText").textContent = message;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      dialog.close();
      accountElement("accountConfirmSave").onclick = null;
      accountElement("accountConfirmCancel").onclick = null;
      dialog.oncancel = null;
      resolve(accepted);
    };
    accountElement("accountConfirmSave").onclick = () => finish(true);
    accountElement("accountConfirmCancel").onclick = () => finish(false);
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    dialog.showModal();
    accountElement("accountConfirmCancel").focus();
  });
}

function renderStaffAccounts() {
  const body = accountElement("staffAccountRows");
  body.replaceChildren();
  accountElement("staffAccountCount").textContent = String(accountRows.length);
  if (!accountRows.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.textContent =
      "No staff accounts yet. Create your first staff account when ready.";
    return;
  }
  accountRows.forEach((staff) => {
    const row = body.insertRow();
    [staff.full_name, staff.username].forEach((value) => {
      row.insertCell().textContent = value;
    });
    const active = Number(staff.is_active) === 1;
    const badge = document.createElement("span");
    badge.className = "accounts-status" + (active ? "" : " inactive");
    badge.textContent = active ? "Active" : "Inactive";
    row.insertCell().append(badge);
    const actions = row.insertCell();
    const wrap = document.createElement("div");
    wrap.className = "accounts-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn light";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openStaffAccount(staff));
    const status = document.createElement("button");
    status.type = "button";
    status.className = "btn light";
    status.textContent = active ? "Deactivate" : "Reactivate";
    status.addEventListener("click", async () => {
      if (accountBusy) return;
      if (
        !(await confirmAccountChange(
          active ? "Deactivate staff account?" : "Reactivate staff account?",
          staff.full_name +
            " (" +
            staff.username +
            ")\n" +
            (active
              ? "This blocks sign-in and the next protected request. Account history is retained."
              : "This restores sign-in access for this staff account."),
        ))
      )
        return;
      accountSetBusy(true);
      try {
        const result = await accountRequest({
          action: "status",
          staff_id: Number(staff.staff_id),
          active: !active,
        });
        accountNotice(result.message);
        await loadStaffAccounts();
      } catch (error) {
        accountNotice(error.message, true);
      } finally {
        accountSetBusy(false);
      }
    });
    wrap.append(edit, status);
    actions.append(wrap);
  });
}

async function loadStaffAccounts() {
  if (accountLoading) return;
  accountLoading = true;
  try {
    const result = await accountRequest();
    accountRows = result.staff;
    window.QUVO_SESSION = result.user;
    accountElement("currentUsernameLabel").textContent = result.user.username;
    accountElement("currentRoleLabel").textContent = result.user.role_label;
    renderStaffAccounts();
  } catch (error) {
    accountNotice(error.message, true);
  } finally {
    accountLoading = false;
  }
}

function openStaffAccount(staff = null) {
  if (accountBusy) return;
  accountElement("staffAccountForm").reset();
  accountElement("staffAccountId").value = staff?.staff_id || "";
  accountElement("staffAccountName").value = staff?.full_name || "";
  accountElement("staffAccountUsername").value = staff?.username || "";
  accountElement("staffAccountTitle").textContent = staff
    ? "Edit staff account"
    : "Create staff account";
  accountElement("staffPasswordHelp").textContent = staff
    ? "Leave password fields blank to keep the current password. Fill both to reset it (12 characters minimum)."
    : "Set a password with at least 12 characters. This account will have shared Staff operations access.";
  accountElement("staffAccountPassword").required = !staff;
  accountElement("staffAccountPasswordConfirm").required = !staff;
  accountError("staffAccountError", "");
  accountElement("staffAccountDialog").showModal();
}

function bindAccounts() {
  const form = accountElement("accountForm");
  if (!form) return;
  accountElement("createStaffAccount").addEventListener("click", () =>
    openStaffAccount(),
  );
  accountElement("refreshStaffAccounts").addEventListener("click", () => {
    if (!accountBusy) loadStaffAccounts();
  });
  const editor = accountElement("staffAccountDialog");
  const closeEditor = () => {
    if (accountBusy) return;
    editor.close();
    accountElement("staffAccountForm").reset();
  };
  accountElement("cancelStaffAccount").addEventListener("click", closeEditor);
  editor.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEditor();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (accountBusy) return;
    accountError("accountError", "");
    const data = {
      action: "self",
      username: accountElement("accountUsername").value.trim(),
      current_password: accountElement("accountCurrentPassword").value,
      password: accountElement("accountPassword").value,
      password_confirm: accountElement("accountPasswordConfirm").value,
    };
    if (data.password !== data.password_confirm) {
      accountError("accountError", "The new passwords do not match.");
      return;
    }
    if (
      !(await confirmAccountChange(
        "Update your account?",
        "Username: " +
          data.username +
          "\n" +
          (data.password
            ? "Your password will change. Other sessions will need to sign in again."
            : "Your password will stay the same."),
      ))
    )
      return;
    accountSetBusy(true);
    try {
      const result = await accountRequest(data);
      window.QUVO_SESSION.username = result.username;
      accountElement("currentUsernameLabel").textContent = result.username;
      ["accountCurrentPassword", "accountPassword", "accountPasswordConfirm"].forEach(
        (id) => {
          accountElement(id).value = "";
        },
      );
      accountNotice(result.message);
    } catch (error) {
      accountError("accountError", error.message);
    } finally {
      accountSetBusy(false);
    }
  });

  accountElement("staffAccountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (accountBusy) return;
    accountError("staffAccountError", "");
    const id = accountElement("staffAccountId").value;
    const data = {
      action: id ? "update" : "create",
      staff_id: Number(id),
      full_name: accountElement("staffAccountName").value.trim(),
      username: accountElement("staffAccountUsername").value.trim(),
      password: accountElement("staffAccountPassword").value,
      password_confirm: accountElement("staffAccountPasswordConfirm").value,
    };
    if (data.password !== data.password_confirm) {
      accountError("staffAccountError", "The passwords do not match.");
      return;
    }
    if (
      !(await confirmAccountChange(
        id ? "Save staff changes?" : "Create staff account?",
        data.full_name +
          "\nUsername: " +
          data.username +
          (id && data.password
            ? "\nPassword will be reset; existing sessions will end on their next protected request."
            : ""),
      ))
    )
      return;
    accountSetBusy(true);
    try {
      const result = await accountRequest(data);
      editor.close();
      accountElement("staffAccountForm").reset();
      accountNotice(result.message);
      await loadStaffAccounts();
    } catch (error) {
      accountError("staffAccountError", error.message);
    } finally {
      accountSetBusy(false);
    }
  });
}

function renderAccountForm() {
  const user = QUVO_AUTH.getSession();
  if (!accountElement("accountForm") || !user) return;
  if (!accountInitialized) {
    accountElement("accountUsername").value = user.username;
    accountInitialized = true;
  }
  accountElement("currentUsernameLabel").textContent = user.username;
  accountElement("currentRoleLabel").textContent = user.role_label;
  updateAdminAccessVisual();
  if (
    window.QUVO_CONFIG?.portal === "admin" &&
    accountElement("accounts").classList.contains("active-screen")
  ) {
    loadStaffAccounts();
  }
}
