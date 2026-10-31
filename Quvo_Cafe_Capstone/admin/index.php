<?php
require_once __DIR__ . "/../includes/auth.php";
$user = quvo_require_workspace(["admin"]);
if (empty($_SESSION["admin_confirmed"])) {
    $screen = is_string($_GET["screen"] ?? null) ? $_GET["screen"] : "reports";
    header(
        "Location: ../cashier/index.php?admin=1&adminScreen=" .
            rawurlencode($screen),
    );
    exit();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quvo Caf&eacute; | Admin Workspace</title>
  <link rel="icon" type="image/png" href="../shared/images/quvo-favicon.png" />
  <link rel="stylesheet" href="../shared/css/styles.css?v=no-barista-1" />
  <link rel="stylesheet" href="../shared/css/quvo-design-system.css" />
  <link rel="stylesheet" href="../shared/css/quvo-shell.css?v=hide-zero-badges-1" />
  <link rel="stylesheet" href="../shared/css/portal.css" />
  <link rel="stylesheet" href="../cashier/dashboard/dashboard.css?v=report-colors-1" />
  <link rel="stylesheet" href="../cashier/menu/menu.css?v=menu-categories-1" />
  <link rel="stylesheet" href="../cashier/sessions/sessions.css?v=staff-session-timer-1" />
  <link rel="stylesheet" href="../cashier/orders/orders.css?v=native-ticket-popup-4" />
  <link rel="stylesheet" href="../cashier/receipts/receipts.css?v=guest-wifi-1" />
  <link rel="stylesheet" href="../cashier/receipts/uploaded-receipts.css?v=guest-wifi-1" />
  <link rel="stylesheet" href="../cashier/alerts/alerts.css?v=staff-alerts-1" />
  <link rel="stylesheet" href="../admin/reports/reports.css?v=pos-payment-methods-1" />
  <link rel="stylesheet" href="../admin/menu-management/menu-management.css?v=admin-menu-no-autofill-1" />
  <link rel="stylesheet" href="../admin/website-content/website-content.css?v=home-about-editor-1" />
  <link rel="stylesheet" href="../admin/operating-hours/operating-hours.css?v=logout-grace-1" />
  <link rel="stylesheet" href="../admin/wifi-settings/wifi-settings.css?v=guest-wifi-1" />
  <link rel="stylesheet" href="../admin/records/records.css?v=pos-payment-methods-1" />
  <link rel="stylesheet" href="../admin/sales-history/sales-history.css?v=inventory-save-2" />
  <link rel="stylesheet" href="../admin/accounts/accounts.css?v=staff-account-delete-2" />
  <link rel="stylesheet" href="../admin/inventory/inventory.css?v=tablet-stock-keyboard-1" />
  <link rel="stylesheet" href="../shared/css/workspace-tablet.css?v=tablet-payment-alerts-2" />
  <link rel="stylesheet" href="../shared/css/workspace-loading.css?v=centered-spinner-1" />
  <link rel="stylesheet" href="../shared/css/menu-options.css?v=sizes-checkbox-addons-1" />
  <link rel="stylesheet" href="../shared/css/ordering-control.css?v=ordering-confirmation-1" />
  <script src="https://unpkg.com/lucide@latest"></script>
  <?php echo quvo_bootstrap($user); ?>
<script src="../shared/js/auth.js"></script>
  <script>
    window.QUVO_CONFIG = {
      base: "../",
      portal: "admin",
      initialScreen: "reports",
      allowedScreens: ["reports", "menuAdmin", "websiteContent", "operatingHours", "wifiSettings", "records", "salesHistory", "accounts", "inventory"],
      allowedRoles: ["admin"],
      roleLabel: "Administrator",
      loginUrl: "../login/login.php",
      standaloneWorkspace: true
    };
    window.QUVO_SESSION = QUVO_AUTH.requireAuth({
      allowedRoles: window.QUVO_CONFIG.allowedRoles,
      loginUrl: window.QUVO_CONFIG.loginUrl
    });
  </script>
  <link rel="stylesheet" href="../shared/css/workspace-cafe.css?v=reports-no-graph-4" />
</head>
<body class="logged-in workspace-loading quvo-cafe-ui">
  <div class="workspace-loading-screen" id="workspaceLoading" role="status" aria-label="Loading workspace">
    <span class="workspace-spinner" aria-hidden="true"></span>
    <p>Preparing workspace</p>
  </div>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark brand-mark-image"><img alt="Quvo Caf&eacute; logo" class="sidebar-logo-img" src="../shared/images/quvo-logo.jpg" /></div>
      <div class="brand-name">Quvo Caf&eacute;</div>
      <div class="brand-sub">Admin Workspace</div>
    </div>
    <nav class="nav">

<div class="nav-section-label nav-section-label-first">Administration</div>
<div class="portal-badge"><strong>Staff workspace</strong></div>
<button class="nav-item active" data-admin-screen="reports"><i data-lucide="bar-chart-3"></i><span>Reports</span></button>
<button class="nav-item" data-admin-screen="menuAdmin"><i data-lucide="square-pen"></i><span>Menu edit</span></button>
<button class="nav-item" data-admin-screen="websiteContent"><i data-lucide="notebook-pen"></i><span>Website content</span></button>
<button class="nav-item" data-admin-screen="operatingHours"><i data-lucide="clock-3"></i><span>Operating hours</span></button>
<button class="nav-item" data-admin-screen="wifiSettings"><i data-lucide="wifi"></i><span>Guest Wi-Fi</span></button>
<button class="nav-item" data-admin-screen="records"><i data-lucide="history"></i><span>Records</span></button>
<button class="nav-item" data-admin-screen="salesHistory"><i data-lucide="calendar-days"></i><span>Sales history</span></button>
<button class="nav-item" data-admin-screen="accounts"><i data-lucide="user-cog"></i><span>Accounts</span></button>
<button class="nav-item" data-admin-screen="inventory"><i data-lucide="boxes"></i><span>Inventory</span></button>
<a class="nav-item portal-link" href="payment-qr.php"><i data-lucide="qr-code"></i><span>Payment QR codes</span></a>
<div class="nav-divider"></div>
<div class="nav-section-label">Other workspaces</div>
<a class="nav-item portal-link" href="../cashier/index.php"><i data-lucide="monitor-dot"></i><span>Cashier</span><i class="portal-arrow" data-lucide="arrow-up-right"></i></a>

      <div class="admin-mode-indicator" id="adminModeIndicator">Signed in</div>
    </nav>
    <div class="staff-session-card">
      <div class="staff-session-avatar" id="staffAvatar">FP</div>
      <div class="staff-session-copy"><strong id="staffSessionName">Staff</strong><span id="staffSessionRole">Administrator</span></div>
      <button aria-label="Log out" class="staff-logout-button" id="logoutBtn" type="button"><i data-lucide="log-out"></i></button>
    </div>

  </aside>
  <main class="main">
    <header class="topbar">
      <div><div class="eyebrow" id="screenEyebrow">Workspace</div><h1 id="screenTitle"></h1><p id="screenSub"></p></div>
      <div class="topbar-right">
        <div class="clock"><i data-lucide="clock-3"></i><span id="liveClock">00:00:00</span></div>
        <div class="system-status"><span class="pulse"></span>Staff session active</div>
        <div class="topbar-user"><span class="topbar-user-avatar" id="topbarUserAvatar">FP</span><span class="topbar-user-copy"><b id="topbarUserName">Staff</b><small id="topbarUserRole">Administrator</small></span></div>
      </div>
    </header>
    <div id="screen-fragment-root" aria-busy="true"></div>
  </main>
  <div id="modal-fragment-root"></div>
  <div class="toast hidden" id="toast"></div>
  <script src="../shared/js/workspace-loader.js?v=reports-no-graph-4"></script>
</body>
</html>
