<?php
declare(strict_types=1);
require_once __DIR__.'/../../Quvo_Cafe_Capstone/includes/online.php';
require_once __DIR__.'/../../Quvo_Cafe_Capstone/includes/ordering.php';
require_once __DIR__.'/../../Quvo_Cafe_Capstone/includes/website-content.php';
if($_SERVER['REQUEST_METHOD']==='GET'&&($_GET['view']??'')==='menu-image'){try{menu_image_send(quvo_db(),$_GET['id']??null,$_GET['version']??null);}catch(Throwable $error){orders_error(null,$error);}}
$csrf=online_start_session();$db=null;
try {
    $method=$_SERVER['REQUEST_METHOD'];
    if(!in_array($method,['GET','POST'],true)) {header('Allow: GET, POST');throw new OrderError('Unsupported request.',405);}
    if($method==='POST'&&!hash_equals($csrf,$_SERVER['HTTP_X_CSRF_TOKEN']??'')) throw new OrderError('Refresh this page and try again.',403);
    $db=quvo_db();$account=online_current($db);
    if($method==='GET') {
        $view=$_GET['view']??'session';
        if($view==='ordering') {ordering_assert_backend(true);quvo_json(['ok'=>true,'ordering'=>ordering_status($db)]);}
        if ($view==='payment-qr') payment_send_image(payment_qr_image($db,$_GET['method']??null,$_GET['version']??null),'quvo-payment-qr',isset($_GET['download']));
        if($view==='delivery-settings') quvo_json(['ok'=>true,'delivery'=>delivery_settings($db)]);
        if($view==='session') quvo_json(['ok'=>true,'csrf'=>$csrf,'account'=>$account?online_public_account($db,$account):null]);
        if($view==='registration-status') quvo_json(['ok'=>true,'csrf'=>$csrf,'registration'=>$account?null:online_registration_status($db)]);
        if($view==='menu') quvo_json(['ok'=>true,'csrf'=>$csrf,'items'=>online_menu($db)]);
        if($view==='about') quvo_json(['ok'=>true,'content'=>website_content_read($db)['content']]);
        if(!$account) throw new OrderError('Please sign in first.',401);
        if ($view==='payments') quvo_json(['ok'=>true,'methods'=>payment_qr_methods($db)]);
        if ($view==='receipt') payment_send_image(payment_receipt_image($db,orders_id($_GET['id']??null),(int)$account['customer_account_id']),'payment-receipt');
        if($view==='delivery-booking') payment_send_image(delivery_booking_image($db,orders_id($_GET['id']??null),(int)$account['customer_account_id']),'lalamove-booking');
        if($view==='orders') {
            $result=isset($_GET['id'])?['order'=>online_order($db,(int)$account['customer_account_id'],orders_id($_GET['id']))]:online_orders($db,(int)$account['customer_account_id'],$_GET['offset']??0,$_GET['scope']??'all');
            quvo_json(['ok'=>true,'csrf'=>$csrf]+$result);
        }
        throw new OrderError('Unknown view.',404);
    }
    $input=orders_input(6291456);$action=$input['action']??null;
    if($action==='logout') {
        $_SESSION=[];session_regenerate_id(true);$csrf=online_start_session();
        quvo_json(['ok'=>true,'csrf'=>$csrf]);
    }
    if(in_array($action,['register','register-resend','register-verify'],true)) {
        if($account) throw new OrderError('You are already signed in.',409);
        $ip=$_SERVER['REMOTE_ADDR']??'unknown';
        if($action==='register-verify') {
            $row=online_registration_verify($db,$input['code']??null);
            online_sign_in($row);
            quvo_json(['ok'=>true,'csrf'=>$_SESSION['csrf'],'account'=>online_public_account($db,$row)],201);
        }
        $pending=$action==='register'?online_registration_begin($db,$input,$ip):online_registration_resend($db,$ip);
        quvo_json(['ok'=>true,'csrf'=>$csrf,'registration'=>$pending],202);
    }
    if($action==='login') {
        $attempts=$_SESSION['auth_attempts']??[];$attempts=array_values(array_filter($attempts,fn($time)=>$time>time()-300));
        if(count($attempts)>=10) throw new OrderError('Too many attempts. Please try again in five minutes.',429);
        $attempts[]=time();$_SESSION['auth_attempts']=$attempts;
        $db->beginTransaction();
        $row=online_login($db,$input);
        $db->commit();online_sign_in($row);unset($_SESSION['auth_attempts']);
        unset($_SESSION['registration_token']);
        quvo_json(['ok'=>true,'csrf'=>$_SESSION['csrf'],'account'=>online_public_account($db,$row)]);
    }
    if(!$account) throw new OrderError('Please sign in first.',401);
    $id=(int)$account['customer_account_id'];$db->beginTransaction();
    if($action==='submit') {
        ordering_assert_backend(true);
        $result=online_submit($db,$id,$input);$db->commit();
        quvo_json(['ok'=>true,'csrf'=>$csrf]+$result,$result['replayed']?200:201);
    }
    $row=match($action) {
        'profile'=>online_update_profile($db,$id,$input),
        'password'=>online_change_password($db,$id,$input),
        default=>throw new OrderError('Unknown action.')
    };
    $db->commit();
    if($action==='password') online_sign_in($row);
    quvo_json(['ok'=>true,'csrf'=>$_SESSION['csrf'],'account'=>online_public_account($db,$row)]);
} catch(Throwable $e) {
    if($db && $db->inTransaction()) $db->rollBack();
    if($e instanceof PDOException && in_array((int)($e->errorInfo[1]??0),[2601,2627],true))
        quvo_json(['ok'=>false,'error'=>'This email or submission is already registered. Check your details and retry.'],409);
    orders_error($db,$e);
}
