<?php
declare(strict_types=1);
require_once __DIR__ . "/auth.php";
require_once __DIR__ . "/dining.php";

// Both customer endpoints share the same browser-bound guest cookie and CSRF token.
function quvo_start_guest_session(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        ini_set("session.use_strict_mode", "1");
        ini_set("session.use_only_cookies", "1");
        session_name("quvo_guest");
        session_set_cookie_params([
            "httponly" => true,
            "secure" => !empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off",
            "samesite" => "Lax",
            "path" => "/",
        ]);
        session_start();
    }
    header("Cache-Control: no-store");
    header("X-Content-Type-Options: nosniff");
    return $_SESSION["csrf"] ??= bin2hex(random_bytes(32));
}
