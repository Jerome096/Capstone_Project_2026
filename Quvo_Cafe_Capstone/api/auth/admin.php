<?php
declare(strict_types=1);
require_once __DIR__ . "/../../includes/auth.php";
quvo_require_post();

try {
    $user = quvo_current_user();
    if (!$user) {
        quvo_json(
            ["ok" => false, "error" => "Your session has ended. Please sign in again."],
            401,
        );
    }
    if ($user["role"] !== "admin") {
        quvo_json(
            [
                "ok" => false,
                "error" =>
                    "This action requires an Admin account. Your current account does not have access.",
            ],
            403,
        );
    }
    quvo_json(["ok" => true]);
} catch (Throwable $error) {
    error_log("Quvo Admin access check failed: " . $error->getMessage());
    quvo_json(
        [
            "ok" => false,
            "error" => "Cannot verify Admin access right now. Please try again.",
        ],
        503,
    );
}
