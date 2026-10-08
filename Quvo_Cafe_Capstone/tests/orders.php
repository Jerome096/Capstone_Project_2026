<?php
declare(strict_types=1);
// Integration checks use temporary rows inside one transaction that always rolls back.
if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit();
}
require_once __DIR__ . "/../config/database.php";
require_once __DIR__ . "/../includes/orders.php";
$checks = 0;
function check(bool $condition, string $label): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException("FAIL: " . $label);
    }
    $checks++;
    echo "PASS: " . $label . PHP_EOL;
}
function rejected(callable $action, int $status, string $label): void
{
    try {
        $action();
    } catch (OrderError $error) {
        check($error->status === $status, $label);
        return;
    }
    throw new RuntimeException("FAIL: " . $label . " was accepted");
}
$db = quvo_db();
try {
    $db->beginTransaction();
    $adminId = $db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r
        ON r.role_id=s.role_id WHERE s.is_active=1 AND r.role_name='Admin' ORDER BY s.staff_id")->fetchColumn();
    if ($adminId === false) {
        throw new RuntimeException("An active local Admin account is required.");
    }
    $admin = ["staff_id" => (int) $adminId, "role" => "admin"];
    $code = "test-" . bin2hex(random_bytes(5));
    $q = $db->prepare("INSERT INTO dbo.cafe_tables(table_code,table_name,area)
        OUTPUT INSERTED.table_id VALUES(?,N'Temporary order test','indoor')");
    $q->execute([$code]);
    $tableId = (int) $q->fetchColumn();
    $q->closeCursor();
    $token = bin2hex(random_bytes(32));
    $q = $db->prepare("INSERT INTO dbo.customer_sessions(table_id,guest_name,guest_token_hash,status)
        OUTPUT INSERTED.session_id VALUES(?,N'Temporary order test',CONVERT(binary(32),?,2),'active')");
    $q->execute([$tableId, hash("sha256", $token)]);
    $sessionId = (int) $q->fetchColumn();
    $q->closeCursor();
    $q = $db->query("INSERT INTO dbo.menu_items(item_name,category,price,is_available)
        OUTPUT INSERTED.menu_item_id VALUES(N'Temporary test item','coffee',15.25,1)");
    $menuId = (int) $q->fetchColumn();
    $q->closeCursor();
    $input = [
        "submission_key" => "11111111-1111-4111-8111-111111111111",
        "expected_total" => "30.50",
        "items" => [["itemId" => (string) $menuId, "quantity" => 2,
            "unitPrice" => 0.01, "name" => "Untrusted client name",
            "customization" => ["sugarLevel" => "50%", "iceLevel" => "Less ice", "notes" => "No lid"]]],
    ];
    check(orders_money(orders_cents("0.10") + orders_cents("0.20")) === "0.30", "exact decimal money");
    check(orders_money(orders_cents(".00")) === "0.00" && orders_money(orders_cents(".10")) === "0.10",
        "normalize SQL Server decimals below one");
    rejected(fn() => orders_cents("1.001"), 422, "reject fractional centavos");
    rejected(fn() => orders_cents("-1"), 422, "reject negative money");
    rejected(fn() => orders_submit($db, $tableId, null, $input), 403, "reject missing guest proof");
    rejected(fn() => orders_submit($db, $tableId, "wrong-token", $input), 403, "reject another guest token");
    $bad = $input;
    $bad["items"][0]["quantity"] = 1.5;
    rejected(fn() => orders_submit($db, $tableId, $token, $bad), 422, "reject fractional quantities");
    $bad = $input;
    $bad["items"][0]["customization"]["addons"] = ["Unconfigured extra"];
    rejected(fn() => orders_submit($db, $tableId, $token, $bad), 422, "reject unconfigured add-ons");
    $bad = $input;
    $bad["expected_total"] = "0.02";
    rejected(fn() => orders_submit($db, $tableId, $token, $bad), 409, "reject changed or forged cart total");
    $db->prepare("UPDATE dbo.customer_sessions SET status='pending' WHERE session_id=?")->execute([$sessionId]);
    rejected(fn() => orders_submit($db, $tableId, $token, $input), 403, "reject pending sessions");
    $db->prepare("UPDATE dbo.customer_sessions SET status='active' WHERE session_id=?")->execute([$sessionId]);
    $db->prepare("UPDATE dbo.cafe_tables SET is_active=0 WHERE table_id=?")->execute([$tableId]);
    rejected(fn() => orders_submit($db, $tableId, $token, $input), 403, "reject inactive tables");
    $db->prepare("UPDATE dbo.cafe_tables SET is_active=1 WHERE table_id=?")->execute([$tableId]);
    $db->prepare("UPDATE dbo.menu_items SET is_available=0 WHERE menu_item_id=?")->execute([$menuId]);
    rejected(fn() => orders_submit($db, $tableId, $token, $input), 409, "reject unavailable menu items");
    $db->prepare("UPDATE dbo.menu_items SET is_available=1 WHERE menu_item_id=?")->execute([$menuId]);
    $result = orders_submit($db, $tableId, $token, $input);
    $id = (int) $result["order"]["order_id"];
    check($result["order"]["total_amount"] === "30.50" && $result["order"]["items"][0]["item_name"] === "Temporary test item",
        "use SQL names and prices instead of browser values");
    check($result["order"]["payment_status"] === "unpaid" && count($result["order"]["items"]) === 1, "save unpaid order and lines");
    $retry = orders_submit($db, $tableId, $token, $input);
    check($retry["replayed"] && (int) $retry["order"]["order_id"] === $id, "retry returns same order");
    $bad = $input;
    $bad["items"][0]["quantity"] = 3;
    rejected(fn() => orders_submit($db, $tableId, $token, $bad), 409, "reject reused key with changed contents");
    rejected(fn() => orders_get($db, $id, $sessionId + 999999), 404, "prevent reading another visit order");
    $listed = orders_list($db, $sessionId, "open", "0");
    check(count($listed["orders"]) === 1, "list only own visit");
    $db->prepare("UPDATE dbo.menu_items SET price=16.00,item_name=N'Changed menu name' WHERE menu_item_id=?")->execute([$menuId]);
    $saved = orders_get($db, $id);
    check($saved["items"][0]["unit_price"] === "15.25" && $saved["items"][0]["item_name"] === "Temporary test item",
        "preserve historical menu name and price");
    check(orders_submit($db, $tableId, $token, $input)["replayed"], "retry survives menu changes");
    rejected(fn() => orders_status($db, (int) $adminId, $id, "ready"), 409, "block preparation progress before payment");
    try {
        dining_change_session($db, (int) $adminId, $sessionId, "close");
        throw new RuntimeException("FAIL: unpaid session closed");
    } catch (DiningError) {
        check(true, "block session closure with unpaid orders");
    }
    rejected(fn() => orders_pay($db, (int) $adminId, $id, ["payment_method" => "Cash", "amount_received" => "30.00"]),
        422, "reject partial cash payments");
    rejected(fn() => orders_pay($db, (int) $adminId, $id, ["payment_method" => "GCash", "amount_received" => "31.00"]),
        422, "require exact digital amount");
    $payment = ["payment_method" => "Cash", "amount_received" => "50.00"];
    $paid = orders_pay($db, (int) $adminId, $id, $payment);
    check($paid["order"]["change_amount"] === "19.50" && $paid["order"]["order_status"] === "preparing",
        "cash payment saves exact change and starts preparation");
    $again = orders_pay($db, (int) $adminId, $id, $payment);
    check($again["replayed"] && $again["order"]["payment_id"] === $paid["order"]["payment_id"], "do not charge twice on retry");
    rejected(fn() => orders_pay($db, (int) $adminId, $id, ["payment_method" => "Cash", "amount_received" => "100.00"]),
        409, "reject replacing confirmed payment");
    rejected(fn() => orders_cancel($db, $admin, $id, "Cannot refund"), 409, "block cancelling a paid order");
    rejected(fn() => orders_status($db, (int) $adminId, $id, "served"), 409, "prevent skipping ready status");
    check(orders_status($db, (int) $adminId, $id, "ready")["order_status"] === "ready", "mark paid order ready");
    check(orders_status($db, (int) $adminId, $id, "served")["order_status"] === "served", "mark ready order served");
    $input["submission_key"] = "22222222-2222-4222-8222-222222222222";
    $input["expected_total"] = "32.00";
    $second = orders_submit($db, $tableId, $token, $input);
    $secondId = (int) $second["order"]["order_id"];
    rejected(fn() => orders_cancel($db, ["staff_id" => (int) $adminId, "role" => "staff"], $secondId, "Cancelled"),
        403, "staff cannot use admin cancellation");
    check(orders_cancel($db, $admin, $secondId, "Customer changed their mind")["order_status"] === "cancelled",
        "retain cancelled unpaid orders");
    rejected(fn() => orders_pay($db, (int) $adminId, $secondId, ["payment_method" => "Cash", "amount_received" => "32.00"]),
        409, "block payment on cancelled order");
    $input["submission_key"] = "33333333-3333-4333-8333-333333333333";
    $thirdId = (int) orders_submit($db, $tableId, $token, $input)["order"]["order_id"];
    $digital = orders_pay($db, (int) $adminId, $thirdId, [
        "payment_method" => "GCash", "amount_received" => "32.00", "payment_reference" => "TEST-ONLY",
    ]);
    check($digital["order"]["change_amount"] === "0.00" && $digital["order"]["payment_reference"] === "TEST-ONLY",
        "record cashier-confirmed digital payment");
    orders_status($db, (int) $adminId, $thirdId, "ready");
    orders_status($db, (int) $adminId, $thirdId, "served");
    dining_change_session($db, (int) $adminId, $sessionId, "close");
    check(dining_guest_session($db, $tableId, $token)["status"] === "closed", "close fully settled visit");
    check(orders_submit($db, $tableId, $token, $input)["replayed"], "recover successful submission after visit closes");
    $input["submission_key"] = "44444444-4444-4444-8444-444444444444";
    rejected(fn() => orders_submit($db, $tableId, $token, $input), 403, "closed visit cannot submit new orders");
    echo $checks . " checks passed." . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    $failed = true;
} finally {
    if ($db->inTransaction()) {
        $db->rollBack();
        echo "All temporary rows rolled back; identity numbers may have gaps." . PHP_EOL;
    }
}
exit(!empty($failed) ? 1 : 0);
