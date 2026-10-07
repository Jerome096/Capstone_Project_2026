<?php
declare(strict_types=1);

class AccountInputError extends RuntimeException {}

function account_text(array $input, string $key): string
{
    if (!is_string($input[$key] ?? null)) {
        throw new AccountInputError("Complete all required fields.");
    }
    return trim($input[$key]);
}

function account_username(array $input): string
{
    $username = account_text($input, "username");
    if (!preg_match("/\A[A-Za-z0-9_.-]{3,50}\z/", $username)) {
        throw new AccountInputError(
            "Username must be 3–50 letters, numbers, dots, underscores or hyphens.",
        );
    }
    return $username;
}

function account_password(array $input, bool $required): ?string
{
    $password = $input["password"] ?? "";
    if (!is_string($password)) {
        throw new AccountInputError("Enter a valid password.");
    }
    if ($password === "" && !$required) {
        return null;
    }
    if (
        strlen($password) < 12 ||
        strlen($password) > 72 ||
        str_contains($password, "\0")
    ) {
        throw new AccountInputError(
            "Use a password between 12 and 72 bytes (at least 12 characters for ordinary text).",
        );
    }
    if (
        !is_string($input["password_confirm"] ?? null) ||
        $input["password_confirm"] !== $password
    ) {
        throw new AccountInputError("The new passwords do not match.");
    }
    return password_hash($password, PASSWORD_DEFAULT);
}

function account_unique(PDO $db, string $username, int $except = 0): void
{
    $q = $db->prepare(
        "SELECT staff_id FROM dbo.staff_users WHERE username = ? AND staff_id <> ?",
    );
    $q->execute([$username, $except]);
    if ($q->fetchColumn() !== false) {
        throw new AccountInputError("That username is already in use.");
    }
}

// Called inside a transaction. Admin accounts cannot be changed through staff actions.
function account_staff(PDO $db, int $id): array
{
    $q = $db->prepare(
        "SELECT s.staff_id, s.is_active FROM dbo.staff_users s WITH (UPDLOCK, HOLDLOCK) JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.staff_id=? AND r.role_name = 'Staff'",
    );
    $q->execute([$id]);
    $row = $q->fetch();
    if (!$row) {
        throw new AccountInputError("Staff account not found. Refresh the list.");
    }
    return $row;
}

function account_list(PDO $db): array
{
    return $db
        ->query(
            "SELECT s.staff_id, s.full_name, s.username, r.role_name, s.is_active FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE r.role_name = 'Staff' ORDER BY s.is_active DESC, s.full_name, s.staff_id",
        )
        ->fetchAll();
}

function account_change(PDO $db, array $actor, array $input): array
{
    $action = $input["action"] ?? "";
    if ($action === "self") {
        $q = $db->prepare(
            "SELECT password_hash FROM dbo.staff_users WITH (UPDLOCK, HOLDLOCK) WHERE staff_id=? AND is_active=1",
        );
        $q->execute([$actor["staff_id"]]);
        $oldHash = $q->fetchColumn();
        $current = $input["current_password"] ?? null;
        if (!is_string($current) || !$oldHash || !password_verify($current, $oldHash)) {
            throw new AccountInputError("Your current password is incorrect.");
        }
        $username = account_username($input);
        $hash = account_password($input, false);
        account_unique($db, $username, $actor["staff_id"]);
        $q = $db->prepare(
            "UPDATE dbo.staff_users SET username=?, password_hash=?, updated_at=SYSUTCDATETIME() WHERE staff_id=?",
        );
        $q->execute([$username, $hash ?? $oldHash, $actor["staff_id"]]);
        return [
            "message" => "Your account has been updated.",
            "username" => $username,
            "credential_stamp" => hash("sha256", $hash ?? $oldHash),
        ];
    }
    if (!in_array($action, ["create", "update", "status"], true)) {
        throw new AccountInputError("Unknown account action.");
    }
    $id = filter_var($input["staff_id"] ?? 0, FILTER_VALIDATE_INT);
    if ($action !== "create") {
        if (!$id || $id < 1 || $id === (int) $actor["staff_id"]) {
            throw new AccountInputError("Choose a staff account.");
        }
        account_staff($db, $id);
    }
    if ($action === "status") {
        if (!is_bool($input["active"] ?? null)) {
            throw new AccountInputError("Choose an account status.");
        }
        $q = $db->prepare(
            "UPDATE dbo.staff_users SET is_active=?, updated_at=SYSUTCDATETIME() WHERE staff_id=?",
        );
        $q->execute([$input["active"] ? 1 : 0, $id]);
        return [
            "message" => $input["active"]
                ? "Staff account reactivated."
                : "Staff account deactivated.",
        ];
    }
    $name = account_text($input, "full_name");
    if (
        $name === "" ||
        !preg_match("//u", $name) ||
        preg_match_all("/./us", $name) > 100
    ) {
        throw new AccountInputError("Enter a full name of 1–100 characters.");
    }
    $username = account_username($input);
    $role = "Staff"; // Server-assigned; client input cannot grant Admin access.
    $q = $db->prepare("SELECT role_id FROM dbo.roles WHERE role_name=?");
    $q->execute([$role]);
    $roleId = $q->fetchColumn();
    if ($roleId === false) {
        throw new AccountInputError("This role is not configured in the database.");
    }
    $hash = account_password($input, $action === "create");
    account_unique($db, $username, $action === "create" ? 0 : $id);
    if ($action === "create") {
        $q = $db->prepare(
            "INSERT INTO dbo.staff_users (role_id, full_name, username, password_hash) VALUES (?, ?, ?, ?)",
        );
        $q->execute([$roleId, $name, $username, $hash]);
        return ["message" => "Staff account created."];
    }
    $sql =
        "UPDATE dbo.staff_users SET role_id=?, full_name=?, username=?, updated_at=SYSUTCDATETIME()";
    $values = [$roleId, $name, $username];
    if ($hash !== null) {
        $sql .= ", password_hash=?";
        $values[] = $hash;
    }
    $values[] = $id;
    $db->prepare($sql . " WHERE staff_id=?")->execute($values);
    return [
        "message" => $hash
            ? "Staff account updated and password reset."
            : "Staff account updated.",
    ];
}
