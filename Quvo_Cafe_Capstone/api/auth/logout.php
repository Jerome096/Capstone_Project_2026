<?php
declare(strict_types=1);
require_once __DIR__ . "/../../includes/auth.php";
quvo_require_post();
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
