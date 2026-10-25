<?php
declare(strict_types=1);
require_once __DIR__ . "/../../includes/auth.php";
quvo_require_post();
require_once __DIR__.'/../../includes/orders.php';
try {
    $actor=quvo_current_user();
    if($actor&&in_array($actor['role'],['staff','admin'],true)) {
        $db=quvo_db();$db->beginTransaction();
        ordering_release_session($db,hash('sha256',session_id()));
        $db->commit();
    }
} catch(Throwable $error) {
    if(isset($db)&&$db->inTransaction())$db->rollBack();
    error_log('Ordering workspace logout cleanup failed: '.$error->getMessage());
    // Keep the session available to retry instead of reporting a successful
    // logout without its server-side timer being saved.
    quvo_json(['ok'=>false,'error'=>'Could not save the logout timer. Please try logging out again.'],503);
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
