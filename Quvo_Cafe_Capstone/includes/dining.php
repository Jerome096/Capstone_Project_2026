<?php
declare(strict_types=1);
// Dining records are updated in place so customer names and visit history survive table changes.
final class DiningError extends RuntimeException {}
function dining_text(array $input, string $key, int $max): string
{
    $value = trim(is_string($input[$key] ?? null) ? $input[$key] : "");
    if (
        $value === "" ||
        preg_match("//u", $value) !== 1 ||
        preg_match_all("/./us", $value) > $max
    ) {
        throw new DiningError("Please enter a valid $key.");
    }
    return $value;
}
function dining_table(PDO $db, int $id): array
{
    // Every mutation locks the table first to serialize approval, closure and deactivation.
    $q = $db->prepare("SELECT * FROM dbo.cafe_tables WITH (UPDLOCK, HOLDLOCK) WHERE table_id=?");
    $q->execute([$id]);
    return $q->fetch() ?: throw new DiningError("Table not found.");
}
function dining_change_session(PDO $db, int $actor, int $id, string $action): void
{
    $q = $db->prepare("SELECT table_id FROM dbo.customer_sessions WHERE session_id=?");
    $q->execute([$id]);
    $tableId = $q->fetchColumn();
    if (!$tableId) {
        throw new DiningError("Session not found.");
    }
    $table = dining_table($db, (int) $tableId);
    $q = $db->prepare(
        "SELECT status FROM dbo.customer_sessions WITH (UPDLOCK,HOLDLOCK) WHERE session_id=?",
    );
    $q->execute([$id]);
    $status = $q->fetchColumn();
    if (in_array($action, ["approve", "reject"], true)) {
        if ($status !== "pending") {
            throw new DiningError("This request has already been reviewed. Refresh the list.");
        }
        if ($action === "approve") {
            if (!(bool) $table["is_active"]) {
                throw new DiningError("This table is inactive.");
            }
            $q = $db->prepare(
                "SELECT COUNT(*) FROM dbo.customer_sessions WHERE table_id=? AND status='active'",
            );
            $q->execute([$tableId]);
            if ((int) $q->fetchColumn() > 0) {
                throw new DiningError("This table already has an active customer group.");
            }
        }
        $db->prepare(
            "UPDATE dbo.customer_sessions SET status=?,reviewed_by_staff_id=?,reviewed_at=SYSUTCDATETIME(),
            ended_at=CASE WHEN ?='rejected' THEN SYSUTCDATETIME() ELSE NULL END WHERE session_id=?",
        )->execute([
            $action === "approve" ? "active" : "rejected",
            $actor,
            $action === "approve" ? "active" : "rejected",
            $id,
        ]);
    } elseif ($action === "close") {
        if ($status !== "active") {
            throw new DiningError("Only an active session can be closed.");
        }
        // Keep the visit open until every order is either paid and served or cancelled.
        $q = $db->prepare("SELECT COUNT(*) FROM dbo.orders o
            LEFT JOIN dbo.payments p ON p.order_id=o.order_id
            WHERE o.session_id=? AND o.order_status<>'cancelled'
            AND (o.order_status<>'served' OR p.payment_id IS NULL)");
        $q->execute([$id]);
        if ((int) $q->fetchColumn() > 0) {
            throw new DiningError("Settle and serve outstanding orders before closing this session.");
        }
        $db->prepare(
            "UPDATE dbo.customer_sessions SET status='closed',ended_by_staff_id=?,ended_at=SYSUTCDATETIME() WHERE session_id=?",
        )->execute([$actor, $id]);
    } else {
        throw new DiningError("Unknown session action.");
    }
}
function dining_guest_session(PDO $db, int $tableId, ?string $token): ?array
{
    if (!$token) {
        return null;
    }
    $q = $db->prepare("SELECT session_id,guest_name,status,requested_at,reviewed_at,ended_at FROM dbo.customer_sessions
        WHERE table_id=? AND guest_token_hash=CONVERT(binary(32),?,2)");
    $q->execute([$tableId, hash("sha256", $token)]);
    return $q->fetch() ?: null;
}
function dining_guest_request(PDO $db, int $tableId, string $name, ?string $previousToken): array
{
    $table = dining_table($db, $tableId);
    if (!(bool) $table["is_active"]) {
        throw new DiningError("This table is not accepting requests.");
    }
    $existing = dining_guest_session($db, $tableId, $previousToken);
    if ($existing && in_array($existing["status"], ["pending", "active"], true)) {
        return [$existing, $previousToken];
    }
    $q = $db->prepare(
        "SELECT COUNT(*) FROM dbo.customer_sessions WHERE table_id=? AND status='active'",
    );
    $q->execute([$tableId]);
    if ((int) $q->fetchColumn() > 0) {
        throw new DiningError("This table is already in use. Please ask a staff member.");
    }
    // The secret stays in the PHP session; only its SHA-256 hash is stored with the visit.
    $token = bin2hex(random_bytes(32));
    $q = $db->prepare("INSERT INTO dbo.customer_sessions(table_id,guest_name,guest_token_hash)
        VALUES(?,?,CONVERT(binary(32),?,2))");
    $q->execute([$tableId, $name, hash("sha256", $token)]);
    return [dining_guest_session($db, $tableId, $token), $token];
}
function dining_guest_cancel(PDO $db, int $tableId, ?string $token): void
{
    dining_table($db, $tableId);
    $session = dining_guest_session($db, $tableId, $token);
    if (!$session || $session["status"] !== "pending") {
        throw new DiningError("Only your own pending request can be cancelled.");
    }
    $db->prepare(
        "UPDATE dbo.customer_sessions SET status='cancelled',ended_at=SYSUTCDATETIME() WHERE session_id=?",
    )->execute([$session["session_id"]]);
}
