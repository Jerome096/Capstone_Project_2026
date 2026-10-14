<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';require_once __DIR__.'/../../includes/sales.php';
try{
    $actor=quvo_current_user();if(!$actor)throw new OrderError('Please sign in again.',401);
    if($actor['role']!=='admin'||empty($_SESSION['admin_confirmed']))throw new OrderError('Confirmed admin access is required.',403);
    if($_SERVER['REQUEST_METHOD']!=='GET')throw new OrderError('Use GET for sales history.',405);
    quvo_json(['ok'=>true]+sales_history(quvo_db(),$_GET['view']??'daily',$_GET['offset']??0));
}catch(Throwable $error){orders_error(null,$error);}
