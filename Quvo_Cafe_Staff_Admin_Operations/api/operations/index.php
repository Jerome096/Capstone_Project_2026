<?php
declare(strict_types=1);
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/sales.php';
require_once __DIR__ . '/../../includes/cash-operations.php';
$db = null;
try {
    $actor = quvo_current_user();
    if (!$actor) throw new OrderError('Please sign in again.', 401);
    if (!in_array($actor['role'], ['admin','staff'], true)) throw new OrderError('Access denied.', 403);
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET','POST'], true)) throw new OrderError('Unsupported request.', 405);
    if ($method === 'POST') quvo_require_post();
    $db = quvo_db();
    if ($method === 'GET') {
        if (($_GET['action'] ?? '') === 'eod-preview') {cash_ops_schema($db);quvo_json(['ok'=>true,'operation'=>cash_ops_public(cash_ops_active($db))]);}
        quvo_json(['ok'=>true,'completed_today'=>operations_completed_today($db),'stock_alerts'=>inventory_stock_alerts($db)]);
    }
    $input = orders_input();
    if (($input['action'] ?? '') !== 'eod') throw new OrderError('Unknown operation action.');
    $note = orders_text($input['note'] ?? '', 1000);
    dining_expire_sessions($db);
    $db->beginTransaction();
    $result = cash_ops_close($db,(int)$actor['staff_id'],$note,$input['submission_key']??null,$input['operation_id']??null,$input['counted_cash']??null,$input['business_date']??null);
    $db->commit();
    quvo_json(['ok'=>true] + $result);
} catch (Throwable $error) {
    orders_error($db, $error);
}
