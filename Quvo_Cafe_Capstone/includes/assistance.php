<?php
declare(strict_types=1);
require_once __DIR__.'/orders.php';
function assistance_expire(PDO $db, ?int $sessionId=null): void {
    $q=$db->prepare("UPDATE a SET status='expired' FROM dbo.staff_assistance_requests a
        JOIN dbo.customer_sessions s ON s.session_id=a.session_id
        WHERE a.status='pending' AND (a.expires_at<=SYSUTCDATETIME() OR s.status<>'active')".
        ($sessionId===null ? '' : ' AND a.session_id=?'));
    $q->execute($sessionId===null ? [] : [$sessionId]);
}
function assistance_latest(PDO $db,int $sessionId): ?array {
    $q=$db->prepare("SELECT TOP 1 request_id,concern,status,
        CASE WHEN expires_at>SYSUTCDATETIME() THEN CAST(CEILING(DATEDIFF_BIG(millisecond,SYSUTCDATETIME(),expires_at)/1000.0) AS int)
        ELSE 0 END AS remaining_seconds FROM dbo.staff_assistance_requests WHERE session_id=? ORDER BY request_id DESC");
    $q->execute([$sessionId]); return $q->fetch() ?: null;
}
function assistance_request(PDO $db,int $tableId,?string $token,mixed $concern): array {
    dining_table($db,$tableId);
    dining_expire_table($db,$tableId);
    $session=dining_guest_session($db,$tableId,$token);
    if(!$session || $session['status']!=='active') throw new OrderError('An approved dine-in session is required.',403);
    $id=(int)$session['session_id'];
    assistance_expire($db,$id);
    $last=assistance_latest($db,$id);
    // Resolving early does not remove the one-minute cooldown. A retry returns the saved request.
    if($last && (int)$last['remaining_seconds']>0) return $last;
    $concern=orders_text($concern,500);
    if($concern==='') $concern='Staff assistance requested.';
    $db->prepare('INSERT dbo.staff_assistance_requests(session_id,concern) VALUES(?,?)')->execute([$id,$concern]);
    return assistance_latest($db,$id);
}
function assistance_resolve(PDO $db,int $actor,int $requestId): bool {
    $q=$db->prepare('SELECT s.table_id,a.session_id FROM dbo.staff_assistance_requests a JOIN dbo.customer_sessions s ON s.session_id=a.session_id WHERE a.request_id=?');
    $q->execute([$requestId]); $row=$q->fetch();
    if(!$row) throw new OrderError('Request not found.',404);
    dining_table($db,(int)$row['table_id']);
    dining_expire_table($db,(int)$row['table_id']);
    assistance_expire($db,(int)$row['session_id']);
    $q=$db->prepare("UPDATE dbo.staff_assistance_requests SET status='resolved',resolved_by_staff_id=?,resolved_at=SYSUTCDATETIME()
        WHERE request_id=? AND status='pending' AND expires_at>SYSUTCDATETIME()");
    $q->execute([$actor,$requestId]);
    return $q->rowCount()>0;
}
function assistance_list(PDO $db): array {
    return $db->query("SELECT a.request_id,a.concern,s.guest_name,t.table_name,
        CAST(CEILING(DATEDIFF_BIG(millisecond,SYSUTCDATETIME(),a.expires_at)/1000.0) AS int) AS remaining_seconds
        FROM dbo.staff_assistance_requests a JOIN dbo.customer_sessions s ON s.session_id=a.session_id
        JOIN dbo.cafe_tables t ON t.table_id=s.table_id
        WHERE a.status='pending' AND a.expires_at>SYSUTCDATETIME() AND s.status='active'
        ORDER BY a.request_id")->fetchAll();
}
