<?php
declare(strict_types=1);
require_once __DIR__ . "/dining.php";

// Business errors are safe to show without exposing database or guest-token details.
final class OrderError extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422, public readonly string $errorCode = "")
    {
        parent::__construct($message);
    }
}

function orders_text(mixed $value, int $max, bool $required = false): string
{
    if (!is_string($value) || str_contains($value, "\0") || preg_match("//u", $value) !== 1) {
        throw new OrderError("Enter valid text.");
    }
    $value = trim($value);
    if (strlen(iconv("UTF-8", "UTF-16LE", $value)) / 2 > $max || ($required && $value === "")) {
        throw new OrderError("Text is missing or exceeds the allowed length.");
    }
    return $value;
}

function orders_id(mixed $value): int
{
    if ((!is_string($value) && !is_int($value)) || !preg_match('/\A[1-9][0-9]*\z/', (string) $value)) {
        throw new OrderError("Invalid record ID.");
    }
    $id = filter_var($value, FILTER_VALIDATE_INT, ["options" => ["min_range" => 1]]);
    return $id !== false ? $id : throw new OrderError("Invalid record ID.");
}

// Monetary values use integer centavos internally and decimal strings at the API boundary.
function orders_cents(mixed $value): int
{
    // PDO_SQLSRV can return decimal values below one without a leading zero.
    if (is_string($value) && preg_match('/\\A\\.[0-9]{1,2}\\z/', $value)) {
        $value = "0" . $value;
    }
    if ((!is_string($value) && !is_int($value))
        || !preg_match('/\A([0-9]{1,10})(?:\.([0-9]{1,2}))?\z/', (string) $value, $parts)) {
        throw new OrderError("Enter an amount with at most two decimal places.");
    }
    return (int) $parts[1] * 100 + (int) str_pad($parts[2] ?? "", 2, "0");
}

function orders_money(int $cents): string
{
    return intdiv($cents, 100) . "." . str_pad((string) ($cents % 100), 2, "0", STR_PAD_LEFT);
}

function orders_input(): array
{
    $raw = file_get_contents("php://input", false, null, 0, 65537);
    if ($raw === false || strlen($raw) > 65536) {
        throw new OrderError("Order request is too large.", 413);
    }
    try {
        $input = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new OrderError("Invalid JSON request.", 400);
    }
    if (!is_array($input) || array_is_list($input)) {
        throw new OrderError("Send a JSON object.", 400);
    }
    return $input;
}

function orders_lines(mixed $items): array
{
    if (!is_array($items) || !array_is_list($items) || count($items) < 1 || count($items) > 50) {
        throw new OrderError("Submit between 1 and 50 order lines.");
    }
    $lines = [];
    foreach ($items as $item) {
        if (!is_array($item) || !is_int($item["quantity"] ?? null)
            || $item["quantity"] < 1 || $item["quantity"] > 999) {
            throw new OrderError("Each quantity must be a whole number from 1 to 999.");
        }
        $custom = $item["customization"] ?? [];
        if (!is_array($custom) || ($custom !== [] && array_is_list($custom))) {
            throw new OrderError("Invalid item options.");
        }
        // Sizes and paid add-ons have no configured catalog and cannot be ordered yet.
        if (!in_array($custom["size"] ?? "Not applicable", ["", "Not applicable"], true)
            || ($custom["addons"] ?? []) !== []) {
            throw new OrderError("Sizes and add-ons are not available for ordering.");
        }
        $sugar = $custom["sugarLevel"] ?? "Not applicable";
        $ice = $custom["iceLevel"] ?? "Not applicable";
        if (!in_array($sugar, ["Not applicable", "100%", "75%", "50%", "25%", "0%"], true)
            || !in_array($ice, ["Not applicable", "Regular ice", "Less ice", "No ice", "Hot"], true)) {
            throw new OrderError("Invalid sugar or ice selection.");
        }
        $lines[] = [
            "menu_item_id" => orders_id($item["itemId"] ?? null),
            "quantity" => $item["quantity"],
            "customization" => ["sugarLevel" => $sugar, "iceLevel" => $ice],
            "notes" => orders_text($custom["notes"] ?? "", 1000),
        ];
    }
    return $lines;
}

function orders_header_sql(): string
{
    return "SELECT o.order_id,o.order_number,o.session_id,o.customer_name,o.total_amount,
        o.order_status,o.created_at,o.updated_at,o.cancelled_at,o.cancellation_reason,
        t.table_name,p.payment_id,p.payment_method,p.amount_applied,p.amount_received,
        p.change_amount,p.payment_reference,p.received_by_staff_id,p.paid_at
        FROM dbo.orders o
        JOIN dbo.customer_sessions s ON s.session_id=o.session_id
        JOIN dbo.cafe_tables t ON t.table_id=s.table_id
        LEFT JOIN dbo.payments p ON p.order_id=o.order_id";
}

