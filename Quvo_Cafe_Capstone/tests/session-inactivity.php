<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/orders.php';
$checks = 0;
function verify(bool $ok, string $label): void {
    global $checks;
    if (!$ok) throw new RuntimeException('FAIL: ' . $label);
    echo 'PASS: ' . $label . PHP_EOL;
    $checks++;
}
$db = quvo_db();
try {
    $db->beginTransaction();
    $adminId = (int) $db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r
        ON r.role_id=s.role_id WHERE s.is_active=1 AND r.role_name='Admin'")->fetchColumn();
    if (!$adminId) throw new RuntimeException('An active Admin is required.');
    $q = $db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT inserted.table_id
        VALUES(?,N'Inactivity rollback test','indoor')");
    $q->execute(['idle-' . bin2hex(random_bytes(5))]);
    $tableId = (int) $q->fetchColumn(); $q->closeCursor();
    [$pending, $token] = dining_guest_request($db, $tableId, 'Inactivity rollback test', null);
    $sessionId = (int) $pending['session_id'];
    $db->prepare("UPDATE dbo.customer_sessions SET requested_at=DATEADD(hour,-2,SYSUTCDATETIME()) WHERE session_id=?")
        ->execute([$sessionId]);
    verify(dining_expire_table($db, $tableId) === 0, 'pending approval is not expired');
    dining_change_session($db, $adminId, $sessionId, 'approve');
    $get = fn() => dining_guest_session($db, $tableId, $token);
    verify((int) $get()['idle_remaining_seconds'] >= 599, 'approval starts ten minutes');
    $age = function(int $seconds) use ($db, $sessionId): void {
        $db->prepare("UPDATE dbo.customer_sessions SET last_activity_at=DATEADD(second,CAST(? AS int),SYSUTCDATETIME()) WHERE session_id=?")
            ->execute([-$seconds, $sessionId]);
    };
    $age(599);
    verify(dining_expire_table($db, $tableId) === 0, 'session survives before the ten-minute boundary');
    $age(540);
    dining_guest_activity($db, $tableId, $token);
    verify((int) $get()['idle_remaining_seconds'] >= 599, 'genuine activity resets the deadline');
    $age(540);
    $before = $get()['last_activity_at'];
    $get(); $get();
    verify($get()['last_activity_at'] === $before, 'polling does not extend activity');
    try { dining_guest_activity($db, $tableId, 'wrong'); throw new RuntimeException('wrong token accepted'); }
    catch (DiningError) { verify($get()['last_activity_at'] === $before, 'another browser cannot reset this visit'); }
    $q = $db->query("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT inserted.menu_item_id
        VALUES(N'Inactivity test item','coffee',10.00,1)");
    $menuId = (int) $q->fetchColumn(); $q->closeCursor();
    $input = ['submission_key'=>'11111111-1111-4111-8111-111111111111','expected_total'=>'10.00',
        'items'=>[['itemId'=>(string)$menuId,'quantity'=>1]]];
    $orderId = (int) orders_submit($db, $tableId, $token, $input)['order']['order_id'];
    $age(540);
    verify(dining_expire_table($db, $tableId) === 0 && !(bool)$get()['idle_paused']
        && (int)$get()['idle_remaining_seconds'] < 65, 'unpaid order leaves the inactivity clock running');
    orders_pay($db, $adminId, $orderId, ['payment_method'=>'Cash','amount_received'=>'10.00']);
    $age(3600);
    verify(dining_expire_table($db, $tableId) === 0, 'preparing order pauses expiry');
    orders_status($db, $adminId, $orderId, 'ready');
    verify(dining_expire_table($db, $tableId) === 0, 'ready order still pauses expiry');
    $input['submission_key'] = '22222222-2222-4222-8222-222222222222';
    $secondId = (int) orders_submit($db, $tableId, $token, $input)['order']['order_id'];
    try { dining_change_session($db, $adminId, $sessionId, 'close'); throw new RuntimeException('paid visit closed'); }
    catch (DiningError) { verify(orders_get($db, $secondId)['order_status'] === 'received',
        'paid outstanding order blocks closure without cancelling mixed unpaid orders'); }
    orders_status($db, $adminId, $orderId, 'served');
    $clock = $get();
    verify(!(bool)$clock['idle_paused'] && (int)$clock['idle_remaining_seconds'] >= 599,
        'serving the paid order restarts ten minutes even with an unpaid order remaining');
    verify(dining_expire_table($db, $tableId) === 0, 'old activity cannot expire a just-completed visit');
    $db->prepare("UPDATE dbo.orders SET created_at=DATEADD(minute,-10,SYSUTCDATETIME()),
        updated_at=DATEADD(minute,-9,SYSUTCDATETIME()) WHERE order_id=?")->execute([$orderId]);
    $age(540);
    orders_cancel($db, ['role'=>'admin','staff_id'=>$adminId], $secondId, 'Test only');
    verify((int)$get()['idle_remaining_seconds'] < 65, 'cancelling an unpaid order does not reset the clock');
    $input['submission_key'] = '33333333-3333-4333-8333-333333333333';
    $thirdId = (int) orders_submit($db, $tableId, $token, $input)['order']['order_id'];
    $db->prepare("UPDATE dbo.orders SET created_at=DATEADD(minute,-12,SYSUTCDATETIME()),
        updated_at=DATEADD(minute,-11,SYSUTCDATETIME()),
        cancelled_at=CASE WHEN cancelled_at IS NOT NULL THEN DATEADD(minute,-11,SYSUTCDATETIME()) END
        WHERE session_id=?")
        ->execute([$sessionId]);
    // datetime2(0) rounds fractional seconds; age one extra second for a stable boundary check.
    $age(601);
    verify(dining_expire_table($db, $tableId) === 1, 'session expires after the ten-minute boundary');
    verify($get()['status'] === 'closed' && $get()['idle_expired_at'] !== null, 'expiry preserves visit with its reason');
    $q = $db->prepare('SELECT order_status,cancellation_source,cancelled_by_staff_id,cancellation_reason FROM dbo.orders WHERE order_id=?');
    $q->execute([$thirdId]); $automatic = $q->fetch();
    verify($automatic['order_status'] === 'cancelled' && $automatic['cancellation_source'] === 'session'
        && $automatic['cancelled_by_staff_id'] === null && str_contains($automatic['cancellation_reason'], 'inactivity'),
        'expiry cancels unpaid order with a system reason and no invented staff actor');
    verify(orders_get($db, $orderId)['order_status'] === 'served', 'expiry leaves paid completed orders intact');
    verify(count(orders_list($db, $sessionId, 'open', 0)['orders']) === 0, 'expired unpaid orders leave the cashier open queue');
    try { orders_pay($db, $adminId, $thirdId, ['payment_method'=>'Cash','amount_received'=>'10.00']);
        throw new RuntimeException('expired order paid'); }
    catch (OrderError $error) { verify($error->status === 409, 'late payment cannot revive an expired order'); }
    verify(dining_expire_table($db, $tableId) === 0, 'repeated expiry is harmless');
    try { dining_guest_activity($db, $tableId, $token); throw new RuntimeException('expired visit revived'); }
    catch (DiningError) { verify($get()['status'] === 'closed', 'late activity cannot revive expired visit'); }
    $input['submission_key'] = '44444444-4444-4444-8444-444444444444';
    try { orders_submit($db, $tableId, $token, $input); throw new RuntimeException('expired visit submitted'); }
    catch (OrderError $error) { verify($error->status === 403, 'expired visit cannot place new orders'); }
    [$newVisit, $newToken] = dining_guest_request($db, $tableId, 'Next visit', $token);
    verify($newVisit['status'] === 'pending' && $newToken !== $token, 'new visit requires fresh approval');
    dining_change_session($db, $adminId, (int)$newVisit['session_id'], 'approve');
    verify(dining_guest_session($db, $tableId, $newToken)['status'] === 'active', 'expiry releases the table');
    verify(count(orders_list($db, $sessionId, 'all', 0)['orders']) === 3, 'expiry retains orders and payments');
    $newId = (int)orders_submit($db, $tableId, $newToken, $input)['order']['order_id'];
    dining_change_session($db, $adminId, (int)$newVisit['session_id'], 'close');
    $q->execute([$newId]); $manual = $q->fetch();
    verify($manual['order_status'] === 'cancelled' && $manual['cancellation_source'] === 'session'
        && (int)$manual['cancelled_by_staff_id'] === $adminId, 'staff closure cancels unpaid orders with staff attribution');
    echo "$checks inactivity checks passed." . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . PHP_EOL); $failed = true;
} finally {
    if ($db->inTransaction()) $db->rollBack();
    echo 'All test records rolled back; identity sequences may have gaps.' . PHP_EOL;
}
exit(!empty($failed) ? 1 : 0);
