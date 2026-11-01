<?php
declare(strict_types=1);
require_once __DIR__.'/reports.php';
require_once __DIR__.'/sales-audit-store.php';

function audit_money(int $cents):string {return ($cents<0?'-':'').orders_money(abs($cents));}
function audit_signed_cents(string $amount):int {if(!preg_match('/\A(-?)([0-9]{1,16})\.([0-9]{2})\z/',$amount,$m))throw new LogicException('Invalid saved financial amount.');return ($m[1]==='-'?-1:1)*((int)$m[2]*100+(int)$m[3]);}
function audit_uuid(mixed $value):string {
    if(!is_string($value)||!preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i',$value))throw new OrderError('A valid submission ID is required.');
    return strtolower($value);
}
function audit_schema(PDO $db):void {
    if(!sales_audit_ready($db))throw new OrderError('Install database/26_sales_audit.sql to enable Sales Audit.',409,'audit_setup_required');
}
function audit_filters(PDO $db,array $input):array {
    $hours=operating_hours_context($db);$today=operating_business_date($hours);
    $from=operating_hours_date($input['from']??$today);$to=operating_hours_date($input['to']??$from->format('Y-m-d'));
    if($to<$from||$from->diff($to)->days>365)throw new OrderError('Choose a date range of up to 366 business dates.');
    $method=orders_text($input['method']??'all',10,true);$source=$input['source']??'all';
    if(!in_array($source,['all','dine_in','online','walk_in'],true))throw new OrderError('Choose a valid ordering source.');
    return ['from'=>$from->format('Y-m-d'),'to'=>$to->format('Y-m-d'),'method'=>$method,'source'=>$source,'search'=>orders_text($input['search']??'',100)];
}
function audit_read(PDO $db,string $sql,array $params=[]):array {$q=$db->prepare($sql);$q->execute($params);$r=$q->fetchAll();$q->closeCursor();return $r;}
function audit_latest(PDO $db,string $type,string $key,bool $lock=false):?array {
    return audit_read($db,'SELECT TOP 1 e.*,u.full_name actor FROM dbo.sales_audit_entries e '.($lock?'WITH(UPDLOCK,HOLDLOCK) ':'').'JOIN dbo.staff_users u ON u.staff_id=e.actor_staff_id WHERE entry_type=? AND record_key=? ORDER BY revision DESC',[$type,$key])[0]??null;
}
function audit_entry_payload(array $row):array {return json_decode($row['payload_json'],true,32,JSON_THROW_ON_ERROR);}
function audit_lock(PDO $db):void {
    $q=$db->query("DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource='QuvoSalesAudit',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;SELECT @r");$r=(int)$q->fetchColumn();$q->closeCursor();
    if($r<0)throw new OrderError('Another audit entry is being saved. Retry this submission.',409);
}
function audit_save(PDO $db,array $actor,array $input):array {
    audit_schema($db);audit_lock($db);$type=$input['type']??'';$p=$input['payload']??null;
    if(!in_array($type,['cash','provider','review'],true)||!is_array($p))throw new OrderError('Choose a valid audit entry.');
    $uuid=audit_uuid($input['requestKey']??null);$date=operating_hours_date($p['date']??null)->format('Y-m-d');
    if($date>operating_business_date(operating_hours_context($db)))throw new OrderError('Evidence cannot be recorded against a future business day.');
    $note=orders_text($p['note']??'',1000,true);$evidence=orders_text($p['evidence']??'',300,true);
    $revision=filter_var($input['revision']??0,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>2147483646]]);
    if($revision===false)throw new OrderError('Invalid revision. Reload the saved entry.');
    $data=['date'=>$date,'note'=>$note,'evidence'=>$evidence];
    if($type==='cash') {
        if(cash_ops_ready($db)&&audit_read($db,'SELECT TOP 1 operation_id FROM dbo.cash_operations WHERE business_date=?',[$date]))throw new OrderError('This date uses shared-drawer operations. Record the locked count through EOD; view closings in Sales history.',409);
        $key=$date;
        foreach(['opening','cashIn','refunds','cashOut','drops','counted'] as $field)$data[$field]=orders_money(orders_cents($p[$field]??null));
        if(orders_cents($data['refunds'])>0)throw new OrderError('Refund entries require an approved refund workflow. Other cash out is reserved for documented non-refund movements.');
    } elseif($type==='provider') {
        $code=orders_text($p['method']??'',10,true);
        if($code==='Cash'||!audit_read($db,'SELECT payment_method FROM dbo.online_payment_methods WHERE payment_method=? UNION SELECT payment_method FROM dbo.payments WHERE payment_method=?',[$code,$code]))throw new OrderError('Choose a configured digital payment method.');
        $account=orders_text($p['account']??'',100,true);$reference=orders_text($p['reference']??'',100,true);
        $data+=['method'=>$code,'account'=>$account,'reference'=>$reference,'paymentId'=>empty($p['paymentId'])?null:orders_id($p['paymentId']),'void'=>($p['void']??false)===true];
        foreach(['gross','fee','settled','pending'] as $field)$data[$field]=orders_money(orders_cents($p[$field]??null));
        if(orders_cents($data['gross'])<=0||orders_cents($data['fee'])>orders_cents($data['gross']))throw new OrderError('Gross must be positive and the provider fee cannot exceed gross. Record actual settled/pending figures; differences will be flagged.');
        $key=hash('sha256',strtolower($code).'|'.strtoupper($account).'|'.strtoupper($reference));
        if($data['paymentId']!==null){
            $payment=audit_read($db,'SELECT p.payment_id,p.payment_method,p.paid_at,p.payment_reference FROM dbo.payments p WHERE payment_id=?',[$data['paymentId']])[0]??null;
            if(!$payment||$payment['payment_method']!==$code)throw new OrderError('The selected payment does not belong to this method.');
            if(operating_business_date(operating_hours_context($db),new DateTimeImmutable($payment['paid_at'],new DateTimeZone('UTC')))!==$date)throw new OrderError('Use the payment business date. Note a later settlement date in the evidence reference.');
            // Corrections remain attributable; a missing/different reference is flagged for review.
            foreach(audit_read($db,"WITH r AS(SELECT *,ROW_NUMBER() OVER(PARTITION BY record_key ORDER BY revision DESC) n FROM dbo.sales_audit_entries WHERE entry_type='provider') SELECT * FROM r WHERE n=1 AND record_key<>?",[$key]) as $entry){$other=audit_entry_payload($entry);if(!($other['void']??false)&&($other['paymentId']??null)===$data['paymentId']&&!$data['void'])throw new OrderError('This payment is already linked to provider evidence. Amend or void that evidence first.',409);}
        }
    } else {
        $key=orders_text($p['exceptionId']??'',64,true);
        if(!preg_match('/\A[0-9a-f]{64}\z/',$key)||!in_array($p['status']??null,['open','reviewed'],true)||!preg_match('/\A[0-9a-f]{64}\z/',$p['fingerprint']??''))throw new OrderError('Reload the exception before reviewing it.');
        $data+=['exceptionId'=>$key,'fingerprint'=>$p['fingerprint'],'status'=>$p['status']];
    }
    $json=json_encode($data,JSON_THROW_ON_ERROR);$hash=hash('sha256',json_encode([$type,$revision,$data],JSON_THROW_ON_ERROR));
    $replay=audit_read($db,'SELECT entry_id,actor_staff_id,CONVERT(varchar(64),request_hash,2) request_hash FROM dbo.sales_audit_entries WHERE request_key=?',[$uuid])[0]??null;
    if($replay){if((int)$replay['actor_staff_id']!==(int)$actor['staff_id']||!hash_equals(strtolower($replay['request_hash']),$hash))throw new OrderError('This submission ID belongs to a different entry.',409);return ['entryId'=>(string)$replay['entry_id'],'replayed'=>true];}
    $old=audit_latest($db,$type,$key,true);
    if((int)($old['revision']??0)!==$revision)throw new OrderError('This entry changed on another device. Reload before saving.',409,'audit_changed');
    if($old&&substr($old['business_date'],0,10)!==$date)throw new OrderError('A provider reference cannot be reassigned to another business date. Amend the original evidence.');
    if($type==='review') {
        $current=audit_report($db,['from'=>$date,'to'=>$date,'method'=>'all','source'=>'all','search'=>'']);$found=null;
        foreach($current['exceptions'] as $finding)if($finding['id']===$key)$found=$finding;
        if(!$found||!hash_equals($found['fingerprint'],$data['fingerprint']))throw new OrderError('This exception changed. Refresh the audit before reviewing it.',409);
    }
    $q=$db->prepare('INSERT dbo.sales_audit_entries(entry_type,record_key,business_date,revision,payload_json,actor_staff_id,request_key,request_hash) OUTPUT INSERTED.entry_id VALUES(?,?,?,?,?,?,?,CONVERT(binary(32),?,2))');
    $q->execute([$type,$key,$date,$revision+1,$json,$actor['staff_id'],$uuid,$hash]);$id=$q->fetchColumn();$q->closeCursor();return ['entryId'=>(string)$id,'replayed'=>false];
}
function audit_report(PDO $db,array $input):array {
    audit_schema($db);$filters=audit_filters($db,$input);$hours=operating_hours_context($db);
    $start=operating_day_bounds($hours,$filters['from'])['startUtc'];$end=operating_day_bounds($hours,$filters['to'])['endUtc'];
    $now=str_replace('T',' ',(string)$db->query('SELECT CONVERT(varchar(27),SYSUTCDATETIME(),126)')->fetchColumn());$cutoff=min($end,$now);
    $methods=audit_read($db,"SELECT code,MAX(label) label,MAX(active) active FROM (
        SELECT 'Cash' code,N'Cash' label,1 active UNION ALL SELECT payment_method,display_name,CAST(is_active AS int) FROM dbo.online_payment_methods
        UNION ALL SELECT payment_method,payment_method,0 FROM dbo.payments WHERE payment_method NOT IN(SELECT payment_method FROM dbo.online_payment_methods)
        ) m GROUP BY code ORDER BY label");
    if($filters['method']!=='all'&&!in_array($filters['method'],array_column($methods,'code'),true))throw new OrderError('Choose a payment method from the audit list.');
    $cashSupport=cash_ops_ready($db);
    $orders=audit_read($db,"SELECT TOP 10001 ".($cashSupport?'cop.operation_id cash_operation_id,':'CAST(NULL AS bigint) cash_operation_id,')."o.order_id,o.order_number,o.order_source,o.created_at,o.updated_at,o.total_amount,o.cancelled_at,o.cancellation_reason,
        CASE WHEN h.to_status IS NOT NULL THEN h.to_status WHEN o.updated_at<=? THEN o.order_status ELSE 'unknown' END audit_status,
        CASE WHEN h.to_status IS NOT NULL THEN 'status history' WHEN o.updated_at<=? THEN 'current record at cutoff' ELSE 'history unavailable' END status_basis,
        served.served_at,p.payment_id,p.payment_method,p.amount_applied,p.amount_received,p.change_amount,p.payment_reference,p.paid_at,
        COALESCE(s.method_label,m.display_name,p.payment_method) method_label,COALESCE(s.label_basis,'unavailable') label_basis,
        CONVERT(varchar(36),s.qr_version) qr_version,u.full_name approved_by,items.item_total,COALESCE(duplicates.n,0) duplicate_references,e.closure_id,
        e.amount eod_amount,e.payment_method eod_method,e.entry_type eod_entry_type,ec.closed_at eod_closed_at,closer.full_name eod_closed_by,
        COALESCE(p.paid_at,CASE WHEN o.cancelled_at<? THEN o.cancelled_at END,o.created_at) event_at
        FROM dbo.orders o LEFT JOIN dbo.payments p ON p.order_id=o.order_id AND p.paid_at<?
        LEFT JOIN dbo.sales_audit_payment_snapshots s ON s.payment_id=p.payment_id
        LEFT JOIN dbo.online_payment_methods m ON m.payment_method=p.payment_method
        LEFT JOIN dbo.staff_users u ON u.staff_id=p.received_by_staff_id
        OUTER APPLY(SELECT TOP 1 to_status FROM dbo.order_status_history WHERE order_id=o.order_id AND changed_at<? ORDER BY changed_at DESC,status_history_id DESC) h
        OUTER APPLY(SELECT MAX(changed_at) served_at FROM dbo.order_status_history WHERE order_id=o.order_id AND to_status='served' AND changed_at<?) served
        OUTER APPLY(SELECT SUM(line_total) item_total FROM dbo.order_items WHERE order_id=o.order_id) items
        OUTER APPLY(SELECT COUNT(*) n FROM dbo.payments x WHERE x.payment_method=p.payment_method AND p.payment_reference IS NOT NULL AND LOWER(LTRIM(RTRIM(x.payment_reference)))=LOWER(LTRIM(RTRIM(p.payment_reference))) AND x.paid_at<?) duplicates
        LEFT JOIN dbo.eod_sales_orders e ON e.order_id=o.order_id
        LEFT JOIN dbo.eod_closures ec ON ec.closure_id=e.closure_id LEFT JOIN dbo.staff_users closer ON closer.staff_id=ec.closed_by_staff_id
        ".($cashSupport?'LEFT JOIN dbo.cash_operation_payments cop ON cop.payment_id=p.payment_id':'')."
        WHERE (p.paid_at>=? AND p.paid_at<?) OR (p.payment_id IS NULL AND ((o.created_at>=? AND o.created_at<?) OR(o.cancelled_at>=? AND o.cancelled_at<?)))
        ORDER BY o.order_id",[$cutoff,$cutoff,$cutoff,$cutoff,$cutoff,$cutoff,$cutoff,$start,$cutoff,$start,$cutoff,$start,$cutoff]);
    if(count($orders)>10000)throw new OrderError('More than 10,000 orders match. Choose a shorter date range to export the complete result.',413);
    $entries=audit_read($db,'SELECT TOP 20001 e.*,u.full_name actor FROM dbo.sales_audit_entries e JOIN dbo.staff_users u ON u.staff_id=e.actor_staff_id WHERE business_date>=? AND business_date<=? ORDER BY entry_id',[$filters['from'],$filters['to']]);
    if(count($entries)>20000)throw new OrderError('Too many evidence revisions for one export. Choose a shorter date range.',413);
    $latest=[];foreach($entries as &$entry){unset($entry['request_hash'],$entry['request_key']);$entry['payload']=audit_entry_payload($entry);$latest[$entry['entry_type']][$entry['record_key']]=$entry;}unset($entry);
    $cashTotals=[];$cashLinked=[];$allPaymentIds=[];
    foreach($orders as &$o){
        $o['business_date']=operating_business_date($hours,new DateTimeImmutable($o['event_at'],new DateTimeZone('UTC')));
        foreach(['total_amount','amount_applied','amount_received','change_amount','item_total'] as $field)$o[$field]=orders_money(orders_cents($o[$field]??'0'));
        $o['order_id']=(string)$o['order_id'];$o['payment_id']=$o['payment_id']!==null?(string)$o['payment_id']:null;
        if($o['payment_id'])$allPaymentIds[$o['payment_id']]=true;
        if($o['payment_method']==='Cash'){$cashTotals[$o['business_date']]=($cashTotals[$o['business_date']]??0)+orders_cents($o['amount_applied']);if($o['cash_operation_id'])$cashLinked[$o['business_date']]=($cashLinked[$o['business_date']]??0)+orders_cents($o['amount_applied']);}
    }unset($o);
    $orders=array_values(array_filter($orders,function($o)use($filters){return ($filters['method']==='all'||$o['payment_method']===$filters['method'])&&($filters['source']==='all'||$o['order_source']===$filters['source'])&&($filters['search']===''||stripos(implode(' ',[$o['order_number'],$o['payment_reference']??'',$o['approved_by']??'',$o['method_label']??'']),$filters['search'])!==false);}));
    $byPayment=[];$selectedIds=[];$summary=['collections'=>0,'paidOrders'=>0,'paidServed'=>0,'awaitingFulfillment'=>0,'unpaid'=>0,'cancelledUnpaid'=>0,'itemDifferences'=>0];$breakdown=[];$exceptions=[];
    $add=function(string $type,string $key,string $date,string $label,int $amount,string $detail,mixed $state=null)use(&$exceptions,$latest):void{
        $id=hash('sha256',$type.'|'.$key);$fingerprint=hash('sha256',json_encode([$type,$key,$amount,$detail,$state],JSON_THROW_ON_ERROR));$review=$latest['review'][$id]??null;$payload=$review['payload']??null;
        $exceptions[]=['id'=>$id,'fingerprint'=>$fingerprint,'date'=>$date,'type'=>$type,'record'=>$key,'label'=>$label,'amount'=>audit_money($amount),'detail'=>$detail,'reviewStatus'=>$payload&&hash_equals($payload['fingerprint'],$fingerprint)?$payload['status']:'open','review'=>$review];
    };
    foreach($orders as $o){
        $selectedIds[$o['order_id']]=true;$amount=orders_cents($o['amount_applied']);$date=$o['business_date'];
        $diff=orders_cents($o['item_total'])-orders_cents($o['total_amount']);
        if($diff){$summary['itemDifferences']++;$add('item_math',$o['order_number'],$date,'Item/order arithmetic difference',$diff,'Item snapshots do not total the order value.');}
        if(!$o['payment_id']){$key=$o['audit_status']==='cancelled'?'cancelledUnpaid':'unpaid';$summary[$key]+=orders_cents($o['total_amount']);continue;}
        $byPayment[$o['payment_id']]=$o;$summary['collections']+=$amount;$summary['paidOrders']++;
        if($o['audit_status']==='served')$summary['paidServed']+=$amount;else{$summary['awaitingFulfillment']+=$amount;$add('fulfillment',$o['order_number'],$date,'Paid / fulfillment review',$amount,'Status at cutoff: '.$o['audit_status'].' ('.$o['status_basis'].').');}
        $code=$o['payment_method'];$breakdown[$code]??=['code'=>$code,'label'=>$o['method_label'],'amount'=>0,'count'=>0];$breakdown[$code]['amount']+=$amount;$breakdown[$code]['count']++;
        if(!$o['closure_id'])$add('eod',$o['order_number'],$date,'Not included in an EOD closure',$amount,'Approved payment has no EOD snapshot membership yet.');
        elseif(orders_cents($o['eod_amount']??'0')!==$amount||$o['eod_method']!==$o['payment_method']||$o['eod_entry_type']!=='payment')$add('eod_difference',$o['order_number'],$date,'EOD snapshot differs from payment',orders_cents($o['eod_amount']??'0')-$amount,'Compare the saved EOD amount, method and entry type with the approved payment.');
        if($code!=='Cash'){
            if(trim($o['payment_reference']??'')==='')$add('reference',$o['order_number'],$date,'Missing digital reference',$amount,'Record verified provider evidence and its merchant reference.');
            if((int)$o['duplicate_references']>1)$add('duplicate',$o['order_number'],$date,'Repeated system payment reference',$amount,'Same method/reference appears on '.$o['duplicate_references'].' system payments. Verify merchant account and independent credits.');
        }
    }
    $digital=[];$linked=[];
    foreach($latest['provider']??[] as $key=>$entry){
        $p=$entry['payload'];
        if($filters['method']!=='all'&&$filters['method']!==$p['method'])continue;
        $payment=$p['paymentId']!==null?($byPayment[(string)$p['paymentId']]??null):null;
        if(($filters['source']!=='all'||$filters['search']!=='')&&!$payment)continue;
        if($p['paymentId']!==null&&!$payment&&isset($allPaymentIds[(string)$p['paymentId']]))continue;
        if($p['void']){$entry['orderNumber']=$payment['order_number']??null;$entry['grossDifference']=null;$entry['settlementDifference']='0.00';$entry['voided']=true;$digital[]=$entry;continue;}
        $gross=orders_cents($p['gross']);$fee=orders_cents($p['fee']);$settlement=orders_cents($p['settled'])+orders_cents($p['pending'])-($gross-$fee);
        $difference=$payment?$gross-orders_cents($payment['amount_applied']):null;
        if($payment)$linked[$payment['payment_id']]=true;
        $entry['orderNumber']=$payment['order_number']??null;$entry['grossDifference']=$difference===null?null:audit_money($difference);$entry['settlementDifference']=audit_money($settlement);$digital[]=$entry;
        if(!$payment)$add('unmatched_provider',$key,$p['date'],'Unmatched provider credit',$gross,'Independent evidence is not linked to a payment in this collection population.',$entry['revision']);
        else {
            if($difference)$add('provider_amount',$payment['order_number'],$p['date'],'Provider gross differs from collection',$difference,'Provider gross less the system collection.',$entry['revision']);
            if(strcasecmp(trim($payment['payment_reference']??''),trim($p['reference']))!==0)$add('provider_reference',$payment['order_number'],$p['date'],'Provider reference needs verification',$gross,'System reference and manually linked evidence reference differ.',$entry['revision']);
        }
        if($settlement)$add('settlement',$key,$p['date'],'Provider settlement difference',$settlement,'Settled plus documented pending less provider net.',$entry['revision']);
    }
    foreach($byPayment as $id=>$o)if($o['payment_method']!=='Cash'&&!isset($linked[$id]))$add('no_evidence',$o['order_number'],$o['business_date'],'No linked provider evidence',orders_cents($o['amount_applied']),'Cashier approval is recorded; independent credit verification is still required.');
    $cash=[];$cashComparable=$filters['source']==='all'&&$filters['search']===''&&in_array($filters['method'],['all','Cash'],true);
    $cashOperations=[];
    if($cashSupport){$closedOps=audit_read($db,'SELECT TOP 1001 report_json FROM dbo.cash_operations WHERE closed_at IS NOT NULL AND business_date>=? AND business_date<=? ORDER BY operation_id',[$filters['from'],$filters['to']]);if(count($closedOps)>1000)throw new OrderError('Choose a shorter period to export all cash operations.',413);foreach($closedOps as $row){$op=json_decode($row['report_json'],true,64,JSON_THROW_ON_ERROR);$cashOperations[]=$op;if($cashComparable&&$op['cashStatus']!=='BALANCED')$add('cash_operation','OP-'.$op['operationId'],$op['businessDate'],'EOD cash '.$op['cashStatus'],audit_signed_cents($op['cashDifference']),'Locked physical declaration compared with the operation opening fund, cash collections and authorized movements.',$op['closureId']);}}
    $cashDates=array_unique(array_merge(array_keys($cashTotals),array_map(fn($r)=>$r['payload']['date'],$latest['cash']??[])));sort($cashDates);
    foreach($cashDates as $date){
        $entry=$latest['cash'][$date]??null;$collection=$cashTotals[$date]??0;$viaEod=$collection>0&&($cashLinked[$date]??0)===$collection;if($viaEod)$entry=null;$p=$entry['payload']??null;$expected=null;$variance=null;
        if($p){$expected=orders_cents($p['opening'])+$collection+orders_cents($p['cashIn'])-orders_cents($p['refunds'])-orders_cents($p['cashOut'])-orders_cents($p['drops']);$variance=orders_cents($p['counted'])-$expected;
            if($variance&&$cashComparable)$add('cash_difference',$date,$date,'Cash over / (short)',$variance,'Physical count less expected store-wide cash.',$entry['revision']);
        }elseif($collection&&$cashComparable&&!$viaEod)$add('cash_missing',$date,$date,'Physical cash count not recorded',$collection,'Enter opening float, cash movements and physical count to reconcile this day.');
        $cash[]=['date'=>$date,'collection'=>orders_money($collection),'expected'=>$expected===null?null:audit_money($expected),'variance'=>$variance===null?null:audit_money($variance),'entry'=>$entry,'comparable'=>$cashComparable,'viaEod'=>$viaEod];
    }
    $items=[];
    if($selectedIds){$rows=audit_read($db,"SELECT TOP 100001 i.*,o.order_number FROM dbo.order_items i JOIN dbo.orders o ON o.order_id=i.order_id WHERE EXISTS(SELECT 1 FROM dbo.orders selected LEFT JOIN dbo.payments p ON p.order_id=selected.order_id AND p.paid_at<? WHERE selected.order_id=i.order_id AND ((p.paid_at>=? AND p.paid_at<?) OR(p.payment_id IS NULL AND ((selected.created_at>=? AND selected.created_at<?) OR(selected.cancelled_at>=? AND selected.cancelled_at<?))))) ORDER BY i.order_id,i.line_number",[$cutoff,$start,$cutoff,$start,$cutoff,$start,$cutoff]);
        foreach($rows as $row)if(isset($selectedIds[(string)$row['order_id']]))$items[]=$row;
        if(count($rows)>100000)throw new OrderError('Too many item lines. Choose a shorter export period.',413);
    }
    foreach($summary as $key=>$value)if(!in_array($key,['paidOrders','itemDifferences'],true))$summary[$key]=audit_money($value);
    foreach($breakdown as &$row)$row['amount']=orders_money($row['amount']);unset($row);
    $events=audit_read($db,'SELECT TOP 1001 e.*,u.full_name actor FROM dbo.sales_audit_method_events e JOIN dbo.staff_users u ON u.staff_id=e.actor_staff_id WHERE occurred_at>=? AND occurred_at<? ORDER BY event_id',[$start,$cutoff]);
    if(count($events)>1000)throw new OrderError('Choose a shorter period to include all payment-configuration events.',413);
    $exports=audit_read($db,'SELECT TOP 20 CONVERT(varchar(36),export_id) id,e.created_at,file_hash,filters_json,u.full_name actor FROM dbo.sales_audit_exports e JOIN dbo.staff_users u ON u.staff_id=e.actor_staff_id ORDER BY e.created_at DESC');
    $actionApprovals=[];
    if((bool)$db->query("SELECT CASE WHEN OBJECT_ID('dbo.cashier_action_approvals','U') IS NULL THEN 0 ELSE 1 END")->fetchColumn()){
        $actionApprovals=audit_read($db,'SELECT TOP 10001 approval_id,action,entity_key,requested_by_name,approved_by_name,approved_at,details_json FROM dbo.cashier_action_approvals WHERE approved_at>=? AND approved_at<? ORDER BY approval_id',[$start,$cutoff]);
        if(count($actionApprovals)>10000)throw new OrderError('Choose a shorter period to export all admin approvals.',413);
    }
    return ['filters'=>$filters,'window'=>['start'=>$start,'end'=>$end,'cutoff'=>$cutoff,'snapshotAt'=>$now,'timezone'=>'Asia/Manila','basis'=>'Confirmed collections by payment time; unpaid/cancelled by creation/cancellation time. Status is evaluated at cutoff where history exists. Evidence revisions reflect the export snapshot time.'],'methods'=>$methods,'summary'=>$summary,'breakdown'=>array_values($breakdown),'orders'=>$orders,'items'=>$items,'cash'=>$cash,'cashOperations'=>$cashOperations,'actionApprovals'=>$actionApprovals,'digital'=>$digital,'exceptions'=>$exceptions,'history'=>$entries,'methodEvents'=>$events,'exports'=>$exports,'counts'=>['orders'=>count($orders),'items'=>count($items),'exceptions'=>count($exceptions)],'cautions'=>['Historical payment names marked backfilled use the name available at migration, not a reconstructed past name.','Manual provider entries are evidence supplied by the reviewer; the system does not independently access bank or wallet accounts.','Unpaid cancellations are not refunds. Paid collections do not by themselves establish earned revenue.','Archived/reset historical records may be incomplete. A review status does not remove an exception or change a confirmed payment.']];
}
