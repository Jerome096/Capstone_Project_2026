<?php
declare(strict_types=1);
require_once __DIR__ . "/../../includes/auth.php";
quvo_require_post();
$input = json_decode(file_get_contents("php://input"), true);
if (
    !is_array($input) ||
    !is_string($input["username"] ?? null) ||
    !is_string($input["password"] ?? null)
) {
    quvo_json(["ok" => false, "error" => "Enter your username and password."], 400);
}
$access = $input["access"] ?? null;
if (!is_string($access) || !in_array($access, ["staff", "admin"], true)) {
    quvo_json(["ok" => false, "error" => "Select Staff or Admin access."], 400);
}
$username = trim($input["username"]);
$password = $input["password"];
if (
    $username === "" ||
    strlen($username) > 50 ||
    $password === "" ||
    strlen($password) > 4096
) {
    quvo_json(["ok" => false, "error" => "Enter a valid username and password."], 400);
}
try {
    $query = quvo_db()->prepare(
        "SELECT s.staff_id, s.username, s.full_name, s.password_hash, s.is_active, r.role_name FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id = s.role_id WHERE s.username = ?",
    );
    $query->execute([$username]);
    $row = $query->fetch();
    // Use the same public error for unknown, inactive and incorrect accounts.
    $valid = password_verify(
        $password,
        $row["password_hash"] ??
            '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
    );
    if (!$row || !$valid || !(bool) $row["is_active"]) {
        quvo_json(
            [
                "ok" => false,
                "error" => "Please check your password and account name and try again.",
            ],
            401,
        );
    }
    // Validate access BEFORE creating a session; browser choices never grant a role.
    $role = strtolower($row["role_name"]);
    $allowed = $access === "admin" ? $role === "admin" : $role === "staff";
    if (!$allowed) {
        quvo_json(
            [
                "ok" => false,
                "error" => "Please check your password and account name and try again.",
            ],
            401,
        );
    }
    $home = quvo_home($row["role_name"]);
    if ($home === null) {
        quvo_json(
            [
                "ok" => false,
                "error" =>
                    "Your workspace is not available yet. Please contact your administrator.",
            ],
            403,
        );
    }
    session_regenerate_id(true);
    $_SESSION = [
        "staff_id" => (int) $row["staff_id"],
        "last_activity" => time(),
        "credential_stamp" => hash("sha256", $row["password_hash"]),
        "admin_confirmed" => strtolower($row["role_name"]) === "admin",
    ];
    quvo_json(["ok" => true, "redirect" => "../../" . $home]);
} catch (Throwable $error) {
    error_log("Quvo login failed: " . $error->getMessage());
    quvo_json(
        [
            "ok" => false,
            "error" =>
                "Cannot connect to the database right now. Please try again later.",
        ],
        503,
    );
}
