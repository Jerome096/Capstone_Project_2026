<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/reports.php';
require_once __DIR__.'/../includes/pos.php';
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/operating-hours-fixture.php';
$checks=0;
function verify(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException('FAIL: '.$label);$checks++;echo "PASS: $label\n";}
function denied(callable $fn,int $status,string $label):void{try{$fn();}catch(OrderError $e){verify($e->status===$status,$label);return;}throw new RuntimeException('FAIL: accepted '.$label);}
$db=quvo_db();$initial=$db->query('SELECT COUNT(*) FROM dbo.orders')->fetchColumn();
try{
 $db->beginTransaction();operating_test_calendar($db);
 $staff=(int)$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name)='admin'")->fetchColumn();
 if(!$staff)throw new RuntimeException('An active administrator is required.');
 $actor=['staff_id'=>$staff,'role'=>'admin'];
 denied(fn()=>operating_hours_access(null,false),401,'anonymous access denied');
 denied(fn()=>operating_hours_access(['role'=>'customer'],true),403,'customer access denied');
 operating_hours_access(['role'=>'staff'],false);verify(true,'staff can read business-day settings');
 denied(fn()=>operating_hours_access(['role'=>'staff'],true,true),403,'staff cannot change settings');
 denied(fn()=>operating_hours_access($actor,false,true),403,'admin reconfirmation required');
 operating_hours_access($actor,true,true);verify(true,'confirmed admin can edit hours');
 foreach(['24:00','3pm','15:60',null] as $bad)denied(fn()=>operating_hours_minute($bad),422,'invalid time rejected');
 denied(fn()=>operating_hours_date('2026-02-30'),422,'invalid date rejected');
 $db->exec("INSERT dbo.operating_hours_schedule(effective_date,opening_minute,closing_minute) VALUES('20000101',900,120)");
 $hours=operating_hours_context($db);
 foreach(['2099-01-01T00:59:59+08:00'=>'2098-12-31','2099-01-01T14:59:59+08:00'=>'2098-12-31','2099-01-01T15:00:00+08:00'=>'2099-01-01'] as $at=>$expected)
  verify(operating_business_date($hours,new DateTimeImmutable($at))===$expected,'opening date at '.$at);
 $bounds=operating_day_bounds($hours,'2098-12-31');
 verify($bounds['startUtc']==='2098-12-31 07:00:00'&&$bounds['endUtc']==='2099-01-01 07:00:00','3 PM business-day UTC boundaries');
 verify($bounds['closeUtc']==='2098-12-31 18:00:00','2 AM scheduled close belongs to next calendar day');
 verify(operating_business_date($hours,new DateTimeImmutable('1999-12-31T01:00:00+08:00'))==='1999-12-31','legacy history keeps midnight boundaries');
 $q=$db->prepare("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(?,'food',10,1)");
 $q->execute(['Operating hours rollback '.bin2hex(random_bytes(5))]);$menu=(int)$q->fetchColumn();$q->closeCursor();$seq=0;
 $make=function(string $local)use($db,$actor,$menu,&$seq):int{
  $key=sprintf('%08x-7345-4345-8345-123456789abc',++$seq);
  $row=pos_submit($db,$actor,['submission_key'=>$key,'customer_name'=>'Operating hours rollback','expected_total'=>'10.00','payment_method'=>'Cash','amount_received'=>'10.00','items'=>[['menu_id'=>$menu,'quantity'=>1]]])['order'];
  $at=(new DateTimeImmutable($local,new DateTimeZone('Asia/Manila')))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
  $db->prepare('UPDATE dbo.payments SET paid_at=? WHERE order_id=?')->execute([$at,$row['order_id']]);
  $db->prepare('UPDATE dbo.orders SET created_at=?,updated_at=? WHERE order_id=?')->execute([$at,$at,$row['order_id']]);
  return (int)$row['order_id'];
 };
 $ids=[];foreach(['2098-12-31 14:59:59','2098-12-31 15:00:00','2098-12-31 23:59:59','2099-01-01 01:00:00','2099-01-01 02:30:00','2099-01-01 14:59:59','2099-01-01 15:00:00'] as $at)$ids[]=$make($at);
 $report=reports_daily($db,'2098-12-31');
 verify($report['summary']['totalRevenue']==='50.00'&&$report['summary']['paidOrders']===5,'daily revenue includes overnight payments exactly once');
 verify($report['summary']['outsideHoursOrders']===2,'payments after scheduled close are included and identified');
 verify(count($report['activity'])===24&&$report['activity'][0]['hour']===15&&$report['activity'][10]['hour']===1,'hourly buckets run from opening through next morning');
 verify(str_contains($report['activity'][10]['label'],'next day'),'after-midnight hourly rows labeled next day');
 verify(array_sum(array_column($report['activity'],'orders'))===5,'hourly buckets reconcile with daily revenue');
 $month=reports_period($db,'monthly','2098-12');$year=reports_period($db,'yearly','2098');
 verify($month['summary']['totalRevenue']==='60.00'&&$year['summary']['totalRevenue']==='60.00','new-year after-midnight sales belong to prior month and year');
 verify($month['activity'][30]['revenue']==='50.00'&&$year['activity'][11]['revenue']==='60.00','monthly and yearly buckets use opening date');
 $next=reports_daily($db,'2099-01-01');verify($next['summary']['totalRevenue']==='10.00','next opening is exclusive previous-day boundary');
 $version=$hours['version'];$input=['version'=>$version,'effectiveDate'=>'2099-02-01','opening'=>'16:30','closing'=>'03:00'];
 denied(fn()=>operating_hours_save($db,['staff_id'=>$staff,'role'=>'staff'],$input),403,'helper protects admin writes');
 denied(fn()=>operating_hours_save($db,$actor,[...$input,'opening'=>'03:00']),422,'identical opening and closing rejected');
 denied(fn()=>operating_hours_save($db,$actor,[...$input,'effectiveDate'=>operating_business_date($hours)]),422,'active business date cannot be rewritten');
 $saved=operating_hours_save($db,$actor,$input);verify(!$saved['replayed']&&$saved['version']!==$version,'future schedule saves with a new version');
 verify(operating_hours_save($db,$actor,$input)['replayed'],'lost-response retry returns saved schedule');
 denied(fn()=>operating_hours_save($db,$actor,[...$input,'opening'=>'17:00']),409,'stale version cannot overwrite another edit');
 verify(reports_daily($db,'2098-12-31')['summary']===$report['summary'],'future hours leave past revenue unchanged');
 $updated=operating_hours_context($db);$transition=operating_day_bounds($updated,'2099-01-31');$newday=operating_day_bounds($updated,'2099-02-01');
 verify($transition['endUtc']===$newday['startUtc']&&$newday['startUtc']==='2099-02-01 08:30:00','hour changes meet exactly with minute precision');
 verify(count(reports_daily($db,'2099-01-31')['activity'])===26,'long transition day retains every hourly bucket');
 $make('2099-02-02 01:00:00');$half=reports_daily($db,'2099-02-01');
 verify($half['summary']['totalRevenue']==='10.00'&&$half['activity'][8]['orders']===1,'half-hour opening assigns midnight payment to correct hour');
 verify(operating_business_date($updated,new DateTimeImmutable('2099-02-01T16:29:59+08:00'))==='2099-01-31','new opening boundary preserves preceding business day');
 $current=operating_business_date($updated);$window=operating_day_bounds($updated,$current);$before=sales_preview($db);$historyBefore=sales_history($db)['summary'];$completed=dashboard_completed_today($db);
 $local=$window['start']->modify('+1 minute')->format('Y-m-d H:i:s');$id=$make($local);
 orders_status($db,$staff,$id,'ready');orders_status($db,$staff,$id,'served');
 $db->prepare('UPDATE dbo.orders SET updated_at=? WHERE order_id=?')->execute([$window['start']->modify('+1 minute')->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),$id]);
 verify(orders_cents(sales_preview($db)['totalSales'])===orders_cents($before['totalSales'])+1000,'EOD preview uses same opening-day payment window');
 verify(orders_cents(sales_history($db)['summary']['today'])===orders_cents($historyBefore['today'])+1000,'Sales History summary agrees with business-day revenue');
 verify(dashboard_completed_today($db)===$completed+1,'dashboard served count uses opening-day boundary');
 $closure=sales_close($db,$staff,'Operating hours rollback','12345678-9876-4321-8765-123456789abc',$current);
 verify($closure['record']['date']===$current,'EOD saves opening-day date');
 verify(sales_preview($db)['totalSales']==='0.00','EOD closes each current-day payment once');
 verify(sales_close($db,$staff,'Operating hours rollback','12345678-9876-4321-8765-123456789abc')['replayed'],'EOD retries preserve one closure');
 $future=operating_hours_save($db,$actor,['version'=>$saved['version'],'effectiveDate'=>'2099-03-01','opening'=>'17:00','closing'=>'04:00']);
 verify(sales_record($db,(int)$closure['closure_id'])===$closure['record'],'future settings preserve saved EOD totals and date');
 verify((int)$db->query("SELECT COUNT(*) FROM dbo.system_audit_log WHERE action='operating_hours_updated' AND entity_key IN ('2099-02-01','2099-03-01')")->fetchColumn()===2,'successful updates audited once each');
 echo "$checks operating-hours checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();}
verify($db->query('SELECT COUNT(*) FROM dbo.orders')->fetchColumn()===$initial,'all test orders and schedule changes rolled back');
