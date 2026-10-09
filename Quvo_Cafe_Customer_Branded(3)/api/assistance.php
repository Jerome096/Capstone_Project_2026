<?php
declare(strict_types=1);
require_once __DIR__.'/../../Quvo_Cafe_Capstone/includes/guest.php';
require_once __DIR__.'/../../Quvo_Cafe_Capstone/includes/assistance.php';
$csrf=quvo_start_guest_session(); $db=null;
try {
    $method=$_SERVER['REQUEST_METHOD'];
    if(!in_array($method,['GET','POST'],true)) throw new OrderError('Unsupported request.',405);
    if($method==='POST' && !hash_equals($csrf,$_SERVER['HTTP_X_CSRF_TOKEN']??'')) throw new OrderError('Refresh this page and try again.',403);
    $code=$_GET['table']??'';
    if(!is_string($code) || !preg_match('/\A[A-Za-z0-9-]{1,20}\z/',$code)) throw new OrderError('Scan a valid table QR code.');
    $db=quvo_db();
    $q=$db->prepare('SELECT table_id FROM dbo.cafe_tables WHERE table_code=?'); $q->execute([$code]);
    $tableId=$q->fetchColumn();
    if($tableId===false) throw new OrderError('Table not found.',404);
    $tableId=(int)$tableId; $token=$_SESSION['tables'][$tableId]??null;
    dining_expire_sessions($db,$tableId); assistance_expire($db);
    $session=dining_guest_session($db,$tableId,$token);
    if(!$session || $session['status']!=='active') throw new OrderError('An approved dine-in session is required.',403);
    if($method==='POST') {
        $input=orders_input();
        $db->beginTransaction();
        $request=assistance_request($db,$tableId,$token,$input['concern']??'');
        $db->commit();
    } else $request=assistance_latest($db,(int)$session['session_id']);
    quvo_json(['ok'=>true,'request'=>$request]);
} catch(Throwable $error) { orders_error($db,$error); }
