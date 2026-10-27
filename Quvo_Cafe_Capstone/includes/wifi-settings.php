<?php
declare(strict_types=1);
require_once __DIR__.'/orders.php';

function wifi_admin_actor(array $actor):void
{
    if(($actor['role']??null)!=='admin')throw new OrderError('Only admins can edit guest Wi-Fi.',403);
}
function wifi_settings_read(PDO $db):array
{
    $empty=['networkName'=>'','password'=>'','version'=>null,'setupRequired'=>true];
    if(!$db->query("SELECT OBJECT_ID('dbo.guest_wifi_settings','U')")->fetchColumn())return $empty;
    $row=$db->query('SELECT network_name,network_password,CONVERT(varchar(36),settings_version) version FROM dbo.guest_wifi_settings WHERE settings_id=1')->fetch();
    return $row?['networkName'=>$row['network_name'],'password'=>$row['network_password'],'version'=>$row['version'],'setupRequired'=>false]:$empty;
}
function wifi_settings_save(PDO $db,array $actor,mixed $input):array
{
    wifi_admin_actor($actor);
    if(!$db->inTransaction())throw new LogicException('Wi-Fi updates require a transaction.');
    if(!is_array($input))throw new OrderError('Enter the Wi-Fi name and password.');
    $values=[];
    foreach(['networkName'=>100,'password'=>128] as $field=>$limit){
        $value=$input[$field]??null;
        if(!is_string($value)||preg_match('//u',$value)!==1||preg_match('/[\x00-\x1f\x7f]/u',$value)||trim($value)===''||preg_match_all('/./us',$value)>$limit)throw new OrderError('Enter a valid '.($field==='networkName'?'Wi-Fi name':'Wi-Fi password').' (up to '.$limit.' characters).');
        $values[$field]=$value;
    }
    $version=$input['version']??null;
    if(!is_string($version)||!preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i',$version))throw new OrderError('Reload the saved Wi-Fi settings before saving.',409,'wifi_changed');
    if(wifi_settings_read($db)['setupRequired'])throw new OrderError('Install the guest Wi-Fi SQL update before saving.',503,'wifi_setup_required');
    $q=$db->query('SELECT CONVERT(varchar(36),settings_version) version FROM dbo.guest_wifi_settings WITH (UPDLOCK,HOLDLOCK) WHERE settings_id=1');$saved=$q->fetchColumn();$q->closeCursor();
    if(!$saved||strcasecmp($saved,$version)!==0)throw new OrderError('Another admin changed the Wi-Fi details. Your draft is kept. Reload saved settings before saving again.',409,'wifi_changed');
    $db->prepare('UPDATE dbo.guest_wifi_settings SET network_name=?,network_password=?,settings_version=NEWID(),updated_by_staff_id=?,updated_at=SYSUTCDATETIME() WHERE settings_id=1')->execute([$values['networkName'],$values['password'],(int)$actor['staff_id']]);
    // Do not put credentials in audit details.
    $db->prepare("INSERT dbo.system_audit_log(actor_staff_id,action,entity_type,entity_key,details_json) VALUES(?,'guest_wifi_updated','guest_wifi','1',?)")->execute([(int)$actor['staff_id'],json_encode(['fields'=>['networkName','password']],JSON_THROW_ON_ERROR)]);
    return wifi_settings_read($db);
}
function wifi_guest_details(PDO $db,int $tableId,?string $token):array
{
    $session=dining_guest_session($db,$tableId,$token);
    $q=$db->prepare('SELECT is_active FROM dbo.cafe_tables WHERE table_id=?');$q->execute([$tableId]);$active=$q->fetchColumn();
    if(!$active||!$session||$session['status']!=='active')throw new OrderError('An approved active dine-in visit is required to view Wi-Fi.',403);
    $id=(int)$session['session_id'];
    $q=$db->prepare("SELECT TOP(1) o.order_id FROM dbo.orders o JOIN dbo.payments p ON p.order_id=o.order_id WHERE o.session_id=? AND o.order_source='dine_in' AND o.order_status<>'cancelled' AND p.amount_applied>=o.total_amount");$q->execute([$id]);
    if(!$q->fetchColumn())return ['available'=>false,'reason'=>'payment_required','sessionId'=>(string)$id];
    $settings=wifi_settings_read($db);
    if($settings['setupRequired']||$settings['networkName']===''||$settings['password']==='')return ['available'=>false,'reason'=>'unavailable','sessionId'=>(string)$id];
    return ['available'=>true,'networkName'=>$settings['networkName'],'password'=>$settings['password'],'version'=>$settings['version'],'sessionId'=>(string)$id];
}
