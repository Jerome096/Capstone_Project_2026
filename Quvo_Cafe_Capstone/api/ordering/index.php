<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/orders.php';
require_once __DIR__.'/../../includes/online.php';
require_once __DIR__.'/../../includes/ordering.php';
$db=null;
try {
    $actor=quvo_current_user(); ordering_access($actor);
    ordering_assert_backend(true);
    $method=$_SERVER['REQUEST_METHOD'];
    if (!in_array($method,['GET','POST'],true)) throw new OrderError('Use GET or POST.',405);
    if ($method==='POST') quvo_require_post();
    $db=quvo_db();
    if ($method==='GET') quvo_json(['ok'=>true,'ordering'=>ordering_status($db,true)]);
    $input=orders_input(4096); $db->beginTransaction();
    $status=ordering_change($db,$actor,$input,hash('sha256',session_id()),$_SESSION['credential_stamp']??'');
    $db->commit(); quvo_json(['ok'=>true,'ordering'=>$status]);
} catch(Throwable $error) {
    if($error instanceof OrderError && $error->errorCode==='ordering_setup_required') {
        $error=new OrderError('The ordering database update is not complete. Run the ordering SQL update in SSMS, then click Start accepting orders again.',503,'ordering_setup_required');
    } elseif($error instanceof OrderError && $error->errorCode==='ordering_files_required') {
        $error=new OrderError('The ordering website update is incomplete. Extract the update with file replacement enabled, then refresh this page.',503,'ordering_files_required');
    }
    orders_error($db,$error);
}
