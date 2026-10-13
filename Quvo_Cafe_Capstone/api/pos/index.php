<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/pos.php';
$db=null;
try {
    $actor=quvo_current_user();if(!$actor)throw new OrderError('Please sign in again.',401);
    if(!in_array($actor['role'],['admin','staff'],true))throw new OrderError('Cashier access is required.',403);
    quvo_require_post();$input=orders_input();$db=quvo_db();$db->beginTransaction();
    $result=pos_submit($db,$actor,$input);$db->commit();quvo_json(['ok'=>true]+$result,$result['replayed']?200:201);
}catch(Throwable $error){orders_error($db,$error);}
