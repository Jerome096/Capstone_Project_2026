<?php
declare(strict_types=1);
require_once __DIR__ . "/../../includes/auth.php";
require_once __DIR__ . "/../../includes/dining.php";
// Signed-in staff review table requests; every change is protected by CSRF and a SQL transaction.
$db = null;
try {
    $actor = quvo_current_user();
    if (!$actor) {
        quvo_json(["ok" => false, "error" => "Please sign in again."], 401);
    }
    if (!in_array($actor["role"], ["admin", "staff"], true)) {
        quvo_json(["ok" => false, "error" => "Access denied."], 403);
    }
    $resource = $_GET["resource"] ?? "sessions";
    $method = $_SERVER["REQUEST_METHOD"];
    if (!in_array($method, ["GET", "POST"], true)) {
        quvo_json(["ok" => false, "error" => "Unsupported request."], 405);
    }
    if ($resource !== "sessions") {
        quvo_json(["ok" => false, "error" => "Unknown session resource."], 404);
    }
    $db = quvo_db();
    dining_expire_sessions($db);
    if ($method === "POST") {
        quvo_require_post();
        $input = json_decode(file_get_contents("php://input"), true);
        if (!is_array($input)) {
            throw new DiningError("Invalid request.");
        }
        $db->beginTransaction();
        if ($resource === "sessions") {
            dining_change_session(
                $db,
                $actor["staff_id"],
                (int) ($input["id"] ?? 0),
                (string) ($input["action"] ?? ""),
            );
        } else {
            throw new DiningError("Unknown action.");
        }
        $db->commit();
        quvo_json(["ok" => true]);
    }
    $offset = max(0, (int) ($_GET["offset"] ?? 0));
    if ($resource !== "sessions") {
        throw new DiningError("Unknown list.");
    }
    $status = $_GET["status"] ?? "open";
    if (
        !in_array(
            $status,
            ["open", "all", "pending", "active", "closed", "rejected", "cancelled"],
            true,
        )
    ) {
        throw new DiningError("Invalid status.");
    }
    $rows = dining_staff_sessions($db, $status, $offset);
    $counts = $db
        ->query("SELECT status,COUNT(*) AS total FROM dbo.customer_sessions GROUP BY status")
        ->fetchAll();
    quvo_json(["ok" => true, "sessions" => $rows, "counts" => $counts]);
} catch (Throwable $error) {
    if ($db && $db->inTransaction()) {
        $db->rollBack();
    }
    if ($error instanceof DiningError) {
        quvo_json(["ok" => false, "error" => $error->getMessage()], 422);
    }
    if (
        $error instanceof PDOException &&
        in_array((int) ($error->errorInfo[1] ?? 0), [2601, 2627], true)
    ) {
        quvo_json(
            [
                "ok" => false,
                "error" => "This table already has an active session. Refresh and try again.",
            ],
            409,
        );
    }
    error_log("Dining request failed: " . $error->getMessage());
    quvo_json(
        ["ok" => false, "error" => "Could not load or save dining data. Please try again."],
        503,
    );
}
