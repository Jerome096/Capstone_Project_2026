<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/payment-images.php';
$db=null;
try {
    $actor=quvo_current_user();
    payment_admin($actor,!empty($_SESSION['admin_confirmed']));
    $method=$_SERVER['REQUEST_METHOD'];
    if (!in_array($method,['GET','POST'],true)) {header('Allow: GET, POST');throw new OrderError('Unsupported request.',405);}
    $db=quvo_db();
    if ($method==='GET') {
        if (isset($_GET['image'])) payment_send_image(payment_qr_image($db,$_GET['image'],$_GET['version']??null,false),'payment-qr');
        quvo_json(['ok'=>true,'methods'=>payment_qr_methods($db,false)]);
    }
    quvo_require_post();
    $action=$_POST['action']??'save_qr';
    if (!in_array($action,['add_method','remove_method','remove_qr','save_qr','set_visibility'],true)) throw new OrderError('Unknown payment action.');
    if($action==='set_visibility'){
        $enabled=$_POST['online_enabled']??null;if(!in_array($enabled,['0','1'],true))throw new OrderError('Choose whether to show this method in online ordering.');
        $db->beginTransaction();$code=$_POST['payment_method']??null;
        if(payment_set_online_visibility($db,(int)$actor['staff_id'],$code,$enabled==='1'))sales_audit_method_event($db,(int)$actor['staff_id'],$code,$enabled==='1'?'online_enabled':'online_disabled');
        $db->commit();quvo_json(['ok'=>true,'methods'=>payment_qr_methods($db,false)]);
    }
    if ($action!=='save_qr') {
        $db->beginTransaction();
        $before=null;$code=$_POST['payment_method']??'';
        if(is_string($code)&&$code!==''){$q=$db->prepare('SELECT m.display_name,CONVERT(varchar(36),q.qr_version) qr_version FROM dbo.online_payment_methods m LEFT JOIN dbo.payment_qr_codes q ON q.payment_method=m.payment_method WHERE m.payment_method=?');$q->execute([$code]);$before=$q->fetch()?:null;$q->closeCursor();}
        $result=match($action) {
            'add_method'=>payment_add_method($db,(int)$actor['staff_id'],$_POST['display_name']??null),
            'remove_method'=>payment_remove_method($db,(int)$actor['staff_id'],$_POST['payment_method']??null),
            'remove_qr'=>payment_remove_qr($db,$_POST['payment_method']??null),
        };
        if($action==='add_method'){
            $code=$result;
            if(isset($_POST['online_enabled'])){
                if(!in_array($_POST['online_enabled'],['0','1'],true))throw new OrderError('Choose a valid online visibility setting.');
                payment_set_online_visibility($db,(int)$actor['staff_id'],$code,$_POST['online_enabled']==='1');
            }
        }
        sales_audit_method_event($db,(int)$actor['staff_id'],$code,$action,$before);
        $db->commit();
        quvo_json(['ok'=>true,'methods'=>payment_qr_methods($db,false)]);
    }
    $file=$_FILES['image']??null;
    if (!$file || $file['error']!==UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) throw new OrderError('Choose a PNG or JPG QR image no larger than 2 MB.');
    if ($file['size']>2097152) throw new OrderError('The QR image exceeds 2 MB.');
    $image=payment_image(file_get_contents($file['tmp_name']));
    $db->beginTransaction();
    payment_qr_save($db,(int)$actor['staff_id'],$_POST['payment_method']??null,$image);
    sales_audit_method_event($db,(int)$actor['staff_id'],$_POST['payment_method'],'save_qr');
    $db->commit();
    quvo_json(['ok'=>true,'methods'=>payment_qr_methods($db,false)]);
} catch(Throwable $error) {orders_error($db,$error);}
