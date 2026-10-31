<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/operating-hours.php';
$db=null;
try {
    $actor=quvo_current_user();$method=$_SERVER['REQUEST_METHOD'];
    if(!in_array($method,['GET','POST'],true))throw new OrderError('Use GET or POST.',405);
    operating_hours_access($actor,!empty($_SESSION['admin_confirmed']),$method==='POST');
    $db=quvo_db();
    if($method==='GET')quvo_json(['ok'=>true,'hours'=>operating_hours_public(operating_hours_context($db))]);
    quvo_require_post();$db->beginTransaction();$hours=operating_hours_save($db,$actor,orders_input());$db->commit();quvo_json(['ok'=>true,'hours'=>$hours]);
}catch(Throwable $error){orders_error($db,$error);}
