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
        if (isset($_GET['image'])) payment_send_image(payment_qr_image($db,$_GET['image'],$_GET['version']??null),'payment-qr');
        quvo_json(['ok'=>true,'methods'=>payment_qr_methods($db)]);
    }
    quvo_require_post();
    $action=$_POST['action']??'save_qr';
    if (!in_array($action,['add_method','remove_method','remove_qr','save_qr'],true)) throw new OrderError('Unknown payment action.');
    if ($action!=='save_qr') {
        $db->beginTransaction();
        match($action) {
            'add_method'=>payment_add_method($db,(int)$actor['staff_id'],$_POST['display_name']??null),
            'remove_method'=>payment_remove_method($db,(int)$actor['staff_id'],$_POST['payment_method']??null),
            'remove_qr'=>payment_remove_qr($db,$_POST['payment_method']??null),
        };
        $db->commit();
        quvo_json(['ok'=>true,'methods'=>payment_qr_methods($db)]);
    }
    $file=$_FILES['image']??null;
    if (!$file || $file['error']!==UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) throw new OrderError('Choose a PNG or JPG QR image no larger than 2 MB.');
    if ($file['size']>2097152) throw new OrderError('The QR image exceeds 2 MB.');
    $image=payment_image(file_get_contents($file['tmp_name']));
    $db->beginTransaction();
    payment_qr_save($db,(int)$actor['staff_id'],$_POST['payment_method']??null,$image);
    $db->commit();
    quvo_json(['ok'=>true,'methods'=>payment_qr_methods($db)]);
} catch(Throwable $error) {orders_error($db,$error);}
