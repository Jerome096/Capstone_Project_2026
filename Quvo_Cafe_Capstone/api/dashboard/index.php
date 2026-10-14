<?php
declare(strict_types=1);
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/sales.php';
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
        if (($_GET['action'] ?? '') === 'eod-preview') quvo_json(['ok'=>true,'totals'=>sales_preview($db)]);
        quvo_json(['ok'=>true,'completed_today'=>dashboard_completed_today($db)]);
    }
    $input = orders_input();
    if (($input['action'] ?? '') !== 'eod') throw new OrderError('Unknown dashboard action.');
    $note = orders_text($input['note'] ?? '', 1000);
    $db->beginTransaction();
    $result = sales_close($db, (int)$actor['staff_id'], $note, $input['submission_key'] ?? null, $input['business_date'] ?? null);
    $db->commit();
    quvo_json(['ok'=>true] + $result);
} catch (Throwable $error) {
    orders_error($db, $error);
}
