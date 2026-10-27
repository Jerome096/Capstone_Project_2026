<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../includes/wifi-settings.php';
require_once __DIR__.'/../includes/website-content.php';
require_once __DIR__.'/ordering-fixture.php';
$checks=0;
function wifi_check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException($label);$checks++;echo "PASS: $label\n";}
function wifi_reject(callable $fn,int $status,string $label):void{try{$fn();}catch(OrderError $error){wifi_check($error->status===$status,$label);return;}throw new RuntimeException('Unexpected acceptance: '.$label);}
$db=quvo_db();$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local test database required.');
$db->beginTransaction();
try{
    $identity=ordering_test_open($db);
    $adminId=(int)$db->query("SELECT TOP(1) s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE LOWER(r.role_name)='admin' AND s.is_active=1")->fetchColumn();
    if(!$adminId)throw new RuntimeException('An active local admin is required.');
    $admin=['staff_id'=>$adminId,'role'=>'admin'];$initial=wifi_settings_read($db);
    wifi_check(!$initial['setupRequired']&&is_string($initial['version']),'private Wi-Fi settings are installed');
    $input=['version'=>$initial['version'],'networkName'=>'SAMPLE CAFE WIFI','password'=>' Preview guest password ! '];
    wifi_reject(fn()=>wifi_settings_save($db,$identity['actor'],$input),403,'staff cannot edit Wi-Fi details');
    wifi_reject(fn()=>wifi_settings_save($db,$admin,array_replace($input,['networkName'=>''])),422,'blank network names are rejected');
    wifi_reject(fn()=>wifi_settings_save($db,$admin,array_replace($input,['password'=>"bad\npassword"])),422,'control characters are rejected');
    wifi_reject(fn()=>wifi_settings_save($db,$admin,array_replace($input,['password'=>str_repeat('x',129)])),422,'oversized passwords are rejected');
    $saved=wifi_settings_save($db,$admin,$input);
    wifi_check($saved['networkName']===$input['networkName']&&$saved['password']===$input['password'],'admin saves the exact network name and password including spaces');
    wifi_reject(fn()=>wifi_settings_save($db,$admin,$input),409,'stale admin tabs cannot overwrite newer credentials');
    $audit=$db->query("SELECT TOP(1) details_json FROM dbo.system_audit_log WHERE action='guest_wifi_updated' ORDER BY audit_id DESC")->fetchColumn();
    wifi_check(!str_contains($audit,$saved['password'])&&!str_contains($audit,$saved['networkName']),'audit details contain no Wi-Fi credentials');
    $tag=bin2hex(random_bytes(5));$q=$db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT INSERTED.table_id VALUES(?,N'Wi-Fi rollback test','indoor')");$q->execute(['wf-'.$tag]);$table=(int)$q->fetchColumn();$q->closeCursor();
    $token=bin2hex(random_bytes(32));$q=$db->prepare("INSERT dbo.customer_sessions(table_id,guest_name,guest_token_hash,status) OUTPUT INSERTED.session_id VALUES(?,N'Wi-Fi guest',CONVERT(binary(32),?,2),'active')");$q->execute([$table,hash('sha256',$token)]);$visit=(int)$q->fetchColumn();$q->closeCursor();
    wifi_reject(fn()=>wifi_guest_details($db,$table,null),403,'scanning a QR without owning the visit cannot reveal Wi-Fi');
    wifi_reject(fn()=>wifi_guest_details($db,$table,'another-browser-token'),403,'another browser token cannot reveal Wi-Fi');
    wifi_reject(fn()=>wifi_guest_details($db,$table+999999,$token),403,'a token cannot reveal Wi-Fi for another table');
    $locked=wifi_guest_details($db,$table,$token);wifi_check(!$locked['available']&&!isset($locked['password'],$locked['networkName']),'approved but unpaid visits receive no credentials');
    $db->prepare("UPDATE dbo.customer_sessions SET status='pending' WHERE session_id=?")->execute([$visit]);
    wifi_reject(fn()=>wifi_guest_details($db,$table,$token),403,'unapproved visits cannot fetch Wi-Fi');
    $db->prepare("UPDATE dbo.customer_sessions SET status='active' WHERE session_id=?")->execute([$visit]);
    $q=$db->query("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(N'Wi-Fi test coffee','cold-coffee',25,1)");$menu=(int)$q->fetchColumn();$q->closeCursor();
    $inputOrder=['submission_key'=>ordering_test_uuid(),'expected_total'=>'25.00','items'=>[['itemId'=>$menu,'quantity'=>1]]];$order=orders_submit($db,$table,$token,$inputOrder)['order'];
    wifi_check(!wifi_guest_details($db,$table,$token)['available'],'submitting an unpaid order does not unlock Wi-Fi');
    orders_pay($db,$adminId,(int)$order['order_id'],['payment_method'=>'Cash','amount_received'=>'25.00']);
    $guest=wifi_guest_details($db,$table,$token);wifi_check($guest['available']&&$guest['password']===$saved['password']&&$guest['sessionId']===(string)$visit,'cashier-confirmed full payment unlocks Wi-Fi for its own visit');
    wifi_check(wifi_guest_details($db,$table,$token)===$guest,'refresh retrieves the same Wi-Fi note from the server');
    $next=wifi_settings_save($db,$admin,['version'=>$saved['version'],'networkName'=>'SAMPLE UPDATED WIFI','password'=>'Updated preview pass']);
    wifi_check(wifi_guest_details($db,$table,$token)['password']===$next['password'],'admin edits are reflected in the paid customer note');
    $additional=$inputOrder;$additional['submission_key']=ordering_test_uuid();orders_submit($db,$table,$token,$additional);
    wifi_check(wifi_guest_details($db,$table,$token)['available'],'a later unpaid order does not hide Wi-Fi from an already paid visit');
    orders_status($db,$adminId,(int)$order['order_id'],'ready');orders_status($db,$adminId,(int)$order['order_id'],'served');
    wifi_check(wifi_guest_details($db,$table,$token)['available'],'Wi-Fi remains available after serving while the visit is active');
    $public=website_content_read($db)['content'];wifi_check(!str_contains(json_encode($public),$next['password']),'public website content does not contain guest Wi-Fi credentials');
    $db->prepare("UPDATE dbo.customer_sessions SET status='closed',ended_at=SYSUTCDATETIME() WHERE session_id=?")->execute([$visit]);
    wifi_reject(fn()=>wifi_guest_details($db,$table,$token),403,'ended visits cannot fetch the current Wi-Fi password');
    $db->prepare("UPDATE dbo.customer_sessions SET status='active',ended_at=NULL WHERE session_id=?")->execute([$visit]);
    $db->prepare('UPDATE dbo.cafe_tables SET is_active=0 WHERE table_id=?')->execute([$table]);
    wifi_reject(fn()=>wifi_guest_details($db,$table,$token),403,'inactive tables cannot reveal Wi-Fi');
    $db->prepare('UPDATE dbo.cafe_tables SET is_active=1 WHERE table_id=?')->execute([$table]);
    $db->prepare("UPDATE dbo.customer_sessions SET status='closed',ended_at=SYSUTCDATETIME() WHERE session_id=?")->execute([$visit]);
    $nextToken=bin2hex(random_bytes(32));$db->prepare("INSERT dbo.customer_sessions(table_id,guest_name,guest_token_hash,status) VALUES(?,N'Next Wi-Fi guest',CONVERT(binary(32),?,2),'active')")->execute([$table,hash('sha256',$nextToken)]);
    wifi_check(!wifi_guest_details($db,$table,$nextToken)['available'],'a new visit cannot inherit the previous visit payment at the same table');
    $db->exec(file_get_contents(__DIR__.'/../database/24_guest_wifi.sql'));wifi_check(wifi_settings_read($db)['password']===$next['password'],'repeating the migration preserves the saved credentials');
    echo "Completed $checks Wi-Fi checks; all fixtures roll back.\n";
}finally{if($db->inTransaction())$db->rollBack();}
