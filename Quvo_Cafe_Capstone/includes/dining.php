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

// Background refreshes only read this clock. Only paid outstanding orders suspend expiry.
// The most recent completed order starts a fresh ten minutes without a browser heartbeat.
function dining_session_timing_sql(string $where): string
{
    return "SELECT s.session_id,s.guest_name,s.status,s.requested_at,s.reviewed_at,s.ended_at,
        s.last_activity_at,s.idle_expired_at,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.orders o JOIN dbo.payments p ON p.order_id=o.order_id
            WHERE o.session_id=s.session_id AND o.order_status NOT IN ('served','cancelled'))
            THEN 1 ELSE 0 END AS idle_paused,
        DATEDIFF(second,SYSUTCDATETIME(),DATEADD(minute,10,
            CASE WHEN finished.completed_at>COALESCE(s.last_activity_at,s.reviewed_at,s.requested_at)
                THEN finished.completed_at ELSE COALESCE(s.last_activity_at,s.reviewed_at,s.requested_at) END))
            AS idle_remaining_seconds
        FROM dbo.customer_sessions s OUTER APPLY
            (SELECT MAX(o.updated_at) AS completed_at FROM dbo.orders o
             WHERE o.session_id=s.session_id AND o.order_status='served'
             AND EXISTS (SELECT 1 FROM dbo.payments p WHERE p.order_id=o.order_id)) finished
        WHERE $where";
}

// Caller holds the table lock; payment also locks that table before it can be saved.
function dining_cancel_unpaid_orders(PDO $db, int $sessionId, ?int $actor, string $reason): void
{
    $db->prepare("UPDATE o SET order_status='cancelled',cancelled_at=SYSUTCDATETIME(),
        cancelled_by_staff_id=?,cancellation_reason=?,cancellation_source='session',
        updated_at=SYSUTCDATETIME(),updated_by_staff_id=?
        FROM dbo.orders o WHERE o.session_id=? AND o.order_status<>'cancelled'
        AND NOT EXISTS (SELECT 1 FROM dbo.payments p WHERE p.order_id=o.order_id)")
        ->execute([$actor, $reason, $actor, $sessionId]);
}

// Caller holds a transaction. Table-first locks serialize expiry, approval and ordering.
function dining_expire_table(PDO $db, int $tableId): int
{
    dining_table($db, $tableId);
    $q = $db->prepare(dining_session_timing_sql("s.table_id=? AND s.status='active'"));
    $q->execute([$tableId]);
    $sessions = $q->fetchAll();
    $expired = 0;
    foreach ($sessions as $session) {
        if (!(bool) $session['idle_paused'] && (int) $session['idle_remaining_seconds'] <= 0) {
            dining_cancel_unpaid_orders($db, (int)$session['session_id'], null,
                'Session expired after 10 minutes of inactivity without payment.');
            $db->prepare("UPDATE dbo.customer_sessions SET status='closed',ended_at=SYSUTCDATETIME(),
                idle_expired_at=SYSUTCDATETIME() WHERE session_id=? AND status='active'")
                ->execute([$session['session_id']]);
            $expired++;
        }
    }
    return $expired;
}

// Used by the minute scheduler and APIs; each table has a short independent transaction.
function dining_expire_sessions(PDO $db, ?int $tableId = null): int
{
    $tables = $tableId === null
        ? $db->query("SELECT DISTINCT table_id FROM dbo.customer_sessions WHERE status='active' ORDER BY table_id")
            ->fetchAll(PDO::FETCH_COLUMN)
        : [$tableId];
    $expired = 0;
    foreach ($tables as $id) {
        $ownsTransaction = !$db->inTransaction();
        if ($ownsTransaction) $db->beginTransaction();
        try {
            $expired += dining_expire_table($db, (int) $id);
            if ($ownsTransaction) $db->commit();
        } catch (Throwable $error) {
            if ($ownsTransaction && $db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }
    return $expired;
}

function dining_guest_activity(PDO $db, int $tableId, ?string $token): void
{
    dining_expire_table($db, $tableId);
    $session = dining_guest_session($db, $tableId, $token);
    if (!$session || $session['status'] !== 'active') {
        throw new DiningError("Your session has ended. Please request staff approval again.");
    }
    $db->prepare("UPDATE dbo.customer_sessions SET last_activity_at=SYSUTCDATETIME() WHERE session_id=?")
        ->execute([$session['session_id']]);
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
    dining_expire_table($db, (int) $tableId);
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
            ended_at=CASE WHEN ?='rejected' THEN SYSUTCDATETIME() ELSE NULL END,
            last_activity_at=SYSUTCDATETIME() WHERE session_id=?",
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
        // Paid orders must be served. Unpaid orders are cancelled as part of closing the visit.
        $q = $db->prepare("SELECT COUNT(*) FROM dbo.orders o
            JOIN dbo.payments p ON p.order_id=o.order_id
            WHERE o.session_id=? AND o.order_status NOT IN ('served','cancelled')");
        $q->execute([$id]);
        if ((int) $q->fetchColumn() > 0) {
            throw new DiningError("Serve paid outstanding orders before closing this session.");
        }
        dining_cancel_unpaid_orders($db, $id, $actor, 'Session ended by staff before payment.');
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
    $q = $db->prepare(dining_session_timing_sql("s.table_id=? AND s.guest_token_hash=CONVERT(binary(32),?,2)"));
    $q->execute([$tableId, hash("sha256", $token)]);
    return $q->fetch() ?: null;
}
function dining_guest_request(PDO $db, int $tableId, string $name, ?string $previousToken): array
{
    $table = dining_table($db, $tableId);
    dining_expire_table($db, $tableId);
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
