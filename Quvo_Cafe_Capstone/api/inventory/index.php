<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';require_once __DIR__.'/../../includes/orders.php';
$db=null;try{
    $actor=quvo_current_user();inventory_access($actor,!empty($_SESSION['admin_confirmed']));$method=$_SERVER['REQUEST_METHOD'];if(!in_array($method,['GET','POST'],true))throw new OrderError('Use GET or POST.',405);
    if($method==='POST')quvo_require_post();$db=quvo_db();$db->beginTransaction();
    if($method==='GET'){inventory_lock($db);inventory_normalize_negative($db,(int)$actor['staff_id']);}
    $result=$method==='POST'?inventory_mutate($db,(int)$actor['staff_id'],orders_input()):[];
    $offset=filter_var($_GET['offset']??0,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>1000000]]);if($offset===false)throw new OrderError('Invalid movement page.');
    $snapshot=inventory_snapshot($db,$offset);$db->commit();quvo_json(['ok'=>true,'snapshot'=>$snapshot]+$result);
}catch(Throwable $error){orders_error($db,$error);}
