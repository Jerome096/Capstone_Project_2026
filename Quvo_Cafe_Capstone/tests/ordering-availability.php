<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/ordering-fixture.php';
require_once __DIR__.'/../includes/online.php';
require_once __DIR__.'/../includes/pos.php';
require_once __DIR__.'/../includes/sales.php';
$checks=0;
function verify_ordering(bool $condition,string $message):void{global $checks;if(!$condition)throw new RuntimeException('FAIL: '.$message);$checks++;echo 'PASS: '.$message.PHP_EOL;}
function reject_ordering(callable $action,int $status,string $code,string $message):void{
    try{$action();}catch(OrderError $error){verify_ordering($error->status===$status&&($code===''||$error->errorCode===$code),$message);return;}
    throw new RuntimeException('FAIL: Accepted '.$message);
}
$db=quvo_db();$db->beginTransaction();
try{
    reject_ordering(fn()=>ordering_access(null),401,'','anonymous control denied');
    reject_ordering(fn()=>ordering_access(['role'=>'kitchen']),403,'','kitchen-only control denied');
    reject_ordering(fn()=>ordering_uuid('forged'),422,'','invalid workspace identity denied');
    $identity=ordering_test_open($db);$actor=$identity['actor'];
    $change=fn(string $action,?string $revision=null)=>ordering_change($db,$actor,['action'=>$action,'workspaceId'=>$identity['workspaceId'],'revision'=>$revision??ordering_status($db,true)['revision']],$identity['sessionHash'],$identity['stamp']);
    verify_ordering(ordering_status($db)['acceptingOrders'],'explicit staff start opens service');
    $installedRevision=ordering_status($db,true)['revision'];
    $db->exec(file_get_contents(__DIR__.'/../database/19_ordering_availability.sql'));
    verify_ordering(ordering_status($db)['acceptingOrders']&&ordering_status($db,true)['revision']===$installedRevision,'repeat migration preserves the current ordering setting');
    verify_ordering(!isset(ordering_status($db)['revision'])&&!isset(ordering_status($db)['onlineWorkspaces']),'public status excludes workspace identities');
    $openRevision=ordering_status($db,true)['revision'];$change('pause');
    verify_ordering(!ordering_status($db)['acceptingOrders'],'pause closes service');
    $tag=bin2hex(random_bytes(5));
    $q=$db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT INSERTED.table_id VALUES(?,N'Ordering rollback table','indoor')");$q->execute(['ord-'.$tag]);$table=(int)$q->fetchColumn();$q->closeCursor();
    [$visit,$token]=dining_guest_request($db,$table,'Ordering rollback customer',null);
    dining_change_session($db,$actor['staff_id'],(int)$visit['session_id'],'approve');
    $q=$db->prepare("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(?,'coffee',15.25,1)");$q->execute(['Ordering rollback '.$tag]);$menu=(int)$q->fetchColumn();$q->closeCursor();
    $dine=['submission_key'=>ordering_test_uuid(),'expected_total'=>'15.25','items'=>[['itemId'=>$menu,'quantity'=>1]]];
    $account=online_register($db,['name'=>'Ordering rollback','email'=>'ordering-'.$tag.'@example.invalid','password'=>bin2hex(random_bytes(12)),'contact'=>'09123456789','address'=>'Rollback address']);$customer=(int)$account['customer_account_id'];
    $online=$dine+['fulfillment'=>'pickup','payment_method'=>'GCash'];$online['submission_key']=ordering_test_uuid();
    $before=(int)$db->query('SELECT COUNT(*) FROM dbo.orders')->fetchColumn();
    reject_ordering(fn()=>orders_submit($db,$table,$token,$dine),409,'ordering_closed','paused dine-in order rejected on server');
    reject_ordering(fn()=>online_submit($db,$customer,$online),409,'ordering_closed','paused online order rejected before payment submission');
    verify_ordering((int)$db->query('SELECT COUNT(*) FROM dbo.orders')->fetchColumn()===$before,'paused requests insert no orders');
    $change('heartbeat',$openRevision);
    verify_ordering(!ordering_status($db)['acceptingOrders'],'old heartbeat cannot undo pause');
    reject_ordering(fn()=>$change('start',$openRevision),409,'ordering_changed','stale start cannot override another staff change');
    $change('start');
    $savedDine=orders_submit($db,$table,$token,$dine);
    verify_ordering(!$savedDine['replayed'],'new dine-in order accepted after start');
    $db->exec('DELETE dbo.payment_qr_codes');
    $png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5kAAAAASUVORK5CYII=');
    payment_qr_save($db,$actor['staff_id'],'GCash',payment_image($png));
    $online['payment_qr_version']=payment_qr_methods($db)['GCash']['version'];$online['receipt_image']='data:image/png;base64,'.base64_encode($png);
    $savedOnline=online_submit($db,$customer,$online);
    verify_ordering(!$savedOnline['replayed'],'new online order accepted after start');
    $change('pause');
    verify_ordering(orders_submit($db,$table,$token,$dine)['replayed'],'accepted dine-in order can be recovered while paused');
    verify_ordering(online_submit($db,$customer,$online)['replayed'],'accepted online order can be recovered while paused');
    reject_ordering(fn()=>orders_submit($db,$table,$token,[...$dine,'submission_key'=>ordering_test_uuid()]),409,'ordering_closed','new dine-in retry key blocked while paused');
    reject_ordering(fn()=>online_submit($db,$customer,[...$online,'submission_key'=>ordering_test_uuid()]),409,'ordering_closed','new online retry key blocked while paused');
    verify_ordering(count(online_menu($db))>0&&orders_get($db,(int)$savedDine['order']['order_id'])['order_status']==='received','menu and existing orders remain readable');
    orders_pay($db,$actor['staff_id'],(int)$savedDine['order']['order_id'],['payment_method'=>'Cash','amount_received'=>'20.00']);
    verify_ordering(orders_get($db,(int)$savedDine['order']['order_id'])['payment_status']==='paid','existing orders can still be paid while paused');
    $walk=pos_submit($db,$actor,['submission_key'=>ordering_test_uuid(),'customer_name'=>'Walk-in rollback','expected_total'=>'15.25','payment_method'=>'Cash','amount_received'=>'20.00','items'=>[['menu_id'=>$menu,'quantity'=>1,'drink_options'=>null,'notes'=>'']]]);
    verify_ordering($walk['order']['payment_status']==='paid','staff POS remains available while customer ordering is paused');
    $change('start');$live=ordering_status($db,true);
    $second=['workspaceId'=>ordering_test_uuid(),'sessionHash'=>hash('sha256','other-'.$tag)];
    ordering_change($db,$actor,['action'=>'heartbeat','workspaceId'=>$second['workspaceId'],'revision'=>$live['revision']],$second['sessionHash'],$identity['stamp']);
    verify_ordering(ordering_status($db,true)['onlineWorkspaces']===2,'another operations workspace can keep service online');
    ordering_release_session($db,$identity['sessionHash']);
    verify_ordering(ordering_status($db)['acceptingOrders'],'one logout keeps ordering open when another workspace is active');
    ordering_release_session($db,$second['sessionHash']);
    verify_ordering(!ordering_status($db)['acceptingOrders'],'last logout pauses immediately');
    $change('start');$revision=ordering_status($db,true)['revision'];
    $db->exec('UPDATE dbo.ordering_workspaces SET lease_expires_at=DATEADD(second,-1,SYSUTCDATETIME())');
    verify_ordering(!ordering_status($db)['acceptingOrders'],'all expired leases stop customer submissions');
    reject_ordering(fn()=>orders_submit($db,$table,$token,[...$dine,'submission_key'=>ordering_test_uuid()]),409,'ordering_closed','offline dine-in submission blocked');
    reject_ordering(fn()=>online_submit($db,$customer,[...$online,'submission_key'=>ordering_test_uuid()]),409,'ordering_closed','offline online submission blocked');
    $change('heartbeat',$revision);
    verify_ordering(!ordering_status($db)['acceptingOrders']&&ordering_status($db,true)['revision']!==$revision,'returning heartbeat cannot reopen expired service');
    $change('start');verify_ordering(ordering_status($db)['acceptingOrders'],'explicit restart reopens service after disconnection');
    $db->prepare('UPDATE dbo.staff_users SET is_active=0 WHERE staff_id=?')->execute([$actor['staff_id']]);
    verify_ordering(!ordering_status($db)['acceptingOrders'],'disabled staff cannot keep customer ordering open');
    $db->prepare('UPDATE dbo.staff_users SET is_active=1 WHERE staff_id=?')->execute([$actor['staff_id']]);
    $db->prepare('UPDATE dbo.ordering_workspaces SET credential_stamp=? WHERE staff_id=?')->execute([str_repeat('0',64),$actor['staff_id']]);
    verify_ordering(!ordering_status($db)['acceptingOrders'],'invalidated credentials cannot keep customer ordering open');
    $change('start');
    $eod=sales_close($db,$actor['staff_id'],'Ordering rollback EOD',ordering_test_uuid());
    verify_ordering(!ordering_status($db)['acceptingOrders'],'end of day pauses customer ordering');
    verify_ordering(orders_get($db,(int)$savedOnline['order']['order_id'])['order_status']==='received','end of day preserves pending customer orders');
    echo "$checks ordering availability checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "Ordering state, workspace leases and all test records rolled back.\n";}
