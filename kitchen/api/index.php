<?php
declare(strict_types=1);
require_once __DIR__.'/../../Quvo_Cafe_Staff_Admin_Operations/includes/auth.php';
require_once __DIR__.'/../../Quvo_Cafe_Staff_Admin_Operations/includes/kitchen.php';
$db=null;
try{
    quvo_start_session();
    if($_SERVER['REQUEST_METHOD']==='GET'&&($_GET['action']??'')==='session'){
        $user=quvo_current_user();if($user&&!in_array($user['role'],['admin','staff','kitchen'],true))$user=null;
        quvo_json(['ok'=>true,'user'=>$user,'csrf'=>quvo_csrf()]);
    }
    if($_SERVER['REQUEST_METHOD']==='POST'){
        quvo_require_post();$input=orders_input();$action=$input['action']??'';
        if($action==='login'){
            $username=$input['username']??null;$password=$input['password']??null;
            if(!is_string($username)||!is_string($password)||trim($username)===''||strlen($username)>50||$password===''||strlen($password)>4096)throw new OrderError('Enter your username and password.');
            $q=quvo_db()->prepare('SELECT s.staff_id,s.username,s.full_name,s.password_hash,s.is_active,r.role_name FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.username=?');$q->execute([trim($username)]);$row=$q->fetch();$q->closeCursor();
            $valid=password_verify($password,$row['password_hash']??'$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
            if(!$row||!$valid||!(bool)$row['is_active']||!in_array(strtolower($row['role_name']),['admin','staff','kitchen'],true))throw new OrderError('Check your kitchen/staff account and password.',401);
            session_regenerate_id(true);$_SESSION=['staff_id'=>(int)$row['staff_id'],'last_activity'=>time(),'credential_stamp'=>hash('sha256',$row['password_hash'])];
            quvo_json(['ok'=>true,'user'=>quvo_public_user($row),'csrf'=>quvo_csrf()]);
        }
    }
    $actor=quvo_current_user();if(!$actor)throw new OrderError('Please sign in to the kitchen.',401);kitchen_actor($actor);
    if($_SERVER['REQUEST_METHOD']==='GET')quvo_json(['ok'=>true]+kitchen_list(quvo_db(),$_GET['offset']??0));
    if($_SERVER['REQUEST_METHOD']!=='POST')throw new OrderError('Use GET or POST.',405);
    if($action==='logout'){$_SESSION=[];session_regenerate_id(true);quvo_json(['ok'=>true,'csrf'=>quvo_csrf()]);}
    if($action!=='ready')throw new OrderError('Unknown kitchen action.');
    $id=orders_id($input['id']??null);$db=quvo_db();$db->beginTransaction();$result=kitchen_ready($db,$actor,$id);$db->commit();quvo_json(['ok'=>true]+$result);
}catch(Throwable $error){orders_error($db,$error);}
