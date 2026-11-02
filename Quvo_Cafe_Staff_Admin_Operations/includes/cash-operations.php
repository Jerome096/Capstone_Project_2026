<?php
declare(strict_types=1);
require_once __DIR__.'/sales.php';
require_once __DIR__.'/sales-audit.php';
require_once __DIR__.'/cash-operations-store.php';

function cash_ops_open(PDO $db,array $actor,mixed $amount,mixed $key):array {
    cash_ops_schema($db);inventory_lock($db);cash_ops_lock($db);
    $key=ordering_uuid($key);$cents=orders_cents($amount);$hash=hash('sha256',json_encode([(int)$actor['staff_id'],$cents],JSON_THROW_ON_ERROR));
    $old=audit_read($db,'SELECT *,CONVERT(varchar(64),opening_hash,2) hash FROM dbo.cash_operations WHERE opening_key=?',[$key])[0]??null;
    if($old){if(!hash_equals(strtolower($old['hash']),$hash))throw new OrderError('This opening submission was already used for different details.',409);if($old['closed_at'])throw new OrderError('That operation is already closed. Count the new beginning fund and start a new operation.',409,'cash_opening_closed');return cash_ops_public(cash_ops_active($db));}
    if(cash_ops_active($db))throw new OrderError('Another cashier already opened the shared drawer. Refresh to use that operation.',409,'cash_already_open');
    $hours=operating_hours_context($db);$date=operating_business_date($hours);$start=operating_day_bounds($hours,$date)['startUtc'];
    // Only the first migration-era opening may adopt already-paid, unclosed sales for this business day.
    $first=(int)$db->query('SELECT COUNT(*) FROM dbo.cash_operations')->fetchColumn()===0;
    $coverage=$first?$start:$hours['now']->format('Y-m-d H:i:s.u');
    $q=$db->prepare('INSERT dbo.cash_operations(business_date,coverage_start,opened_by_staff_id,opening_cash,opening_key,opening_hash) OUTPUT INSERTED.operation_id VALUES(?,?,?,?,?,CONVERT(binary(32),?,2))');
    $q->execute([$date,$coverage,$actor['staff_id'],orders_money($cents),$key,$hash]);$id=(int)$q->fetchColumn();$q->closeCursor();
    if($first)$db->prepare('INSERT dbo.cash_operation_payments(payment_id,operation_id) SELECT p.payment_id,? FROM dbo.payments p WHERE p.paid_at>=? AND p.paid_at<=SYSUTCDATETIME() AND NOT EXISTS(SELECT 1 FROM dbo.eod_sales_orders e WHERE e.order_id=p.order_id) AND NOT EXISTS(SELECT 1 FROM dbo.cash_operation_payments c WHERE c.payment_id=p.payment_id)')->execute([$id,$start]);
    $db->prepare("INSERT dbo.system_audit_log(actor_staff_id,action,entity_type,entity_key,details_json) VALUES(?,'cash_drawer_opened','cash_operation',?,?)")->execute([$actor['staff_id'],(string)$id,json_encode(['openingCash'=>orders_money($cents),'legacyAdoption'=>$first],JSON_THROW_ON_ERROR)]);
    return cash_ops_public(cash_ops_active($db));
}
function cash_ops_movements(PDO $db,int $id):array {
    $approvals=(bool)$db->query("SELECT CASE WHEN OBJECT_ID('dbo.cashier_action_approvals','U') IS NULL THEN 0 ELSE 1 END")->fetchColumn();
    return audit_read($db,'SELECT m.movement_id,m.movement_type,m.amount,m.evidence,m.note,m.recorded_at,u.full_name recorded_by'.($approvals?',a.requested_by_name requested_by,a.approved_by_name approved_by,a.approved_at':'')." FROM dbo.cash_operation_movements m JOIN dbo.staff_users u ON u.staff_id=m.recorded_by_staff_id ".($approvals?" LEFT JOIN dbo.cashier_action_approvals a ON a.action='payout' AND a.entity_key=CONVERT(nvarchar(100),m.movement_id) ":'').' WHERE m.operation_id=? ORDER BY m.movement_id',[$id]);
}
function cash_ops_move(PDO $db,array $actor,array $input):array {
    if(($actor['role']??null)!=='admin')throw new OrderError('Only a confirmed admin may authorize cash movements.',403);
    cash_ops_schema($db);inventory_lock($db);cash_ops_lock($db);$key=ordering_uuid($input['requestKey']??null);$id=orders_id($input['operationId']??null);$type=$input['type']??'';
    if(!in_array($type,['cash_in','payout','drop'],true))throw new OrderError('Choose a valid cash movement.');
    $amount=orders_cents($input['amount']??null);if($amount<=0)throw new OrderError('Enter a positive cash amount.');
    $evidence=orders_text($input['evidence']??'',300);$note=orders_text($input['note']??'',1000,true);$hash=hash('sha256',json_encode([$actor['staff_id'],$id,$type,$amount,$evidence,$note],JSON_THROW_ON_ERROR));
    $old=audit_read($db,'SELECT movement_id,CONVERT(varchar(64),request_hash,2) hash FROM dbo.cash_operation_movements WHERE request_key=?',[$key])[0]??null;
    if($old){if(!hash_equals(strtolower($old['hash']),$hash))throw new OrderError('That cash movement submission was already used.',409);return ['movementId'=>(string)$old['movement_id'],'replayed'=>true];}
    $op=cash_ops_active($db);if(!$op||(int)$op['operation_id']!==$id)throw new OrderError('This operation has closed or changed. Refresh before recording cash movements.',409);
    $q=$db->prepare('INSERT dbo.cash_operation_movements(operation_id,movement_type,amount,evidence,note,recorded_by_staff_id,request_key,request_hash) OUTPUT INSERTED.movement_id VALUES(?,?,?,?,?,?,?,CONVERT(binary(32),?,2))');$q->execute([$id,$type,orders_money($amount),$evidence,$note,$actor['staff_id'],$key,$hash]);$new=$q->fetchColumn();$q->closeCursor();return ['movementId'=>(string)$new,'replayed'=>false];
}
function cash_ops_record(PDO $db,int $id,?array $actor=null,bool $confirmed=false):array {
    cash_ops_schema($db);$row=audit_read($db,'SELECT report_json,closed_by_staff_id FROM dbo.cash_operations WHERE operation_id=? AND closed_at IS NOT NULL',[$id])[0]??null;
    if(!$row)throw new OrderError('Saved closing record not found.',404);
    if($actor!==null&&!(($actor['role']==='admin'&&$confirmed)||(int)$actor['staff_id']===(int)$row['closed_by_staff_id']))throw new OrderError('This closing report requires admin access.',403);
    return json_decode($row['report_json'],true,64,JSON_THROW_ON_ERROR);
}
function cash_ops_close(PDO $db,int $actorId,string $note,mixed $key,mixed $operationId,mixed $counted,mixed $businessDate):array {
    cash_ops_schema($db);inventory_lock($db);cash_ops_lock($db);$key=ordering_uuid($key);$id=orders_id($operationId);$amount=orders_cents($counted);$note=orders_text($note,1000);
    $hash=hash('sha256',json_encode([$actorId,$id,$amount,$note,$businessDate],JSON_THROW_ON_ERROR));
    $old=audit_read($db,'SELECT operation_id,closed_by_staff_id,CONVERT(varchar(64),closing_hash,2) hash FROM dbo.cash_operations WHERE closing_key=?',[$key])[0]??null;
    if($old){if(!hash_equals(strtolower($old['hash']),$hash))throw new OrderError('This EOD submission was already used for different details.',409);$saved=cash_ops_record($db,(int)$old['operation_id']);return ['record'=>$saved,'closure_id'=>$saved['closureId'],'completed_today'=>operations_completed_today($db),'replayed'=>true];}
    $op=cash_ops_active($db);if(!$op||(int)$op['operation_id']!==$id)throw new OrderError('The shared drawer was already closed or changed. Reload the closing form.',409,'cash_operation_changed');
    if($businessDate!==null&&$businessDate!==substr($op['business_date'],0,10))throw new OrderError('The opening business date changed. Reload the closing form.',409);
    ordering_pause($db,$actorId,'eod');
    $now=(string)$db->query('SELECT CONVERT(varchar(27),SYSUTCDATETIME(),126)')->fetchColumn();
    $methods=audit_read($db,"SELECT p.payment_method code,COALESCE(s.method_label,m.display_name,p.payment_method) label,SUM(p.amount_applied) amount,COUNT(*) payments FROM dbo.cash_operation_payments cp JOIN dbo.payments p ON p.payment_id=cp.payment_id LEFT JOIN dbo.sales_audit_payment_snapshots s ON s.payment_id=p.payment_id LEFT JOIN dbo.online_payment_methods m ON m.payment_method=p.payment_method WHERE cp.operation_id=? GROUP BY p.payment_method,COALESCE(s.method_label,m.display_name,p.payment_method) ORDER BY label",[$id]);
    $total=0;$cash=0;$paid=0;foreach($methods as &$method){$value=orders_cents($method['amount']);$total+=$value;if($method['code']==='Cash')$cash+=$value;$paid+=(int)$method['payments'];$method['amount']=orders_money($value);$method['payments']=(int)$method['payments'];}unset($method);
    $seen=array_column($methods,'code');foreach(audit_read($db,"SELECT 'Cash' code,N'Cash' label UNION SELECT payment_method,display_name FROM dbo.online_payment_methods WHERE is_active=1") as $method)if(!in_array($method['code'],$seen,true))$methods[]=$method+['amount'=>'0.00','payments'=>0];
    $moves=cash_ops_movements($db,$id);$movementTotals=['cash_in'=>0,'payout'=>0,'drop'=>0];foreach($moves as &$move){$movementTotals[$move['movement_type']]+=orders_cents($move['amount']);$move['amount']=orders_money(orders_cents($move['amount']));}unset($move);
    $expected=orders_cents($op['opening_cash'])+$cash+$movementTotals['cash_in']-$movementTotals['payout']-$movementTotals['drop'];$difference=$amount-$expected;
    $closed=operations_close_completions($db,$actorId,$note);$closureId=(int)$closed['closure_id'];
    $db->prepare('UPDATE dbo.eod_closures SET request_key=?,request_hash=CONVERT(binary(32),?,2),business_date=?,closed_at=? WHERE closure_id=?')->execute([$key,$hash,substr($op['business_date'],0,10),$now,$closureId]);
    $db->prepare("INSERT dbo.eod_sales_orders(order_id,closure_id,amount,payment_method,order_status,entry_type) SELECT p.order_id,?,p.amount_applied,p.payment_method,o.order_status,'payment' FROM dbo.cash_operation_payments cp JOIN dbo.payments p ON p.payment_id=cp.payment_id JOIN dbo.orders o ON o.order_id=p.order_id WHERE cp.operation_id=? AND NOT EXISTS(SELECT 1 FROM dbo.eod_sales_orders e WHERE e.order_id=p.order_id)")->execute([$closureId,$id]);
    $db->prepare("INSERT dbo.eod_sales_orders(order_id,closure_id,amount,payment_method,order_status,entry_type) SELECT o.order_id,?,0,NULL,'cancelled','void' FROM dbo.orders o WHERE o.cancelled_at>=? AND o.cancelled_at<=? AND o.order_status='cancelled' AND NOT EXISTS(SELECT 1 FROM dbo.payments p WHERE p.order_id=o.order_id) AND NOT EXISTS(SELECT 1 FROM dbo.eod_sales_orders e WHERE e.order_id=o.order_id)")->execute([$closureId,$op['coverage_start'],$now]);
    $closer=audit_read($db,'SELECT full_name FROM dbo.staff_users WHERE staff_id=?',[$actorId])[0]['full_name'];
    $report=['version'=>'blind-eod-1','operationId'=>(string)$id,'closureId'=>(string)$closureId,'businessDate'=>substr($op['business_date'],0,10),'drawer'=>'Shared cash drawer','openedAt'=>$op['opened_at'],'coverageStart'=>$op['coverage_start'],'closedAt'=>$now,'openedBy'=>$op['opened_by'],'closedBy'=>$closer,'openingCash'=>orders_money(orders_cents($op['opening_cash'])),'cashSales'=>orders_money($cash),'totalSales'=>orders_money($total),'otherCashIn'=>orders_money($movementTotals['cash_in']),'cashPayouts'=>orders_money($movementTotals['payout']),'cashDrops'=>orders_money($movementTotals['drop']),'expectedCash'=>audit_money($expected),'actualCash'=>orders_money($amount),'cashDifference'=>audit_money($difference),'cashStatus'=>$difference===0?'BALANCED':($difference<0?'SHORT':'OVER'),'methods'=>$methods,'paidOrders'=>$paid,'movements'=>$moves,'note'=>$note,'timezone'=>'Asia/Manila'];
    $db->prepare('UPDATE dbo.cash_operations SET closed_at=?,closed_by_staff_id=?,counted_cash=?,closure_id=?,closing_key=?,closing_hash=CONVERT(binary(32),?,2),report_json=? WHERE operation_id=? AND closed_at IS NULL')->execute([$now,$actorId,orders_money($amount),$closureId,$key,$hash,json_encode($report,JSON_THROW_ON_ERROR),$id]);
    return ['record'=>$report,'closure_id'=>(string)$closureId,'completed_today'=>$closed['completed_today'],'replayed'=>false];
}
function cash_ops_history(PDO $db,array $filters):array {
    cash_ops_schema($db);$where=[];$params=[];
    foreach(['from'=>'>=','to'=>'<='] as $key=>$operator)if(!empty($filters[$key])){$where[]='business_date'.$operator.'?';$params[]=operating_hours_date($filters[$key])->format('Y-m-d');}
    $offset=filter_var($filters['offset']??0,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>1000000]]);if($offset===false)throw new OrderError('Invalid closing-history page.');
    if(!empty($filters['from'])&&!empty($filters['to'])&&$filters['from']>$filters['to'])throw new OrderError('The closing-history end date must follow the start date.');
    $status=$filters['status']??'all';if(!in_array($status,['all','SHORT','OVER','BALANCED'],true))throw new OrderError('Choose a valid cash status.');if($status!=='all'){$where[]="JSON_VALUE(report_json,'$.cashStatus')=?";$params[]=$status;}
    $q=$db->prepare('SELECT operation_id,report_json FROM dbo.cash_operations WHERE closed_at IS NOT NULL'.($where?' AND '.implode(' AND ',$where):'').' ORDER BY operation_id DESC OFFSET ? ROWS FETCH NEXT 26 ROWS ONLY');foreach($params as $i=>$value)$q->bindValue($i+1,$value);$q->bindValue(count($params)+1,$offset,PDO::PARAM_INT);$q->execute();$rows=$q->fetchAll();$q->closeCursor();
    return ['records'=>array_map(fn($r)=>json_decode($r['report_json'],true,64,JSON_THROW_ON_ERROR),array_slice($rows,0,25)),'nextOffset'=>count($rows)>25?$offset+25:null];
}
