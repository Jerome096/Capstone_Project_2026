<?php
declare(strict_types=1);
require_once __DIR__ . "/../../includes/auth.php";
quvo_require_post();
require_once __DIR__.'/../../includes/orders.php';
try {
    $db=quvo_db();$db->beginTransaction();
    ordering_release_session($db,hash('sha256',session_id()));
    $db->commit();
} catch(Throwable $error) {
    if(isset($db)&&$db->inTransaction())$db->rollBack();
    error_log('Ordering workspace logout cleanup failed: '.$error->getMessage());
    // Authentication still ends. An unrenewed lease expires within 90 seconds.
}
$_SESSION = [];
$cookie = session_get_cookie_params();
setcookie(session_name(), "", [
    "expires" => time() - 3600,
    "path" => $cookie["path"],
    "secure" => $cookie["secure"],
    "httponly" => true,
    "samesite" => "Lax",
]);
session_destroy();
quvo_json(["ok" => true]);
