<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/wifi-settings.php';
$db=null;
try{
    $actor=quvo_current_user();if(!$actor)throw new OrderError('Please sign in first.',401);
    wifi_admin_actor($actor);
    if(empty($_SESSION['admin_confirmed']))throw new OrderError('Confirm admin access before editing guest Wi-Fi.',403);
    $db=quvo_db();
    if($_SERVER['REQUEST_METHOD']==='GET')quvo_json(['ok'=>true,'wifi'=>wifi_settings_read($db)]);
    quvo_require_post();$input=orders_input(4096);
    $db->beginTransaction();$result=wifi_settings_save($db,$actor,$input);$db->commit();
    quvo_json(['ok'=>true,'wifi'=>$result]);
}catch(Throwable $error){orders_error($db,$error);}
