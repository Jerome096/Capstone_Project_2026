<?php
declare(strict_types=1);
require_once __DIR__ . '/orders.php';

function dashboard_completed_today(PDO $db): int
{
    // The cafe uses Philippine local dates. Count the full database, not one receipt page.
    return (int)$db->query("SELECT COUNT(*) FROM dbo.orders o
        WHERE o.order_status='served'
        AND EXISTS (SELECT 1 FROM dbo.payments p WHERE p.order_id=o.order_id)
        AND CAST(DATEADD(hour,8,o.updated_at) AS date)=CAST(DATEADD(hour,8,SYSUTCDATETIME()) AS date)
        AND NOT EXISTS (SELECT 1 FROM dbo.eod_completed_orders c WHERE c.order_id=o.order_id)")
        ->fetchColumn();
}

// Caller owns the transaction. Snapshot order IDs so timestamp rounding and repeat serving
// cannot make a closed order reappear in the next day's dashboard.
function dashboard_close_completions(PDO $db, int $actor, string $note): array
{
    $note = orders_text($note, 1000);
    $lock = $db->query("DECLARE @result int; EXEC @result=sys.sp_getapplock
        @Resource='QuvoDashboardEod',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;
        SELECT @result");
    $result = (int)$lock->fetchColumn();
    $lock->closeCursor();
    if ($result < 0) throw new OrderError('Another EOD is being saved. Please try again.', 409);
    $q = $db->prepare('INSERT dbo.eod_closures(closed_by_staff_id,note) OUTPUT INSERTED.closure_id VALUES(?,?)');
    $q->execute([$actor, $note]);
    $id = (int)$q->fetchColumn(); $q->closeCursor();
    $q = $db->prepare("INSERT dbo.eod_completed_orders(order_id,closure_id)
        SELECT o.order_id,? FROM dbo.orders o WHERE o.order_status='served'
        AND EXISTS (SELECT 1 FROM dbo.payments p WHERE p.order_id=o.order_id)
        AND NOT EXISTS (SELECT 1 FROM dbo.eod_completed_orders c WHERE c.order_id=o.order_id)");
    $q->execute([$id]);
    return ['closure_id'=>(string)$id, 'completed_today'=>dashboard_completed_today($db)];
}
