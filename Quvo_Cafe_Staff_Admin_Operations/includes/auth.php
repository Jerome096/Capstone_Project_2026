<?php
declare(strict_types=1);
require_once __DIR__ . "/../config/database.php";

function quvo_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set("session.use_strict_mode", "1");
    ini_set("session.use_only_cookies", "1");
    session_name("quvo_staff");
    session_set_cookie_params([
        "httponly" => true,
        "secure" => !empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off",
        "samesite" => "Lax",
        "path" => "/",
    ]);
    session_start();
    header("Cache-Control: no-store");
    header("X-Content-Type-Options: nosniff");
    header("X-Frame-Options: DENY");
}

function quvo_csrf(): string
{
    quvo_start_session();
    return $_SESSION["csrf"] ??= bin2hex(random_bytes(32));
}

function quvo_json(array $data, int $status = 200): never
{
    http_response_code($status);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($data, JSON_THROW_ON_ERROR);
    exit();
}

function quvo_require_post(): void
{
    quvo_start_session();
    if ($_SERVER["REQUEST_METHOD"] !== "POST") {
        header("Allow: POST");
        quvo_json(["ok" => false, "error" => "Use POST for this action."], 405);
    }
    if (!hash_equals(quvo_csrf(), $_SERVER["HTTP_X_CSRF_TOKEN"] ?? "")) {
        quvo_json(
            [
                "ok" => false,
                "error" => "Your page has expired. Refresh it and try again.",
            ],
            403,
        );
    }
}

function quvo_home(string $role): ?string
{
    return match (strtolower($role)) {
        "admin" => "admin/index.php",
        "staff" => "cashier/index.php",
        default => null,
    };
}

function quvo_public_user(array $row): array
{
    return [
        "staff_id" => (int) $row["staff_id"],
        "username" => $row["username"],
        "full_name" => $row["full_name"],
        "role" => strtolower($row["role_name"]),
        "role_label" => $row["role_name"],
    ];
}

function quvo_current_user(): ?array
{
    quvo_start_session();
    if (empty($_SESSION["staff_id"])) {
        return null;
    }
    // Recheck active status and role on every protected request.
    if (time() - ($_SESSION["last_activity"] ?? 0) > 1800) {
        unset($_SESSION["staff_id"]);
        return null;
    }
    $query = quvo_db()->prepare(
        "SELECT s.staff_id, s.username, s.full_name, s.password_hash, r.role_name FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id = s.role_id WHERE s.staff_id = ? AND s.is_active = 1",
    );
    $query->execute([$_SESSION["staff_id"]]);
    $row = $query->fetch();
    if (
        !$row ||
        !hash_equals(
            hash("sha256", $row["password_hash"]),
            $_SESSION["credential_stamp"] ?? "",
        )
    ) {
        unset($_SESSION["staff_id"]);
        return null;
    }
    $_SESSION["last_activity"] = time();
    return quvo_public_user($row);
}

function quvo_require_workspace(array $roles): array
{
    try {
        $user = quvo_current_user();
    } catch (Throwable $error) {
        error_log("Quvo database check failed: " . $error->getMessage());
        http_response_code(503);
        exit("The database is unavailable. Please try again later.");
    }
    if (!$user) {
        header("Location: ../login/login.php");
        exit();
    }
    if (!in_array($user["role"], $roles, true)) {
        http_response_code(403);
        exit(
            'You do not have access to this workspace. <a href="../index.php">Return to your workspace</a>'
        );
    }
    return $user;
}

function quvo_bootstrap(?array $user): string
{
    return "<script>window.QUVO_SESSION=" .
        json_encode($user, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) .
        ";window.QUVO_CSRF=" .
        json_encode(quvo_csrf()) .
        ";</script>";
}
