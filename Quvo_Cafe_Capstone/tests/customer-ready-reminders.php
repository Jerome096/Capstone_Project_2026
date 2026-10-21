<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/ordering-fixture.php';
require_once __DIR__.'/../includes/online.php';
require_once __DIR__.'/../includes/pos.php';
$checks=0;
function reminder_check(bool $condition,string $message):void{global $checks;if(!$condition)throw new RuntimeException('FAIL: '.$message);$checks++;echo 'PASS: '.$message.PHP_EOL;}
function reminder_reject(callable $action,int $status,string $message):void{
    try{$action();}catch(OrderError $error){reminder_check($error->status===$status,$message);return;}
    throw new RuntimeException('FAIL: Accepted '.$message);
}
$db=quvo_db();$db->beginTransaction();
try{
    $actor=ordering_test_open($db)['actor'];$tag=bin2hex(random_bytes(5));
    $q=$db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT INSERTED.table_id VALUES(?,N'Reminder rollback table','indoor')");$q->execute(['rem-'.$tag]);$table=(int)$q->fetchColumn();$q->closeCursor();
    [$visit,$token]=dining_guest_request($db,$table,'Reminder rollback guest',null);$session=(int)$visit['session_id'];dining_change_session($db,$actor['staff_id'],$session,'approve');
    $q=$db->prepare("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(?,'coffee',15.25,1)");$q->execute(['Reminder rollback '.$tag]);$menu=(int)$q->fetchColumn();$q->closeCursor();
    $input=['submission_key'=>ordering_test_uuid(),'expected_total'=>'15.25','items'=>[['itemId'=>$menu,'quantity'=>1]]];
    $saved=orders_submit($db,$table,$token,$input);$id=(int)$saved['order']['order_id'];
    $key=ordering_test_uuid();
    reminder_reject(fn()=>orders_remind_ready($db,['role'=>'kitchen','staff_id'=>$actor['staff_id']],$id,$key),403,'kitchen-only access cannot send reminders');
    reminder_reject(fn()=>orders_remind_ready($db,$actor,$id,'invalid'),422,'reminders require a valid retry key');
    reminder_reject(fn()=>orders_remind_ready($db,$actor,$id,$key),409,'received orders cannot send ready reminders');
    orders_pay($db,$actor['staff_id'],$id,['payment_method'=>'Cash','amount_received'=>'20.00']);
    reminder_reject(fn()=>orders_remind_ready($db,$actor,$id,$key),409,'preparing orders cannot send ready reminders');
    orders_status($db,$actor['staff_id'],$id,'ready');$before=orders_get($db,$id);
    reminder_check($before['ready_alert_version']==='0'&&$before['ready_alert_at']===null,'new ready orders have no reminder event');
    $count=fn()=>(int)$db->query("SELECT COUNT(*) FROM dbo.system_audit_log WHERE entity_type='order' AND entity_key='".$id."' AND action='customer_ready_reminder'")->fetchColumn();
    $sent=orders_remind_ready($db,$actor,$id,$key);$version=$sent['order']['ready_alert_version'];
    reminder_check(!$sent['replayed']&&$version!=='0'&&$count()===1,'staff can send one persisted ready reminder');
    reminder_check($sent['order']['order_status']==='ready'&&$sent['order']['updated_at']===$before['updated_at'],'reminders preserve order status and timestamps');
    reminder_check($sent['order']['payment_status']==='paid'&&$sent['order']['amount_received']===$before['amount_received']&&$sent['order']['change_amount']===$before['change_amount'],'reminders preserve payment and change');
    reminder_check((int)$sent['order']['ready_alert_retry_after']>=14,'staff response includes a reminder cooldown');
    reminder_check(orders_get($db,$id,$session)['ready_alert_version']===$version,'the correct dine-in session can read the reminder version');
    reminder_reject(fn()=>orders_get($db,$id,$session+1000000),404,'another dine-in session cannot read the reminder');
    $replay=orders_remind_ready($db,$actor,$id,strtoupper($key));
    reminder_check($replay['replayed']&&$replay['order']['ready_alert_version']===$version&&$count()===1,'retrying the same reminder cannot send it twice');
    reminder_reject(fn()=>orders_remind_ready($db,$actor,$id,ordering_test_uuid()),429,'a distinct immediate click is rate limited');
    $db->prepare('UPDATE dbo.system_audit_log SET occurred_at=DATEADD(second,-16,SYSUTCDATETIME()) WHERE audit_id=?')->execute([$version]);
    $again=orders_remind_ready($db,$actor,$id,ordering_test_uuid());
    reminder_check(!$again['replayed']&&(int)$again['order']['ready_alert_version']>(int)$version&&$count()===2,'cashier can send another reminder after cooldown');
    reminder_check(orders_remind_ready($db,$actor,$id,$key)['replayed']&&$count()===2,'an older retry key remains idempotent after a newer reminder');
    orders_status($db,$actor['staff_id'],$id,'served');
    reminder_reject(fn()=>orders_remind_ready($db,$actor,$id,ordering_test_uuid()),409,'served orders cannot send new reminders');
    reminder_check(orders_remind_ready($db,$actor,$id,$key)['replayed']&&$count()===2,'a lost response can be recovered after the order is served');
    $unpaid=orders_submit($db,$table,$token,[...$input,'submission_key'=>ordering_test_uuid()]);$unpaidId=(int)$unpaid['order']['order_id'];
    $db->prepare("UPDATE dbo.orders SET order_status='ready' WHERE order_id=?")->execute([$unpaidId]);
    reminder_reject(fn()=>orders_remind_ready($db,$actor,$unpaidId,ordering_test_uuid()),409,'an inconsistent unpaid ready order cannot send reminders');
    $walk=pos_submit($db,$actor,['submission_key'=>ordering_test_uuid(),'customer_name'=>'Reminder walk-in','expected_total'=>'15.25','payment_method'=>'Cash','amount_received'=>'20.00','items'=>[['menu_id'=>$menu,'quantity'=>1,'drink_options'=>null,'notes'=>'']]]);$walkId=(int)$walk['order']['order_id'];
    $db->prepare("UPDATE dbo.orders SET order_status='ready' WHERE order_id=?")->execute([$walkId]);
    reminder_reject(fn()=>orders_remind_ready($db,$actor,$walkId,ordering_test_uuid()),409,'walk-in orders do not pretend to have a customer page');
    $account=online_register($db,['name'=>'Reminder rollback','email'=>'reminder-'.$tag.'@example.invalid','password'=>bin2hex(random_bytes(12)),'contact'=>'09123456789','address'=>'Rollback address']);$customer=(int)$account['customer_account_id'];
    $png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5kAAAAASUVORK5CYII=');payment_qr_save($db,$actor['staff_id'],'GCash',payment_image($png));
    $online=online_submit($db,$customer,[...$input,'submission_key'=>ordering_test_uuid(),'fulfillment'=>'pickup','payment_method'=>'GCash','payment_qr_version'=>payment_qr_methods($db)['GCash']['version'],'receipt_image'=>'data:image/png;base64,'.base64_encode($png)]);$onlineId=(int)$online['order']['order_id'];
    orders_pay($db,$actor['staff_id'],$onlineId,['payment_method'=>'GCash','amount_received'=>'15.25']);orders_status($db,$actor['staff_id'],$onlineId,'ready');
    $onlineSent=orders_remind_ready($db,$actor,$onlineId,ordering_test_uuid());
    reminder_check(!$onlineSent['replayed']&&$onlineSent['order']['order_status']==='ready','online orders also support cashier reminders');
    reminder_check(online_order($db,$customer,$onlineId)['ready_alert_version']===$onlineSent['order']['ready_alert_version'],'the owning online customer receives its reminder version');
    reminder_reject(fn()=>online_order($db,$customer+1000000,$onlineId),404,'another online account cannot read the reminder');
    $q=$db->prepare('SELECT actor_staff_id,details_json FROM dbo.system_audit_log WHERE audit_id=?');$q->execute([$onlineSent['order']['ready_alert_version']]);$event=$q->fetch();$q->closeCursor();
    reminder_check((int)$event['actor_staff_id']===$actor['staff_id']&&isset(json_decode($event['details_json'],true)['request_key']),'reminder records retain the staff actor and retry key');
}finally{if($db->inTransaction())$db->rollBack();echo "All temporary orders, reminders and settings rolled back.\n";}
echo "$checks customer reminder checks passed.\n";
