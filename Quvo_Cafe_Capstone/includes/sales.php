<?php
declare(strict_types=1);
require_once __DIR__.'/dashboard.php';
function sales_fields(string $alias='s'):string {
    return "COALESCE(SUM($alias.amount),0) totalSales,
        COALESCE(SUM(CASE WHEN $alias.payment_method='Cash' THEN $alias.amount ELSE 0 END),0) cashSales,
        COALESCE(SUM(CASE WHEN $alias.payment_method='GCash' THEN $alias.amount ELSE 0 END),0) gcashSales,
        COALESCE(SUM(CASE WHEN $alias.payment_method='PayMaya' THEN $alias.amount ELSE 0 END),0) paymayaSales,
        COALESCE(SUM(CASE WHEN $alias.payment_method NOT IN ('Cash','GCash','PayMaya') THEN $alias.amount ELSE 0 END),0) otherSales,
        COALESCE(SUM(CASE WHEN $alias.entry_type='payment' THEN 1 ELSE 0 END),0) totalOrders,
        COALESCE(SUM(CASE WHEN $alias.entry_type='payment' AND $alias.order_status='served' THEN 1 ELSE 0 END),0) servedOrders,
        COALESCE(SUM(CASE WHEN $alias.entry_type='void' THEN 1 ELSE 0 END),0) voidedOrders";
}
function sales_public(array $row):array {
    foreach(['totalSales','cashSales','gcashSales','paymayaSales','otherSales'] as $field)$row[$field]=orders_money(orders_cents($row[$field]));
    foreach(['totalOrders','servedOrders','voidedOrders','eodCount'] as $field)if(isset($row[$field]))$row[$field]=(int)$row[$field];
    $row['averageOrderValue']=orders_money($row['totalOrders']?(int)round(orders_cents($row['totalSales'])/$row['totalOrders']):0);
    return $row;
}
function sales_business_date(PDO $db):string {
    return (string)$db->query("SELECT CONVERT(char(10),DATEADD(hour,8,SYSUTCDATETIME()),23)")->fetchColumn();
}
function sales_pending_sql(string $date):string {
    if(!preg_match('/\A[0-9]{4}-[0-9]{2}-[0-9]{2}\z/',$date))throw new OrderError('Invalid operation date.');
    $start="DATEADD(hour,-8,CAST('$date' AS datetime2))";$end="DATEADD(day,1,$start)";
    return "SELECT o.order_id,p.amount_applied amount,p.payment_method,o.order_status,'payment' entry_type FROM dbo.payments p JOIN dbo.orders o ON o.order_id=p.order_id WHERE p.paid_at >= $start AND p.paid_at < $end AND NOT EXISTS(SELECT 1 FROM dbo.eod_sales_orders e WHERE e.order_id=o.order_id)
        UNION ALL SELECT o.order_id,CAST(0 AS decimal(12,2)),NULL,o.order_status,'void' FROM dbo.orders o WHERE o.order_status='cancelled' AND COALESCE(o.cancelled_at,o.updated_at) >= $start AND COALESCE(o.cancelled_at,o.updated_at) < $end AND NOT EXISTS(SELECT 1 FROM dbo.eod_sales_orders e WHERE e.order_id=o.order_id) AND NOT EXISTS(SELECT 1 FROM dbo.payments p WHERE p.order_id=o.order_id)";
}
function sales_preview(PDO $db):array {
    $date=sales_business_date($db);$row=$db->query('SELECT '.sales_fields().' FROM ('.sales_pending_sql($date).') s')->fetch();
    $row=sales_public($row);$row['businessDate']=$date;$row['activeOrders']=(int)$db->query("SELECT COUNT(*) FROM dbo.orders WHERE order_status IN ('received','preparing','ready')")->fetchColumn();return $row;
}
function sales_record(PDO $db,int $id):array {
    $q=$db->prepare("SELECT c.closure_id id,CONVERT(char(10),COALESCE(c.business_date,CAST(DATEADD(hour,8,c.closed_at) AS date)),23) date,c.closed_at closedAt,c.note,u.full_name closedBy,".sales_fields()." FROM dbo.eod_closures c JOIN dbo.staff_users u ON u.staff_id=c.closed_by_staff_id LEFT JOIN dbo.eod_sales_orders s ON s.closure_id=c.closure_id WHERE c.closure_id=? GROUP BY c.closure_id,c.closed_at,c.business_date,c.note,u.full_name");$q->execute([$id]);$row=$q->fetch();$q->closeCursor();if(!$row)throw new OrderError('EOD record not found.',404);$row['id']=(string)$row['id'];return sales_public($row);
}
function sales_close(PDO $db,int $actor,string $note,mixed $key,mixed $requestedDate=null):array {
    $note=orders_text($note,1000);
    if(!is_string($key)||!preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i',$key))throw new OrderError('A valid EOD submission key is required.');
    $hash=hash('sha256',$note);
    $q=$db->query("DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource='QuvoDashboardEod',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;SELECT @r");$lock=(int)$q->fetchColumn();$q->closeCursor();if($lock<0)throw new OrderError('Another EOD is being saved. Retry this confirmation.',409);
    $q=$db->prepare('SELECT closure_id,CONVERT(varchar(64),request_hash,2) request_hash FROM dbo.eod_closures WHERE closed_by_staff_id=? AND request_key=?');$q->execute([$actor,$key]);$old=$q->fetch();$q->closeCursor();
    if($old){if(!hash_equals(strtolower($old['request_hash']),$hash))throw new OrderError('This EOD key was used for another closing note.',409);return ['record'=>sales_record($db,(int)$old['closure_id']),'closure_id'=>(string)$old['closure_id'],'completed_today'=>dashboard_completed_today($db),'replayed'=>true];}
    $date=sales_business_date($db);
    if($requestedDate!==null&&$requestedDate!==$date)throw new OrderError('The operation date changed. Reopen EOD to review today’s figures.',422);
    ordering_pause($db,$actor,'eod');
    $closed=dashboard_close_completions($db,$actor,$note,$date);$id=(int)$closed['closure_id'];
    $db->prepare('UPDATE dbo.eod_closures SET request_key=?,request_hash=CONVERT(binary(32),?,2),business_date=? WHERE closure_id=?')->execute([$key,$hash,$date,$id]);
    $db->prepare('INSERT dbo.eod_sales_orders(order_id,closure_id,amount,payment_method,order_status,entry_type) SELECT s.order_id,?,s.amount,s.payment_method,s.order_status,s.entry_type FROM ('.sales_pending_sql($date).') s')->execute([$id]);
    return $closed+['record'=>sales_record($db,$id),'replayed'=>false];
}
function sales_history(PDO $db,mixed $view='daily',mixed $offset=0):array {
    if(!is_string($view)||!in_array($view,['daily','monthly','yearly'],true))throw new OrderError('Choose daily, monthly or yearly.');
    $offset=filter_var($offset,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>1000000]]);if($offset===false)throw new OrderError('Invalid history page.');
    $length=$view==='daily'?10:($view==='monthly'?7:4);$period="LEFT(CONVERT(char(10),COALESCE(c.business_date,CAST(DATEADD(hour,8,c.closed_at) AS date)),23),$length)";
    $q=$db->prepare("SELECT $period period,COUNT(DISTINCT c.closure_id) eodCount,".sales_fields()." FROM dbo.eod_closures c LEFT JOIN dbo.eod_sales_orders s ON s.closure_id=c.closure_id GROUP BY $period ORDER BY period DESC OFFSET ? ROWS FETCH NEXT 51 ROWS ONLY");$q->bindValue(1,$offset,PDO::PARAM_INT);$q->execute();$rows=$q->fetchAll();$q->closeCursor();$more=count($rows)>50;$rows=array_map('sales_public',array_slice($rows,0,50));
    // Header cards show actual approved payments, including sales not yet closed by EOD.
    $date="CAST(DATEADD(hour,8,p.paid_at) AS date)";$today="CAST(DATEADD(hour,8,SYSUTCDATETIME()) AS date)";
    $summary=$db->query("SELECT COALESCE(SUM(CASE WHEN $date=$today THEN p.amount_applied ELSE 0 END),0) today,COALESCE(SUM(CASE WHEN YEAR($date)=YEAR($today) AND MONTH($date)=MONTH($today) THEN p.amount_applied ELSE 0 END),0) month,COALESCE(SUM(CASE WHEN YEAR($date)=YEAR($today) THEN p.amount_applied ELSE 0 END),0) year FROM dbo.payments p")->fetch();
    foreach($summary as &$value)$value=orders_money(orders_cents($value));unset($value);$summary['eodCount']=(int)$db->query('SELECT COUNT(*) FROM dbo.eod_closures')->fetchColumn();
    return ['rows'=>$rows,'summary'=>$summary,'next_offset'=>$more?$offset+50:null,'view'=>$view];
}
