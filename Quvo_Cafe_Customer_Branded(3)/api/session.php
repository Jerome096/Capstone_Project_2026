<?php
declare(strict_types=1);
require_once __DIR__ . "/../../Quvo_Cafe_Capstone/includes/guest.php";
$csrf = quvo_start_guest_session();
$db = null;
try {
    $method = $_SERVER["REQUEST_METHOD"];
    if (!in_array($method, ["GET", "POST"], true)) {
        quvo_json(["ok" => false, "error" => "Unsupported request."], 405);
    }
    $code = trim(is_string($_GET["table"] ?? null) ? $_GET["table"] : "");
    if (!preg_match("/\A[A-Za-z0-9-]{1,20}\z/", $code)) {
        throw new DiningError("Please scan a valid table QR code.");
    }
    $db = quvo_db();
    $q = $db->prepare(
        "SELECT table_id,table_code,table_name,is_active FROM dbo.cafe_tables WHERE table_code=?",
    );
    $q->execute([$code]);
    $table = $q->fetch();
    if (!$table) {
        quvo_json(
            ["ok" => false, "error" => "This table is not registered. Please ask a staff member."],
            404,
        );
    }
    $id = (int) $table["table_id"];
    $token = $_SESSION["tables"][$id] ?? null;
    if ($method === "POST") {
        if (!hash_equals($csrf, $_SERVER["HTTP_X_CSRF_TOKEN"] ?? "")) {
            quvo_json(["ok" => false, "error" => "Refresh this page and try again."], 403);
        }
        $input = json_decode(file_get_contents("php://input"), true);
        if (!is_array($input)) {
            throw new DiningError("Invalid request.");
        }
        $db->beginTransaction();
        if (($input["action"] ?? "") === "request") {
            $name = dining_text($input, "name", 100);
            $current = dining_guest_session($db, $id, $token);
            if (
                (!$current || !in_array($current["status"], ["pending", "active"], true)) &&
                time() - ($_SESSION["last_request"] ?? 0) < 15
            ) {
                throw new DiningError("Please wait a moment before sending another request.");
            }
            [$session, $token] = dining_guest_request($db, $id, $name, $token);
        } elseif (($input["action"] ?? "") === "cancel") {
            dining_guest_cancel($db, $id, $token);
        } else {
            throw new DiningError("Unknown session action.");
        }
        $db->commit();
        if (($input["action"] ?? "") === "request") {
            $_SESSION["tables"][$id] = $token;
            $_SESSION["last_request"] = time();
        }
    }
    $session = dining_guest_session($db, $id, $token);
    if (($_GET["view"] ?? "") === "menu") {
        // Protected customer data is returned only after the database confirms staff approval.
        if (!(bool) $table["is_active"] || !$session || $session["status"] !== "active") {
            quvo_json(["ok" => false, "error" => "An approved session is required."], 403);
        }
        $items = $db
            ->query(
                "SELECT menu_item_id AS id,item_name AS name,category,price FROM dbo.menu_items WHERE is_available=1 ORDER BY item_name",
            )
            ->fetchAll();
        foreach ($items as &$item) {
            $item["id"] = (string) $item["id"];
            $item["price"] = (float) $item["price"];
            $item["description"] = "";
            $item["icon"] = "☕";
        }
        unset($item);
        quvo_json(["ok" => true, "items" => $items]);
    }
    quvo_json([
        "ok" => true,
        "csrf" => $csrf,
        "table" => [
            "code" => $table["table_code"],
            "name" => $table["table_name"],
            "active" => (bool) $table["is_active"],
        ],
        "session" => $session,
    ]);
} catch (Throwable $error) {
    if ($db && $db->inTransaction()) {
        $db->rollBack();
    }
    if ($error instanceof DiningError) {
        quvo_json(["ok" => false, "error" => $error->getMessage()], 422);
    }
    error_log("Guest session failed: " . $error->getMessage());
    quvo_json(
        ["ok" => false, "error" => "The session service is unavailable. Please try again."],
        503,
    );
}
