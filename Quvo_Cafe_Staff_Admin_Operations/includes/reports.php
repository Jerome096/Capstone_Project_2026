<?php
declare(strict_types=1);
require_once __DIR__.'/sales.php';
function reports_access(?array $actor,bool $confirmed):void {
    if(!$actor)throw new OrderError('Please sign in again.',401);
    if($actor['role']!=='admin'||!$confirmed)throw new OrderError('Confirmed admin access is required.',403);
}
function reports_range(mixed $period,mixed $date,?array $hours=null):array {
    if(!is_string($period)||!in_array($period,['daily','monthly','yearly'],true))throw new OrderError('Choose Daily, Monthly or Yearly.');
    [$format,$pattern,$increment]=match($period){
        'daily'=>['Y-m-d','/\A[0-9]{4}-[0-9]{2}-[0-9]{2}\z/','+1 day'],
        'monthly'=>['Y-m','/\A[0-9]{4}-[0-9]{2}\z/','+1 month'],
        'yearly'=>['Y','/\A[0-9]{4}\z/','+1 year'],
    };
    if(!is_string($date)||!preg_match($pattern,$date))throw new OrderError('Choose a valid report date, month or year.');
    $start=DateTimeImmutable::createFromFormat('!'.$format,$date,new DateTimeZone('Asia/Manila'));
    if(!$start||$start->format($format)!==$date||(int)$start->format('Y')<1||(int)$start->format('Y')>9998)throw new OrderError('Choose a valid report date, month or year.');
    $end=$start->modify($increment);
    if($hours!==null){
        $opening=operating_hours_for_date($hours,$start->format('Y-m-d'))['openingMinute'];
        $nextOpening=operating_hours_for_date($hours,$end->format('Y-m-d'))['openingMinute'];
        $start=$start->modify('+'.$opening.' minutes');$end=$end->modify('+'.$nextOpening.' minutes');
    }
    if((int)$start->setTimezone(new DateTimeZone('UTC'))->format('Y')<1)throw new OrderError('Choose a report period within the supported calendar.');
    return ['period'=>$period,'date'=>$date,'start'=>$start,'end'=>$end,'params'=>[
        $start->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),
        $end->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),
    ]];
}
function reports_daily(PDO $db,mixed $date=null):array {
    return reports_period($db,'daily',$date);
}
function reports_previous_range(array $selection,array $hours):?array {
    $period=$selection['period'];
    $previous=$selection['start']->setTime(0,0)->modify(match($period){'daily'=>'-1 day','monthly'=>'-1 month','yearly'=>'-1 year'});
    $date=$previous->format(match($period){'daily'=>'Y-m-d','monthly'=>'Y-m','yearly'=>'Y'});
    try{return reports_range($period,$date,$hours);}catch(OrderError){return null;}
}
// Both periods use the same summary definitions and their own saved opening hours.
function reports_summary(PDO $db,array $selection,array $hours):array {
    $params=$selection['params'];$period=$selection['period'];
    $rule=operating_hours_for_date($hours,$selection['start']->format('Y-m-d'));
    $dayWindow=operating_day_bounds($hours,$selection['start']->format('Y-m-d'));
    $read=function(string $sql)use($db,$params){$q=$db->prepare($sql);$q->execute($params);$rows=$q->fetchAll();$q->closeCursor();return $rows;};
    $range=fn(string $column)=>"$column>=? AND $column<?";
    $paidWhere=$range('p.paid_at');$createdWhere=$range('o.created_at');$servedWhere=$range('o.updated_at');$voidWhere=$range('COALESCE(o.cancelled_at,o.updated_at)');
    $outside=$period==='daily'&&!$rule['legacy']?"COALESCE(SUM(CASE WHEN p.paid_at>=CAST('".$dayWindow['closeUtc']."' AS datetime2) THEN 1 ELSE 0 END),0)":"0";
    $summary=$read("SELECT COUNT(*) paidOrders,COALESCE(SUM(p.amount_applied),0) totalRevenue,$outside outsideHoursOrders FROM dbo.payments p WHERE $paidWhere")[0];
    $summary['outsideHoursOrders']=(int)$summary['outsideHoursOrders'];
    $summary['paidOrders']=(int)$summary['paidOrders'];$summary['totalRevenue']=orders_money(orders_cents($summary['totalRevenue']));$summary['averageOrderValue']=orders_money($summary['paidOrders']?(int)round(orders_cents($summary['totalRevenue'])/$summary['paidOrders']):0);
    $placed=$read("SELECT COUNT(*) ordersPlaced,COALESCE(SUM(CASE WHEN o.order_status='received' AND p.payment_id IS NULL THEN 1 ELSE 0 END),0) unpaidOrders FROM dbo.orders o LEFT JOIN dbo.payments p ON p.order_id=o.order_id WHERE $createdWhere")[0];
    $summary['ordersPlaced']=(int)$placed['ordersPlaced'];$summary['unpaidOrders']=(int)$placed['unpaidOrders'];
    $summary['completedOrders']=(int)$read("SELECT COUNT(*) n FROM dbo.orders o WHERE o.order_status='served' AND $servedWhere AND EXISTS(SELECT 1 FROM dbo.payments p WHERE p.order_id=o.order_id)")[0]['n'];
    $summary['voidedOrders']=(int)$read("SELECT COUNT(*) n FROM dbo.orders o WHERE o.order_status='cancelled' AND $voidWhere")[0]['n'];
    return $summary;
}
function reports_comparison(PDO $db,array $selection,array $hours):?array {
    $previous=reports_previous_range($selection,$hours);if(!$previous)return null;
    $summary=reports_summary($db,$previous,$hours);$now=new DateTimeImmutable('now',new DateTimeZone('UTC'));
    return ['period'=>$previous['period'],'date'=>$previous['date'],'summary'=>$summary,
        'hasActivity'=>($summary['paidOrders']+$summary['ordersPlaced']+$summary['completedOrders']+$summary['voidedOrders'])>0,
        'outsideHoursComparable'=>!operating_hours_for_date($hours,$previous['start']->format('Y-m-d'))['legacy']&&!operating_hours_for_date($hours,$selection['start']->format('Y-m-d'))['legacy'],
        'selectedStatus'=>$now<$selection['start']?'upcoming':($now<$selection['end']?'in_progress':'complete'),
        'windowStart'=>$previous['params'][0],'windowEnd'=>$previous['params'][1]];
}
function reports_period(PDO $db,mixed $period='daily',mixed $date=null):array {
    $hours=operating_hours_context($db);
    if($date===null){
        $today=operating_business_date($hours);
        $date=match($period){'daily'=>$today,'monthly'=>substr($today,0,7),'yearly'=>substr($today,0,4),default=>null};
    }
    $selection=reports_range($period,$date,$hours);$params=$selection['params'];
    $rule=operating_hours_for_date($hours,$selection['start']->format('Y-m-d'));
    $dayWindow=operating_day_bounds($hours,$selection['start']->format('Y-m-d'));
    $read=function(string $sql)use($db,$params){$q=$db->prepare($sql);$q->execute($params);$rows=$q->fetchAll();$q->closeCursor();return $rows;};
    $range=fn(string $column)=>"$column>=? AND $column<?";
    $paidWhere=$range('p.paid_at');$summary=reports_summary($db,$selection,$hours);
    $businessExpression=operating_date_sql($hours,'p.paid_at');
    $bucketExpression=$period==='daily'?"DATEDIFF(minute,CAST('".$params[0]."' AS datetime2),p.paid_at)/60":"DATEPART(".($period==='monthly'?'day':'month').",".$businessExpression['date'].")";
    $apply=$period==='daily'?'':$businessExpression['apply'];
    $groups=$read("SELECT $bucketExpression bucket,COUNT(*) orders,SUM(p.amount_applied) revenue FROM dbo.payments p $apply WHERE $paidWhere GROUP BY $bucketExpression ORDER BY bucket");
    $buckets=[];foreach($groups as $row)$buckets[(int)$row['bucket']]=['bucket'=>(int)$row['bucket'],'orders'=>(int)$row['orders'],'revenue'=>orders_money(orders_cents($row['revenue']))];
    $first=$period==='daily'?0:1;
    $last=match($period){'daily'=>(int)ceil(($selection['end']->getTimestamp()-$selection['start']->getTimestamp())/3600)-1,'monthly'=>(int)$selection['start']->format('t'),'yearly'=>12};
    $activity=[];for($bucket=$first;$bucket<=$last;$bucket++){
        $row=$buckets[$bucket]??['bucket'=>$bucket,'orders'=>0,'revenue'=>'0.00'];
        if($period==='daily'){
            $from=$selection['start']->modify('+'.$bucket.' hours');$to=$from->modify('+1 hour');if($to>$selection['end'])$to=$selection['end'];
            $row['hour']=(int)$from->format('G');$row['label']=$from->format('H:i').'–'.$to->modify('-1 second')->format('H:i').($from->format('Y-m-d')!==$selection['start']->format('Y-m-d')?' (next day)':'');
        }
        $activity[]=$row;
    }
    $hourly=$period==='daily'?array_map(fn(array $row)=>['hour'=>$row['hour'],'orders'=>$row['orders'],'revenue'=>$row['revenue']],$activity):[];
    $items=$read("SELECT TOP 5 i.menu_item_id,i.item_name name,SUM(CAST(i.quantity AS bigint)) units,COUNT(DISTINCT i.order_id) orders FROM dbo.order_items i JOIN dbo.payments p ON p.order_id=i.order_id WHERE $paidWhere GROUP BY i.menu_item_id,i.item_name ORDER BY units DESC,i.item_name,i.menu_item_id");
    foreach($items as &$item){$item['units']=(int)$item['units'];$item['orders']=(int)$item['orders'];unset($item['menu_item_id']);}unset($item);
    $method="CASE WHEN p.payment_method IN ('Cash','GCash','PayMaya') THEN p.payment_method ELSE 'Other' END";
    $methods=$read("SELECT $method method,COUNT(*) n,SUM(p.amount_applied) revenue FROM dbo.payments p WHERE $paidWhere GROUP BY $method");
    $paymentDetails=$read("SELECT p.payment_method code,COALESCE(m.display_name,p.payment_method) label,COUNT(*) orders,SUM(p.amount_applied) revenue FROM dbo.payments p LEFT JOIN dbo.online_payment_methods m ON m.payment_method=p.payment_method WHERE $paidWhere GROUP BY p.payment_method,m.display_name ORDER BY COALESCE(m.display_name,p.payment_method),p.payment_method");
    foreach($paymentDetails as &$detail){$detail['orders']=(int)$detail['orders'];$detail['revenue']=orders_money(orders_cents($detail['revenue']));}unset($detail);
    $empty=['Cash'=>0,'GCash'=>0,'PayMaya'=>0,'Other'=>0,'None'=>0];$confirmed=$empty;$revenues=array_fill_keys(array_keys($empty),0);
    foreach($methods as $row){$confirmed[$row['method']]=(int)$row['n'];$revenues[$row['method']]=orders_cents($row['revenue']);}
    // An unpaid void has no collected payment; retain this as a separate column.
    $voids=$empty;$voids['None']=$summary['voidedOrders'];
    $breakdown=[];foreach([['Approved payments','count',$confirmed],['Revenue','money',$revenues],['Voided orders (no payment)','count',$voids]] as [$label,$type,$values]){
        $total=array_sum($values);if($type==='money'){$values=array_map('orders_money',$values);$total=orders_money($total);}
        $breakdown[]=['label'=>$label,'type'=>$type,'values'=>$values,'total'=>$total];
    }
    return ['period'=>$period,'date'=>$date,'summary'=>$summary,'comparison'=>reports_comparison($db,$selection,$hours),'activity'=>$activity,'hourly'=>$hourly,'topItems'=>$items,'breakdown'=>$breakdown,'paymentDetails'=>$paymentDetails,'businessDate'=>operating_business_date($hours),'operatingHours'=>['opening'=>operating_hours_time($rule['openingMinute']),'closing'=>operating_hours_time($rule['closingMinute']),'overnight'=>$rule['closingMinute']<=$rule['openingMinute'],'legacy'=>$rule['legacy'],'setupRequired'=>$hours['setupRequired'],'windowStart'=>$params[0],'windowEnd'=>$params[1],'scheduledClose'=>$dayWindow['closeUtc']]];
}
