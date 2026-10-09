<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/assistance.php';
$db=null;
try {
    $actor=quvo_current_user();
    if(!$actor) throw new OrderError('Please sign in again.',401);
    if(!in_array($actor['role'],['admin','staff'],true)) throw new OrderError('Access denied.',403);
    $method=$_SERVER['REQUEST_METHOD'];
    if(!in_array($method,['GET','POST'],true)) throw new OrderError('Unsupported request.',405);
    if($method==='POST') quvo_require_post();
    $db=quvo_db(); dining_expire_sessions($db); assistance_expire($db);
    $resolved=false;
    if($method==='POST') {
        $input=orders_input();
        if(($input['action']??'')!=='resolve') throw new OrderError('Unknown alert action.');
        $db->beginTransaction();
        $resolved=assistance_resolve($db,(int)$actor['staff_id'],orders_id($input['id']??null));
        $db->commit();
    }
    quvo_json(['ok'=>true,'resolved'=>$resolved,'requests'=>assistance_list($db)]);
} catch(Throwable $error) { orders_error($db,$error); }
