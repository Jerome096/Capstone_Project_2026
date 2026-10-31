<?php
require_once __DIR__.'/../includes/auth.php';
$user=quvo_require_workspace(['admin']);
if (empty($_SESSION['admin_confirmed'])) {header('Location: index.php');exit;}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quvo Café | Payment QR codes</title>
  <link rel="stylesheet" href="../shared/css/quvo-design-system.css" />
  <link rel="stylesheet" href="payment-qr.css" />
  <?php echo quvo_bootstrap($user); ?>
  <link rel="stylesheet" href="../shared/css/workspace-cafe.css?v=reports-no-graph-4" />
</head>
<body class="quvo-cafe-ui">
  <main class="payment-qr-admin">
    <a class="qr-back-link" href="index.php">← Admin workspace</a>
    <header class="qr-page-heading">
      <p class="eyebrow">Online ordering</p><h1>Payment QR codes</h1>
      <p>Manage payment methods and the QR codes customers use at checkout.</p>
    </header>
    <div class="qr-admin-help"><strong>Before you save</strong><span>Use the café's payment QR and check its recipient. Each method becomes available at checkout once its image is saved.</span></div>
    <div id="paymentQrAdminNotice" role="status"></div>
    <div class="qr-method-toolbar"><p>Removing a method hides it from new checkouts. Existing orders and receipts are kept.</p><button type="button" id="addPaymentMethodOpen">+ Add payment method</button></div>
    <div class="payment-qr-grid" id="paymentMethodCards"></div>
    <template id="paymentMethodCardTemplate">
      <form class="payment-qr-card" data-method="">
        <div class="qr-card-heading"><h2></h2><span class="qr-state">Loading…</span></div>
        <div class="qr-image-frame">
          <img class="qr-preview" alt="Payment QR" hidden />
          <div class="qr-empty">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v6h-6v-2M12 3v3M3 12h3M12 12h3M12 18v3"/></svg>
            <strong>No QR code yet</strong><span>Upload an image to enable this method.</span>
          </div>
        </div>
        <div class="qr-upload-heading"><strong>Upload QR image</strong><span>Image · Up to 2 MB</span></div>
        <label class="qr-file-control">
          <span class="qr-file-button">Choose image</span><span class="qr-file-name">No image selected</span>
          <input name="image" type="file" accept="image/*,.heic,.heif" required aria-label="Choose QR image" />
        </label>
        <button class="qr-clear-file" type="button" data-action="clear_file" hidden>Clear selected image</button>
        <button type="submit">Save QR code</button>
        <div class="qr-remove-actions"><button class="qr-secondary-button" type="button" data-action="remove_qr" hidden>Remove QR image</button><button class="qr-danger-button" type="button" data-action="remove_method">Remove method</button></div>
      </form>
    </template>
    <dialog id="addPaymentMethodModal" class="qr-add-modal" aria-labelledby="addPaymentMethodTitle">
      <form method="dialog"><button class="qr-modal-close" aria-label="Close">×</button></form>
      <p class="eyebrow">Online checkout</p><h2 id="addPaymentMethodTitle">Add payment method</h2>
      <p>Add a payment option, then upload its QR image to make it available to customers.</p>
      <form id="addPaymentMethodForm">
        <label for="paymentMethodName">Payment method name</label>
        <input id="paymentMethodName" name="display_name" maxlength="50" placeholder="e.g. Bank transfer" required />
        <p id="addPaymentMethodError" role="alert"></p>
        <button type="submit">Add method</button>
      </form>
    </dialog>
  </main>
  <script src="../online/shared/image-upload.js"></script>
  <script src="payment-methods.js"></script>
</body>
</html>
