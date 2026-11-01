<?php
declare(strict_types=1);
function cash_ops_ready(PDO $db):bool {
    return (bool)$db->query("SELECT CASE WHEN OBJECT_ID('dbo.cash_operation_movements','U') IS NOT NULL THEN 1 ELSE 0 END")->fetchColumn();
}
function cash_ops_schema(PDO $db):void {
    if(!cash_ops_ready($db))throw new OrderError('Install database/27_blind_cash_eod.sql before opening the cash drawer.',409,'cash_setup_required');
}
function cash_ops_lock(PDO $db,string $mode='Exclusive'):void {
    if(!$db->inTransaction()||!in_array($mode,['Shared','Exclusive'],true))throw new LogicException('Cash drawer locks require a transaction.');
    $q=$db->prepare("DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource='QuvoSharedCashDrawer',@LockMode=?,@LockOwner='Transaction',@LockTimeout=5000;SELECT @r");$q->execute([$mode]);$r=(int)$q->fetchColumn();$q->closeCursor();
    if($r<0)throw new OrderError('The shared drawer is being updated. Retry this submission.',409,'cash_busy');
}
function cash_ops_active(PDO $db):?array {
    $q=$db->query('SELECT o.*,u.full_name opened_by FROM dbo.cash_operations o JOIN dbo.staff_users u ON u.staff_id=o.opened_by_staff_id WHERE closed_at IS NULL');$r=$q->fetch();$q->closeCursor();return $r?:null;
}
// This is the entire pre-close cashier response: never append sales or expected cash.
function cash_ops_public(?array $op):?array {
    return $op?['operationId'=>(string)$op['operation_id'],'businessDate'=>substr($op['business_date'],0,10),'openedAt'=>$op['opened_at'],'openedBy'=>$op['opened_by'],'openingCash'=>orders_money(orders_cents($op['opening_cash'])),'drawer'=>'Shared cash drawer']:null;
}
function cash_ops_require_open(PDO $db):array {
    cash_ops_schema($db);cash_ops_lock($db,'Shared');$op=cash_ops_active($db);
    if(!$op)throw new OrderError('Open the shared drawer and record the beginning cash fund before accepting payment.',409,'cash_opening_required');
    return $op;
}
function cash_ops_attach(PDO $db,int $orderId,int $operationId):void {
    $db->prepare('INSERT dbo.cash_operation_payments(payment_id,operation_id) SELECT payment_id,? FROM dbo.payments WHERE order_id=?')->execute([$operationId,$orderId]);
}
