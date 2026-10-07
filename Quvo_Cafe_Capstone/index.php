<?php
declare(strict_types=1);
require_once __DIR__ . "/includes/auth.php";
try {
    $user = quvo_current_user();
    $target = $user ? quvo_home($user["role"]) : null;
    header("Location: " . ($target ?? "login/login.php"));
} catch (Throwable $error) {
    error_log("Quvo routing failed: " . $error->getMessage());
    http_response_code(503);
    echo "The database is unavailable. Please try again later.";
}
