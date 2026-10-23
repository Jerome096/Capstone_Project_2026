<?php
require_once __DIR__ . "/../includes/auth.php";
$user = quvo_require_workspace(["admin", "staff"]);
unset($_SESSION["admin_confirmed"]);
$_SESSION["operations_portal"] = "cashier";
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quvo Caf&eacute; | Cashier Operations</title>
  <link rel="icon" type="image/png" href="../shared/images/quvo-favicon.png" />
  <link rel="stylesheet" href="../shared/css/styles.css?v=no-barista-1" />
  <link rel="stylesheet" href="../shared/css/quvo-design-system.css" />
  <link rel="stylesheet" href="../shared/css/quvo-shell.css?v=no-barista-1" />
  <link rel="stylesheet" href="../shared/css/portal.css" />
  <link rel="stylesheet" href="../cashier/dashboard/dashboard.css" />
  <link rel="stylesheet" href="../cashier/menu/menu.css" />
  <link rel="stylesheet" href="../cashier/sessions/sessions.css" />
  <link rel="stylesheet" href="../cashier/orders/orders.css?v=food-ready-1" />
  <link rel="stylesheet" href="../cashier/receipts/receipts.css?v=pos-buttons-2" />
  <link rel="stylesheet" href="../cashier/alerts/alerts.css" />
  <link rel="stylesheet" href="../admin/reports/reports.css?v=report-periods-1" />
  <link rel="stylesheet" href="../admin/menu-management/menu-management.css?v=menu-photos-options-1" />
  <link rel="stylesheet" href="../admin/records/records.css" />
  <link rel="stylesheet" href="../admin/sales-history/sales-history.css?v=inventory-save-2" />
  <link rel="stylesheet" href="../admin/accounts/accounts.css" />
  <link rel="stylesheet" href="../admin/inventory/inventory.css?v=inventory-save-2" />
  <link rel="stylesheet" href="../shared/css/workspace-tablet.css?v=tablet-payment-alerts-2" />
  <link rel="stylesheet" href="../shared/css/workspace-loading.css?v=centered-spinner-1" />
  <link rel="stylesheet" href="../shared/css/menu-options.css?v=menu-photos-options-1" />
  <link rel="stylesheet" href="../shared/css/ordering-control.css?v=ordering-confirmation-1" />
  <script src="https://unpkg.com/lucide@latest"></script>
  <?php echo quvo_bootstrap($user); ?>
<script src="../shared/js/auth.js"></script>
  <script>
    window.QUVO_CONFIG = {
      base: "../",
      portal: "cashier",
      initialScreen: "dashboard",
      allowedScreens: ["dashboard", "menu", "sessions", "orders", "receipts", "alerts"],
      allowedRoles: ["admin", "staff"],
      roleLabel: "Staff",
      loginUrl: "../login/login.php",
      standaloneWorkspace: true
    };
    window.QUVO_SESSION = QUVO_AUTH.requireAuth({
      allowedRoles: window.QUVO_CONFIG.allowedRoles,
      loginUrl: window.QUVO_CONFIG.loginUrl
    });
  </script>
</head>
<body class="logged-in workspace-loading">
  <div class="workspace-loading-screen" id="workspaceLoading" role="status" aria-label="Loading workspace">
    <span class="workspace-spinner" aria-hidden="true"></span>
    <p>Preparing workspace</p>
  </div>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark brand-mark-image"><img alt="Quvo Caf&eacute; logo" class="sidebar-logo-img" src="../shared/images/quvo-logo.jpg" /></div>
      <div class="brand-name">Quvo Caf&eacute;</div>
      <div class="brand-sub">Cashier Operations</div>
    </div>
    <nav class="nav">

<div class="nav-section-label nav-section-label-first">Operations</div>
<button class="nav-item active" data-screen="dashboard"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></button>
<button class="nav-item" data-screen="menu"><i data-lucide="utensils"></i><span>Menu</span></button>
<button class="nav-item" data-screen="sessions"><i data-lucide="users"></i><span>Sessions</span><span class="nav-badge" id="sidebarSessionCount" title="Sessions awaiting approval">0</span></button>
<button class="nav-item" data-screen="orders"><i data-lucide="clipboard-list"></i><span>Orders</span><span class="nav-badge" id="sidebarOrderCount" title="Orders awaiting payment collection or approval">0</span></button>
<button class="nav-item" data-screen="receipts"><i data-lucide="receipt-text"></i><span>Receipts</span></button>
<button class="nav-item" data-screen="alerts"><i data-lucide="bell"></i><span>Alerts</span><span class="nav-badge" id="sidebarAlertCount">0</span></button>
<div class="nav-divider"></div>
<div class="nav-section-label">Other workspaces</div>
<a class="nav-item portal-link" href="../admin/index.php"><i data-lucide="shield-check"></i><span>Admin</span><i class="portal-arrow" data-lucide="arrow-up-right"></i></a>

      <div class="admin-mode-indicator" id="adminModeIndicator" style="display:none">Locked</div>
    </nav>
    <div class="staff-session-card">
      <div class="staff-session-avatar" id="staffAvatar">FP</div>
      <div class="staff-session-copy"><strong id="staffSessionName">Staff</strong><span id="staffSessionRole">Staff</span></div>
      <button aria-label="Log out" class="staff-logout-button" id="logoutBtn" type="button"><i data-lucide="log-out"></i></button>
    </div>
    <div class="eod-panel"><button class="eod-button" id="openEodBtn"><i data-lucide="calendar-check-2"></i><span>End of day</span></button></div>
  </aside>
  <main class="main">
    <header class="topbar">
      <div><div class="eyebrow" id="screenEyebrow">Workspace</div><h1 id="screenTitle"></h1><p id="screenSub"></p></div>
      <div class="topbar-right">
        <div class="clock"><i data-lucide="clock-3"></i><span id="liveClock">00:00:00</span></div>
        <div class="system-status"><span class="pulse"></span>Staff session active</div>
        <div class="topbar-user"><span class="topbar-user-avatar" id="topbarUserAvatar">FP</span><span class="topbar-user-copy"><b id="topbarUserName">Staff</b><small id="topbarUserRole">Staff</small></span></div>
      </div>
    </header>
    <div id="screen-fragment-root" aria-busy="true"></div>
  </main>
  <div id="modal-fragment-root"></div>
  <div class="toast hidden" id="toast"></div>
  <script src="../shared/js/workspace-loader.js?v=no-barista-1"></script>
</body>
</html>