function orders_public_header(array $row): array
{
    foreach (["total_amount", "amount_applied", "amount_received", "change_amount"] as $key) {
        if ($row[$key] !== null) {
            $row[$key] = orders_money(orders_cents($row[$key]));
        }
    }
    foreach (["order_id", "session_id", "payment_id"] as $key) {
        if ($row[$key] !== null) {
            $row[$key] = (string) $row[$key];
        }
    }
    $row["payment_status"] = $row["payment_id"] !== null
        ? "paid" : ($row["order_status"] === "cancelled" ? "not_due" : "unpaid");
    return $row;
}

function orders_get(PDO $db, int $id, ?int $sessionId = null): array
{
    $query = $db->prepare(orders_header_sql() . " WHERE o.order_id=?" .
        ($sessionId !== null ? " AND o.session_id=?" : ""));
    $query->execute($sessionId !== null ? [$id, $sessionId] : [$id]);
    $row = $query->fetch();
    if (!$row) {
        throw new OrderError("Order not found.", 404);
    }
    $order = orders_public_header($row);
    $query = $db->prepare("SELECT order_item_id,line_number,menu_item_id,item_name,category,
        unit_price,quantity,line_total,customization_json,notes
        FROM dbo.order_items WHERE order_id=? ORDER BY line_number");
    $query->execute([$id]);
    $order["items"] = $query->fetchAll();
    foreach ($order["items"] as &$item) {
        $item["unit_price"] = orders_money(orders_cents($item["unit_price"]));
        $item["line_total"] = orders_money(orders_cents($item["line_total"]));
        $item["order_item_id"] = (string) $item["order_item_id"];
        $item["menu_item_id"] = (string) $item["menu_item_id"];
        $item["quantity"] = (int) $item["quantity"];
        $item["customization"] = json_decode($item["customization_json"], true, 32, JSON_THROW_ON_ERROR);
        unset($item["customization_json"]);
    }
    unset($item);
    return $order;
}

function orders_list(PDO $db, ?int $sessionId, mixed $status, mixed $offset): array
{
    if (!is_string($status) || !in_array($status, ["open", "all", "received", "preparing", "ready", "served", "cancelled"], true)) {
        throw new OrderError("Invalid order status.");
    }
    $offset = filter_var($offset, FILTER_VALIDATE_INT, ["options" => ["min_range" => 0, "max_range" => 1000000]]);
    if ($offset === false) {
        throw new OrderError("Invalid list offset.");
    }
    $where = ["1=1"];
    $params = [];
    if ($sessionId !== null) {
        $where[] = "o.session_id=?";
        $params[] = $sessionId;
    }
    if ($status === "open") {
        $where[] = "o.order_status IN ('received','preparing','ready')";
    } elseif ($status !== "all") {
        $where[] = "o.order_status=?";
        $params[] = $status;
    }
    $query = $db->prepare(orders_header_sql() . " WHERE " . implode(" AND ", $where) .
        " ORDER BY o.order_id DESC OFFSET ? ROWS FETCH NEXT 51 ROWS ONLY");
    foreach ($params as $index => $value) {
        $query->bindValue($index + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
    $query->bindValue(count($params) + 1, $offset, PDO::PARAM_INT);
    $query->execute();
    $rows = $query->fetchAll();
    $hasMore = count($rows) > 50;
    return ["orders" => array_map("orders_public_header", array_slice($rows, 0, 50)),
        "next_offset" => $hasMore ? $offset + 50 : null];
}

// The caller owns the transaction; table-first locking also coordinates with session closure.
function orders_submit(PDO $db, int $tableId, ?string $token, array $input): array
{
    $key = $input["submission_key"] ?? null;
    if (!is_string($key) || !preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i', $key)) {
        throw new OrderError("A valid submission key is required.");
    }
    $lines = orders_lines($input["items"] ?? null);
    $expectedTotal = orders_cents($input["expected_total"] ?? null);
    $hash = hash("sha256", json_encode([$lines, $expectedTotal], JSON_THROW_ON_ERROR));
    $table = dining_table($db, $tableId);
    dining_expire_table($db, $tableId);
    $session = dining_guest_session($db, $tableId, $token);
    if (!$session) {
        throw new OrderError("Your customer session was not found.", 403);
    }
    $sessionId = (int) $session["session_id"];
    $query = $db->prepare("SELECT order_id,CONVERT(varchar(64),submission_hash,2) AS request_hash
        FROM dbo.orders WHERE session_id=? AND submission_key=?");
    $query->execute([$sessionId, $key]);
    $old = $query->fetch();
    if ($old) {
        if (!hash_equals(strtolower($old["request_hash"]), $hash)) {
            throw new OrderError("This submission key was already used for a different order.", 409);
        }
        return ["order" => orders_get($db, (int) $old["order_id"], $sessionId), "replayed" => true];
    }
    if (!(bool) $table["is_active"] || $session["status"] !== "active") {
        throw new OrderError("An active, approved customer session is required.", 403);
    }
    // Hold menu read locks until commit so all saved names and prices form one transaction.
    $menuQuery = $db->prepare("SELECT menu_item_id,item_name,category,price,is_available
        FROM dbo.menu_items WITH (HOLDLOCK) WHERE menu_item_id=?");
    $catalog = [];
    $ids = array_unique(array_column($lines, "menu_item_id"));
    sort($ids, SORT_NUMERIC);
    foreach ($ids as $menuId) {
        $menuQuery->execute([$menuId]);
        $menu = $menuQuery->fetch();
        if (!$menu || !(bool) $menu["is_available"]) {
            throw new OrderError("An item is no longer available. Refresh your menu.", 409, "item_unavailable");
        }
        $catalog[$menuId] = $menu;
    }
    $total = 0;
    foreach ($lines as $line) {
        $menu = $catalog[$line["menu_item_id"]];
        if (!in_array($menu["category"], ["coffee", "non-coffee"], true)
            && ($line["customization"]["sugarLevel"] !== "Not applicable"
                || $line["customization"]["iceLevel"] !== "Not applicable")) {
            throw new OrderError("Sugar and ice options apply only to drinks.");
        }
        $total += orders_cents($menu["price"]) * $line["quantity"];
        if ($total > 999999999999) {
            throw new OrderError("Order total exceeds the supported amount.");
        }
    }
    if ($total !== $expectedTotal) {
        throw new OrderError("Menu prices have changed. Refresh the menu and review your total.", 409, "price_changed");
    }
    $query = $db->prepare("INSERT INTO dbo.orders
        (session_id,customer_name,submission_key,submission_hash,total_amount)
        OUTPUT INSERTED.order_id VALUES(?,?,?,CONVERT(binary(32),?,2),?)");
    $query->execute([$sessionId, $session["guest_name"], $key, $hash, orders_money($total)]);
    $id = (int) $query->fetchColumn();
    $query->closeCursor();
    $itemQuery = $db->prepare("INSERT INTO dbo.order_items
        (order_id,line_number,menu_item_id,item_name,category,unit_price,quantity,customization_json,notes)
        VALUES(?,?,?,?,?,?,?,?,?)");
    foreach ($lines as $index => $line) {
        $menu = $catalog[$line["menu_item_id"]];
        $itemQuery->execute([$id, $index + 1, $line["menu_item_id"], $menu["item_name"],
            $menu["category"], $menu["price"], $line["quantity"],
            json_encode($line["customization"], JSON_THROW_ON_ERROR), $line["notes"]]);
    }
    return ["order" => orders_get($db, $id, $sessionId), "replayed" => false];
}

function orders_lock(PDO $db, int $id): array
{
    $query = $db->prepare("SELECT s.table_id FROM dbo.orders o
        JOIN dbo.customer_sessions s ON s.session_id=o.session_id WHERE o.order_id=?");
    $query->execute([$id]);
    $tableId = $query->fetchColumn();
    if ($tableId === false) {
        throw new OrderError("Order not found.", 404);
    }
    dining_table($db, (int) $tableId);
    dining_expire_table($db, (int) $tableId);
    $query = $db->prepare("SELECT order_id,order_status,total_amount FROM dbo.orders
        WITH (UPDLOCK,HOLDLOCK) WHERE order_id=?");
    $query->execute([$id]);
    return $query->fetch() ?: throw new OrderError("Order not found.", 404);
}

function orders_pay(PDO $db, int $actorId, int $id, array $input): array
{
    $order = orders_lock($db, $id);
    $method = $input["payment_method"] ?? null;
    if (!in_array($method, ["Cash", "GCash", "PayMaya"], true)) {
        throw new OrderError("Choose Cash, GCash or PayMaya.");
    }
    $total = orders_cents($order["total_amount"]);
    $received = orders_cents($input["amount_received"] ?? null);
    $reference = orders_text($input["payment_reference"] ?? "", 100);
    if ($received < $total || ($method !== "Cash" && $received !== $total)
        || ($method === "Cash" && $reference !== "")) {
        throw new OrderError("Record the full payment; cash must cover the total and digital payment must match it.");
    }
    $query = $db->prepare("SELECT payment_method,amount_received,payment_reference
        FROM dbo.payments WHERE order_id=?");
    $query->execute([$id]);
    $old = $query->fetch();
    if ($old) {
        if ($old["payment_method"] !== $method || orders_cents($old["amount_received"]) !== $received
            || ($old["payment_reference"] ?? "") !== $reference) {
            throw new OrderError("This order already has a confirmed payment.", 409);
        }
        return ["order" => orders_get($db, $id), "replayed" => true];
    }
    if ($order["order_status"] !== "received") {
        throw new OrderError("Only a received, unpaid order can be paid.", 409);
    }
    $query = $db->prepare("INSERT INTO dbo.payments
        (order_id,payment_method,amount_applied,amount_received,change_amount,payment_reference,received_by_staff_id)
        VALUES(?,?,?,?,?,?,?)");
    $query->execute([$id, $method, orders_money($total), orders_money($received),
        orders_money($received - $total), $reference === "" ? null : $reference, $actorId]);
    $db->prepare("UPDATE dbo.orders SET order_status='preparing',updated_at=SYSUTCDATETIME(),
        updated_by_staff_id=? WHERE order_id=?")->execute([$actorId, $id]);
    return ["order" => orders_get($db, $id), "replayed" => false];
}

function orders_status(PDO $db, int $actorId, int $id, mixed $next): array
{
    if (!in_array($next, ["ready", "served"], true)) {
        throw new OrderError("Choose ready or served.");
    }
    $order = orders_lock($db, $id);
    $query = $db->prepare("SELECT payment_id FROM dbo.payments WHERE order_id=?");
    $query->execute([$id]);
    if (!$query->fetchColumn()) {
        throw new OrderError("Cashier payment is required before preparation.", 409);
    }
    if ($order["order_status"] !== $next) {
        $expected = $next === "ready" ? "preparing" : "ready";
        if ($order["order_status"] !== $expected) {
            throw new OrderError("The order status has changed. Refresh and try again.", 409);
        }
        $db->prepare("UPDATE dbo.orders SET order_status=?,updated_at=SYSUTCDATETIME(),
            updated_by_staff_id=? WHERE order_id=?")->execute([$next, $actorId, $id]);
    }
    return orders_get($db, $id);
}

function orders_cancel(PDO $db, array $actor, int $id, mixed $reason): array
{
    if ($actor["role"] !== "admin") {
        throw new OrderError("Only an Admin can cancel an unpaid order.", 403);
    }
    $reason = orders_text($reason, 500, true);
    $order = orders_lock($db, $id);
    $query = $db->prepare("SELECT payment_id FROM dbo.payments WHERE order_id=?");
    $query->execute([$id]);
    if ($query->fetchColumn()) {
        throw new OrderError("Paid orders cannot be cancelled; refunds are not supported.", 409);
    }
    if ($order["order_status"] === "cancelled") {
        return orders_get($db, $id);
    }
    if ($order["order_status"] !== "received") {
        throw new OrderError("Only an unpaid received order can be cancelled.", 409);
    }
    $db->prepare("UPDATE dbo.orders SET order_status='cancelled',cancelled_at=SYSUTCDATETIME(),
        cancelled_by_staff_id=?,cancellation_reason=?,updated_at=SYSUTCDATETIME(),
        updated_by_staff_id=? WHERE order_id=?")->execute([$actor["staff_id"], $reason, $actor["staff_id"], $id]);
    return orders_get($db, $id);
}

function orders_error(?PDO $db, Throwable $error): never
{
    if ($db && $db->inTransaction()) {
        $db->rollBack();
    }
    if ($error instanceof OrderError) {
        quvo_json(["ok" => false, "error" => $error->getMessage(), "code" => $error->errorCode], $error->status);
    }
    if ($error instanceof DiningError) {
        quvo_json(["ok" => false, "error" => $error->getMessage()], 422);
    }
    if ($error instanceof PDOException && in_array((int) ($error->errorInfo[1] ?? 0), [1205, 2601, 2627], true)) {
        quvo_json(["ok" => false, "error" => "A simultaneous update occurred. Retry using the same submission key."], 409);
    }
    error_log("Quvo order request failed: " . $error->getMessage());
    quvo_json(["ok" => false, "error" => "Order service is unavailable. Please try again."], 503);
}
