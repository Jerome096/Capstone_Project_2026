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
            ["ok" => false, "error" => "Only an Admin account can enter this workspace."],
            403,
        );
    }
    if (($_SESSION["admin_retry_after"] ?? 0) > time()) {
        quvo_json(
            [
                "ok" => false,
                "error" => "Too many attempts. Please wait one minute and try again.",
            ],
            429,
        );
    }
    $input = json_decode(file_get_contents("php://input"), true);
    $password = is_array($input) ? $input["password"] ?? null : null;
    if (!is_string($password) || $password === "" || strlen($password) > 4096) {
        quvo_json(["ok" => false, "error" => "Enter your Admin password."], 400);
    }
    $query = quvo_db()->prepare(
        "SELECT password_hash FROM dbo.staff_users WHERE staff_id = ? AND is_active = 1",
    );
    $query->execute([$user["staff_id"]]);
    $hash = $query->fetchColumn();
    if (!$hash || !password_verify($password, $hash)) {
        unset($_SESSION["admin_confirmed"]);
        $_SESSION["admin_failures"] = ($_SESSION["admin_failures"] ?? 0) + 1;
        if ($_SESSION["admin_failures"] >= 5) {
            $_SESSION["admin_retry_after"] = time() + 60;
            $_SESSION["admin_failures"] = 0;
        }
        quvo_json(
            ["ok" => false, "error" => "Incorrect password. Please try again."],
            401,
        );
    }
    session_regenerate_id(true);
    $_SESSION["admin_confirmed"] = true;
    unset($_SESSION["admin_failures"], $_SESSION["admin_retry_after"]);
    quvo_json(["ok" => true]);
} catch (Throwable $error) {
    error_log("Quvo Admin confirmation failed: " . $error->getMessage());
    quvo_json(
        [
            "ok" => false,
            "error" => "Cannot verify your password right now. Please try again.",
        ],
        503,
    );
}
