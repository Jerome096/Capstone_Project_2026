<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/orders.php';
$db=null;
try {
    $actor=quvo_current_user(); ordering_access($actor);
    $method=$_SERVER['REQUEST_METHOD'];
    if (!in_array($method,['GET','POST'],true)) throw new OrderError('Use GET or POST.',405);
    if ($method==='POST') quvo_require_post();
    $db=quvo_db();
    if ($method==='GET') quvo_json(['ok'=>true,'ordering'=>ordering_status($db,true)]);
    $input=orders_input(4096); $db->beginTransaction();
    $status=ordering_change($db,$actor,$input,hash('sha256',session_id()),$_SESSION['credential_stamp']??'');
    $db->commit(); quvo_json(['ok'=>true,'ordering'=>$status]);
} catch(Throwable $error) { orders_error($db,$error); }
