<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';require_once __DIR__.'/../includes/reports.php';require_once __DIR__.'/../includes/pos.php';require_once __DIR__.'/operating-hours-fixture.php';
$checks=0;function comparison_check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException($label);$checks++;echo "PASS: $label\n";}
$db=quvo_db();$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local rollback test database required.');
$db->beginTransaction();try{
 operating_test_calendar($db);
 $db->exec("INSERT dbo.operating_hours_schedule(effective_date,opening_minute,closing_minute) VALUES('20000101',900,120)");
 $actor=(int)$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name)='admin'")->fetchColumn();
 $q=$db->prepare("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(?,'food',10,1)");$q->execute(['Comparison rollback '.bin2hex(random_bytes(5))]);$menu=(int)$q->fetchColumn();$q->closeCursor();
 $make=function(string $local,int $quantity)use($db,$actor,$menu):void{
  $total=orders_money($quantity*1000);
  $order=pos_submit($db,['role'=>'admin','staff_id'=>$actor],['submission_key'=>bin2hex(random_bytes(4)).'-1234-4234-8234-123456789012','customer_name'=>'Report comparison rollback','expected_total'=>$total,'payment_method'=>'Cash','amount_received'=>$total,'items'=>[['menu_id'=>$menu,'quantity'=>$quantity]]])['order'];
  $at=(new DateTimeImmutable($local,new DateTimeZone('Asia/Manila')))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
  $db->prepare('UPDATE dbo.payments SET paid_at=? WHERE order_id=?')->execute([$at,$order['order_id']]);
  $db->prepare('UPDATE dbo.orders SET created_at=?,updated_at=? WHERE order_id=?')->execute([$at,$at,$order['order_id']]);
 };
 $make('2099-05-01 14:59:59',90);$make('2099-05-01 15:00:00',10);$make('2099-05-02 01:00:00',10);$make('2099-05-02 15:00:00',15);$make('2099-05-03 01:00:00',15);
 $report=reports_daily($db,'2099-05-02');$previous=$report['comparison'];
 comparison_check($report['summary']['totalRevenue']==='300.00','selected day includes its overnight sales');
 comparison_check($previous['date']==='2099-05-01'&&$previous['period']==='daily','comparison chooses previous opening date');
 comparison_check($previous['summary']['totalRevenue']==='200.00'&&$previous['summary']['paidOrders']===2,'previous day includes its own after-midnight sales exactly once');
 comparison_check($previous['summary']===reports_daily($db,'2099-05-01')['summary'],'previous summary equals selecting that date directly');
 comparison_check($previous['windowStart']==='2099-05-01 07:00:00'&&$previous['windowEnd']==='2099-05-02 07:00:00','comparison follows 3 PM opening boundaries');
 comparison_check($previous['hasActivity']&&$previous['selectedStatus']==='upcoming','future business periods are identified without hiding their saved test data');
 $hours=operating_hours_context($db);
 foreach([['daily','2024-03-01','2024-02-29'],['monthly','2026-01','2025-12'],['yearly','2026','2025']] as [$period,$date,$expected])comparison_check(reports_previous_range(reports_range($period,$date,$hours),$hours)['date']===$expected,'calendar rollover for '.$period.' '.$date);
 $db->exec("INSERT dbo.operating_hours_schedule(effective_date,opening_minute,closing_minute) VALUES('20990503',990,180)");
 $make('2099-05-03 16:00:00',2);$changed=reports_daily($db,'2099-05-02');
 comparison_check($changed['summary']['totalRevenue']==='320.00'&&$changed['comparison']['summary']['totalRevenue']==='200.00','schedule change affects only the appropriate business window');
 comparison_check($changed['operatingHours']['windowEnd']==='2099-05-03 08:30:00'&&$changed['comparison']['windowEnd']==='2099-05-02 07:00:00','both periods retain their own saved opening boundaries');
 comparison_check($changed['comparison']['outsideHoursComparable'],'non-legacy closing metrics can be compared');
 $make('2099-06-01 01:00:00',1);$make('2099-06-01 16:30:00',4);
 $month=reports_period($db,'monthly','2099-06');
 comparison_check($month['summary']['totalRevenue']==='40.00'&&$month['comparison']['date']==='2099-05','monthly compares the preceding month');
 comparison_check($month['comparison']['summary']['totalRevenue']==='530.00','May includes early-June sales belonging to May opening dates');
 $make('2100-01-01 01:00:00',3);$make('2100-01-01 16:30:00',5);$year=reports_period($db,'yearly','2100');
 comparison_check($year['summary']['totalRevenue']==='50.00'&&$year['comparison']['date']==='2099','yearly compares the preceding year');
 comparison_check($year['comparison']['summary']['totalRevenue']==='1500.00','yearly previous total includes its overnight New Year sales');
 $empty=reports_daily($db,'2099-07-01')['comparison'];comparison_check(!$empty['hasActivity']&&$empty['summary']['totalRevenue']==='0.00','empty preceding period explicitly reports no transactions');
 $transition=reports_daily($db,'2000-01-01')['comparison'];comparison_check(!$transition['outsideHoursComparable'],'legacy midnight period cannot fabricate an after-close comparison');
 $current=reports_daily($db);comparison_check($current['comparison']['selectedStatus']==='in_progress','live business-day reports are flagged as still in progress');
 $past=reports_daily($db,'2024-03-01');comparison_check($past['comparison']['selectedStatus']==='complete','past reports use a complete-period comparison');
 echo "$checks report comparison SQL checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "Comparison, payment and schedule fixtures rolled back.\n";}
