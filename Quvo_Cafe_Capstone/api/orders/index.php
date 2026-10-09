<?php
declare(strict_types=1);
require_once __DIR__ . "/../../includes/auth.php";
require_once __DIR__ . "/../../includes/orders.php";
$db = null;
try {
    $actor = quvo_current_user();
    if (!$actor) {
        throw new OrderError("Please sign in again.", 401);
    }
    if (!in_array($actor["role"], ["admin", "staff"], true)) {
        throw new OrderError("Access denied.", 403);
    }
    $method = $_SERVER["REQUEST_METHOD"];
    if (!in_array($method, ["GET", "POST"], true)) {
        header("Allow: GET, POST");
        throw new OrderError("Unsupported request.", 405);
    }
    $db = quvo_db();
    dining_expire_sessions($db);
    if ($method === "GET") {
        if (isset($_GET["id"])) {
            quvo_json(["ok" => true, "order" => orders_get($db, orders_id($_GET["id"]))]);
        }
        quvo_json(["ok" => true] + orders_list($db, null, $_GET["status"] ?? "open", $_GET["offset"] ?? "0"));
    }
    quvo_require_post();
    $input = orders_input();
    $id = orders_id($input["id"] ?? null);
    $db->beginTransaction();
    $result = match ($input["action"] ?? "") {
        "pay" => orders_pay($db, $actor["staff_id"], $id, $input),
        "status" => ["order" => orders_status($db, $actor["staff_id"], $id, $input["status"] ?? null)],
        "cancel" => ["order" => orders_cancel($db, $actor, $id, $input["reason"] ?? null)],
        default => throw new OrderError("Unknown order action."),
    };
    $db->commit();
    quvo_json(["ok" => true] + $result);
} catch (Throwable $error) {
    orders_error($db, $error);
}
