<?php
declare(strict_types=1);

// Payment and QR hooks tolerate an older deployment until migration 26 is installed.
function sales_audit_ready(PDO $db): bool {
    return (bool)$db->query("SELECT CASE WHEN OBJECT_ID('dbo.sales_audit_exports','U') IS NOT NULL THEN 1 ELSE 0 END")->fetchColumn();
}
function sales_audit_snapshot_order(PDO $db,int $orderId): void {
    if(!sales_audit_ready($db))return;
    $db->prepare("INSERT dbo.sales_audit_payment_snapshots(payment_id,method_code,method_label,label_basis,qr_version)
        SELECT p.payment_id,p.payment_method,COALESCE(m.display_name,p.payment_method),'captured',r.qr_version
        FROM dbo.payments p LEFT JOIN dbo.online_payment_methods m ON m.payment_method=p.payment_method
        LEFT JOIN dbo.online_payment_receipts r ON r.order_id=p.order_id
        WHERE p.order_id=? AND NOT EXISTS(SELECT 1 FROM dbo.sales_audit_payment_snapshots s WHERE s.payment_id=p.payment_id)")
        ->execute([$orderId]);
}
function sales_audit_method_event(PDO $db,int $actor,string $code,string $action,?array $before=null):void {
    if(!sales_audit_ready($db))return;
    $q=$db->prepare('SELECT m.display_name,CONVERT(varchar(36),q.qr_version) qr_version FROM dbo.online_payment_methods m LEFT JOIN dbo.payment_qr_codes q ON q.payment_method=m.payment_method WHERE m.payment_method=?');
    $q->execute([$code]);$current=$q->fetch();$q->closeCursor();
    $db->prepare('INSERT dbo.sales_audit_method_events(method_code,method_label,action,qr_version,actor_staff_id) VALUES(?,?,?,?,?)')
        ->execute([$code,$current['display_name']??$before['display_name']??$code,$action,$current['qr_version']??$before['qr_version']??null,$actor]);
}
