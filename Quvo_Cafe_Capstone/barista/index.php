<?php
// Retired workspace: the cashier handles drink preparation.
header("Cache-Control: no-store");
header("Location: ../cashier/index.php?screen=orders", true, 302);
exit;
