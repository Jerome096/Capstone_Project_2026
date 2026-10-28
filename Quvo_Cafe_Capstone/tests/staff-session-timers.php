<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';require_once __DIR__.'/../includes/orders.php';require_once __DIR__.'/ordering-fixture.php';
$checks=0;function timer_check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException($label);$checks++;echo "PASS: $label\n";}
$db=quvo_db();$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local test database required.');
$db->beginTransaction();
try{
 $identity=ordering_test_open($db);$actor=$identity['actor'];$tag=bin2hex(random_bytes(5));
 $q=$db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT INSERTED.table_id VALUES(?,N'Staff timer fixture','indoor')");$q->execute(['tm-'.$tag]);$table=(int)$q->fetchColumn();$q->closeCursor();
 [$pending,$token]=dining_guest_request($db,$table,'Staff timer guest',null);$id=(int)$pending['session_id'];
 $row=function(string $status='open')use($db,$id):?array{foreach(dining_staff_sessions($db,$status) as $record)if((int)$record['session_id']===$id)return $record;return null;};
 timer_check($row()['status']==='pending','pending request is included in staff timer list');
 dining_change_session($db,(int)$actor['staff_id'],$id,'approve');$active=$row('active');
 timer_check($active!==null&&(int)$active['idle_remaining_seconds']>=599&&(int)$active['idle_paused']===0,'newly approved staff row exposes the ten-minute clock');
 timer_check($active['table_name']==='Staff timer fixture'&&!array_key_exists('guest_token_hash',$active),'staff row includes table without exposing visit secrets');
 $db->exec("UPDATE dbo.customer_sessions SET last_activity_at=DATEADD(second,-510,SYSUTCDATETIME()) WHERE session_id=$id");$near=$row();
 timer_check((int)$near['idle_remaining_seconds']>=89&&(int)$near['idle_remaining_seconds']<=91,'staff list reports actual remaining inactivity time');
 $last=$near['last_activity_at'];$row();$row();
 timer_check($row()['last_activity_at']===$last,'staff timer polling does not reset customer activity');
 dining_guest_activity($db,$table,$token);timer_check((int)$row()['idle_remaining_seconds']>=599,'customer interaction resets the staff countdown');
 $q=$db->prepare('INSERT dbo.menu_items(item_name,category,price,is_available,option_groups_json) OUTPUT INSERTED.menu_item_id VALUES(?,?,10,1,?)');$q->execute(['Timer menu '.$tag,'appetizer','[]']);$menu=(int)$q->fetchColumn();$q->closeCursor();
 $saved=orders_submit($db,$table,$token,['submission_key'=>ordering_test_uuid(),'expected_total'=>'10.00','items'=>[['itemId'=>$menu,'quantity'=>1,'customization'=>['optionsVersion'=>menu_options_version(['option_groups_json'=>'[]','category'=>'appetizer']),'options'=>[]]]]]);$order=(int)$saved['order']['order_id'];
 timer_check((int)$row()['idle_paused']===0,'unpaid order does not pause staff timer');
 orders_pay($db,(int)$actor['staff_id'],$order,['payment_method'=>'Cash','amount_received'=>'10.00']);
 $db->exec("UPDATE dbo.customer_sessions SET last_activity_at=DATEADD(hour,-2,SYSUTCDATETIME()) WHERE session_id=$id");
 timer_check((int)$row()['idle_paused']===1,'paid preparing order exposes paused timer');
 orders_status($db,(int)$actor['staff_id'],$order,'ready');timer_check((int)$row()['idle_paused']===1,'paid ready order remains paused');
 orders_status($db,(int)$actor['staff_id'],$order,'served');$served=$row();
 timer_check((int)$served['idle_paused']===0&&(int)$served['idle_remaining_seconds']>=599,'serving paid orders starts a fresh ten-minute staff countdown');
 $orderBefore=orders_get($db,$order);
 $db->exec("UPDATE dbo.orders SET created_at=DATEADD(minute,-12,SYSUTCDATETIME()),updated_at=DATEADD(minute,-11,SYSUTCDATETIME()) WHERE order_id=$order");
 dining_expire_table($db,$table);
 timer_check($row('open')===null&&$row('closed')['status']==='closed','expired session leaves active view and remains in history');
 timer_check(orders_get($db,$order)['payment_status']===$orderBefore['payment_status'],'expiry retains paid payment status');
 timer_check(dining_staff_sessions($db,'all',1000000)===[],'staff timer pagination remains supported');
 try{dining_staff_sessions($db,'invalid');throw new RuntimeException('Invalid filter accepted');}catch(DiningError){timer_check(true,'invalid list filter rejected');}
 echo "$checks staff timer SQL checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "All fixtures rolled back.\n";}
