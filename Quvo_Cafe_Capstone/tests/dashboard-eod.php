<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/dashboard.php';
$checks = 0;
function verify_eod(bool $ok, string $label): void {
    global $checks;
    if (!$ok) throw new RuntimeException('FAIL: ' . $label);
    echo 'PASS: ' . $label . PHP_EOL; $checks++;
}
$db = quvo_db();
try {
    $db->beginTransaction();
    $baseline = dashboard_completed_today($db);
    $initialOrders = (int)$db->query('SELECT COUNT(*) FROM dbo.orders')->fetchColumn();
    $actor = (int)$db->query('SELECT TOP 1 staff_id FROM dbo.staff_users WHERE is_active=1')->fetchColumn();
    if (!$actor) throw new RuntimeException('An active staff account is required.');
    $q = $db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT inserted.table_id VALUES(?,N'EOD rollback test','indoor')");
    $q->execute(['eod-' . bin2hex(random_bytes(5))]);
    $table = (int)$q->fetchColumn(); $q->closeCursor();
    [$visit, $token] = dining_guest_request($db, $table, 'EOD rollback test', null);
    dining_change_session($db, $actor, (int)$visit['session_id'], 'approve');
    $q = $db->query("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT inserted.menu_item_id
        VALUES(N'EOD test item','coffee',10.00,1)");
    $menu = (int)$q->fetchColumn(); $q->closeCursor();
    $sequence = 1;
    $make = function(bool $paid, bool $served) use ($db, $table, $token, $menu, $actor, &$sequence): int {
        $input = ['submission_key'=>sprintf('%08x-1111-4111-8111-111111111111',$sequence++),
            'expected_total'=>'10.00','items'=>[['itemId'=>(string)$menu,'quantity'=>1]]];
        $id = (int)orders_submit($db, $table, $token, $input)['order']['order_id'];
        if ($paid) orders_pay($db, $actor, $id, ['payment_method'=>'Cash','amount_received'=>'10.00']);
        if ($served) { orders_status($db, $actor, $id, 'ready'); orders_status($db, $actor, $id, 'served'); }
        return $id;
    };
    $first = $make(true, true); $second = $make(true, true);
    $old = $make(true, true);
    $db->prepare('UPDATE dbo.orders SET created_at=DATEADD(day,-1,created_at),updated_at=DATEADD(day,-1,updated_at) WHERE order_id=?')
        ->execute([$old]);
    $unpaid = $make(false, false); $preparing = $make(true, false);
    verify_eod(dashboard_completed_today($db) === $baseline + 2, 'count only paid served orders from today');
    $closure = dashboard_close_completions($db, $actor, 'Temporary rollback test');
    verify_eod($closure['completed_today'] === 0, 'EOD resets the dashboard count');
    verify_eod(dashboard_completed_today($db) === 0, 'reading again does not restore old completions');
    verify_eod(orders_get($db, $first)['order_status'] === 'served' && orders_get($db, $first)['payment_status'] === 'paid',
        'EOD preserves served orders, items and payments');
    verify_eod(orders_get($db, $unpaid)['order_status'] === 'received' && orders_get($db, $preparing)['order_status'] === 'preparing',
        'EOD leaves active orders unchanged');
    $q = $db->prepare('SELECT COUNT(*) FROM dbo.eod_completed_orders WHERE order_id IN (?,?,?)');
    $q->execute([$first,$second,$old]);
    verify_eod((int)$q->fetchColumn() === 3, 'closure records completed order IDs including older receipts');
    orders_status($db, $actor, $first, 'served');
    verify_eod(dashboard_completed_today($db) === 0, 'repeat served action cannot recount a closed order');
    orders_status($db, $actor, $preparing, 'ready'); orders_status($db, $actor, $preparing, 'served');
    verify_eod(dashboard_completed_today($db) === 1, 'orders served after EOD start a fresh count');
    $next = $make(true, true);
    verify_eod(dashboard_completed_today($db) === 2, 'new completions count even in the same timestamp second');
    $nextClosure = dashboard_close_completions($db, $actor, 'Next rollback closure');
    verify_eod($nextClosure['completed_today'] === 0, 'a second EOD resets new completions');
    $q = $db->prepare('SELECT closure_id FROM dbo.eod_completed_orders WHERE order_id=?');
    $q->execute([$first]);
    verify_eod((string)$q->fetchColumn() === $closure['closure_id'], 'later EOD does not move previously closed orders');
    verify_eod((int)$db->query('SELECT COUNT(*) FROM dbo.orders')->fetchColumn() === $initialOrders + 6,
        'EOD does not delete order history');
    echo "$checks EOD checks passed." . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . PHP_EOL); $failed = true;
} finally {
    if ($db->inTransaction()) $db->rollBack();
    echo 'All test records and EOD snapshots rolled back; identity sequences may have gaps.' . PHP_EOL;
}
exit(!empty($failed) ? 1 : 0);
