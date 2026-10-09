<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli') {http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../includes/assistance.php';
$checks=0;
function assert_assistance(bool $ok,string $label): void {
    global $checks;
    if(!$ok) throw new RuntimeException('FAIL: '.$label);
    echo 'PASS: '.$label.PHP_EOL; $checks++;
}
$db=quvo_db();
try {
    $db->beginTransaction();
    $actor=(int)$db->query('SELECT TOP 1 staff_id FROM dbo.staff_users WHERE is_active=1')->fetchColumn();
    if(!$actor) throw new RuntimeException('An active staff account is required.');
    $q=$db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT inserted.table_id VALUES(?,N'Assistance rollback test','indoor')");
    $q->execute(['help-'.bin2hex(random_bytes(5))]); $table=(int)$q->fetchColumn();$q->closeCursor();
    [$visit,$token]=dining_guest_request($db,$table,'Assistance test',null);
    try {assistance_request($db,$table,$token,'Water');throw new RuntimeException('Unapproved request accepted');}
    catch(OrderError $error) {assert_assistance($error->status===403,'unapproved guests cannot request staff');}
    dining_change_session($db,$actor,(int)$visit['session_id'],'approve');
    try {assistance_request($db,$table,'wrong-token','Water');throw new RuntimeException('Wrong token accepted');}
    catch(OrderError $error) {assert_assistance($error->status===403,'another browser cannot create a request');}
    $first=assistance_request($db,$table,$token,'<script>alert(1)</script> Please bring water.');
    $id=(int)$first['request_id'];
    assert_assistance($first['status']==='pending' && (int)$first['remaining_seconds']>=59,'request starts with a one-minute lifetime');
    assert_assistance(str_contains($first['concern'],'Please bring water'),'concern is stored');
    assert_assistance(in_array((string)$id,array_map('strval',array_column(assistance_list($db),'request_id')),true),'staff list includes the active request');
    $again=assistance_request($db,$table,$token,'Different concern');
    assert_assistance((int)$again['request_id']===$id && $again['concern']===$first['concern'],'repeat click returns the existing request without changing it');
    assert_assistance(assistance_resolve($db,$actor,$id),'resolve reports a real staff action');
    assert_assistance(assistance_latest($db,(int)$visit['session_id'])['status']==='resolved','staff resolution is saved');
    assert_assistance(!in_array((string)$id,array_map('strval',array_column(assistance_list($db),'request_id')),true),'resolved request leaves alerts');
    assert_assistance((int)assistance_request($db,$table,$token,'Another')['request_id']===$id,'early resolution retains the full one-minute cooldown');
    $db->prepare('UPDATE dbo.staff_assistance_requests SET requested_at=DATEADD(second,-61,requested_at) WHERE request_id=?')->execute([$id]);
    $second=assistance_request($db,$table,$token,''); $secondId=(int)$second['request_id'];
    assert_assistance($secondId!==$id && $second['concern']==='Staff assistance requested.','new call after a minute allows an optional concern');
    $db->prepare('UPDATE dbo.staff_assistance_requests SET requested_at=DATEADD(second,-61,requested_at) WHERE request_id=?')->execute([$secondId]);
    assert_assistance(!in_array((string)$secondId,array_map('strval',array_column(assistance_list($db),'request_id')),true),'deadline alone removes expired calls from active alerts');
    assistance_expire($db,(int)$visit['session_id']);
    assert_assistance(assistance_latest($db,(int)$visit['session_id'])['status']==='expired','expired status is recorded');
    assert_assistance(!assistance_resolve($db,$actor,$secondId),'expired calls do not report a successful resolution');
    assert_assistance(assistance_latest($db,(int)$visit['session_id'])['status']==='expired','late resolution cannot revive an expired call');
    try {assistance_request($db,$table,$token,str_repeat('x',501));throw new RuntimeException('Oversized concern accepted');}
    catch(OrderError $error) {assert_assistance($error->status===422,'concern length is limited to 500 characters');}
    $third=assistance_request($db,$table,$token,'Utensils');
    assert_assistance((int)$third['request_id']!==$secondId,'customer can call again after automatic expiry');
    dining_change_session($db,$actor,(int)$visit['session_id'],'close');
    assistance_expire($db,(int)$visit['session_id']);
    assert_assistance(assistance_latest($db,(int)$visit['session_id'])['status']==='expired','ending the visit also ends its assistance request');
    try {assistance_request($db,$table,$token,'Water');throw new RuntimeException('Closed visit accepted');}
    catch(OrderError $error) {assert_assistance($error->status===403,'closed visits cannot call staff');}
    $q=$db->prepare('SELECT COUNT(*) FROM dbo.staff_assistance_requests WHERE session_id=?');$q->execute([$visit['session_id']]);
    assert_assistance((int)$q->fetchColumn()===3,'all assistance history is retained');
    echo "$checks assistance checks passed.".PHP_EOL;
} catch(Throwable $error) {fwrite(STDERR,$error->getMessage().PHP_EOL);$failed=true;}
finally {if($db->inTransaction())$db->rollBack();echo 'All assistance test data rolled back; identity sequences may have gaps.'.PHP_EOL;}
exit(!empty($failed)?1:0);
