<?php
declare(strict_types=1);
require_once __DIR__.'/orders.php';

// Image bytes stay in SQL and are served through the appropriate protected endpoint.
function payment_image(string $bytes): array
{
    if ($bytes === '' || strlen($bytes) > 2097152) throw new OrderError('Use a receipt or QR image no larger than 2 MB.');
    $info = @getimagesizefromstring($bytes);
    if (!$info || !in_array($info['mime'], ['image/png','image/jpeg'], true) ||
        $info[0] > 8000 || $info[1] > 8000 || $info[0] * $info[1] > 16000000) {
        throw new OrderError('Upload a valid PNG or JPG image, up to 16 million pixels.');
    }
    return ['bytes'=>$bytes, 'mime'=>$info['mime'], 'hash'=>hash('sha256',$bytes)];
}

function payment_receipt_input(mixed $value): array
{
    if (!is_string($value) || strlen($value) > 2796230 ||
        !preg_match('~\Adata:image/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)\z~', $value, $match)) {
        throw new OrderError('Upload a PNG or JPG payment receipt before placing your order.');
    }
    $bytes = base64_decode($match[1], true);
    if ($bytes === false) throw new OrderError('The receipt image is invalid.');
    return payment_image($bytes);
}

function payment_admin(?array $actor, bool $confirmed): void
{
    if (!$actor) throw new OrderError('Please sign in again.',401);
    if ($actor['role'] !== 'admin' || !$confirmed) throw new OrderError('Confirm access in the Admin workspace first.',403);
}

function payment_qr_methods(PDO $db): array
{
    $result = [];
    foreach ($db->query('SELECT m.payment_method,m.display_name,CONVERT(varchar(36),q.qr_version) qr_version,q.updated_at FROM dbo.online_payment_methods m LEFT JOIN dbo.payment_qr_codes q ON q.payment_method=m.payment_method WHERE m.is_active=1 ORDER BY m.updated_at,m.payment_method')->fetchAll() as $row) {
        $result[$row['payment_method']] = ['label'=>$row['display_name'],'available'=>$row['qr_version']!==null,'version'=>$row['qr_version'],'updated_at'=>$row['updated_at']];
    }
    return $result;
}

function payment_qr_save(PDO $db, int $staffId, mixed $method, array $image): void
{
    payment_active_method($db,$method);
    $q=$db->prepare('SELECT payment_method FROM dbo.payment_qr_codes WITH (UPDLOCK,HOLDLOCK) WHERE payment_method=?');
    $q->execute([$method]);$exists=$q->fetchColumn();$q->closeCursor();
    if ($exists) {
        $q=$db->prepare('UPDATE dbo.payment_qr_codes SET image_mime=?,image_bytes=CONVERT(varbinary(max),?,2),qr_version=NEWID(),updated_by_staff_id=?,updated_at=SYSUTCDATETIME() WHERE payment_method=?');
        $q->execute([$image['mime'],bin2hex($image['bytes']),$staffId,$method]);
    } else {
        $q=$db->prepare('INSERT dbo.payment_qr_codes(image_mime,image_bytes,updated_by_staff_id,payment_method) VALUES(?,CONVERT(varbinary(max),?,2),?,?)');
        $q->execute([$image['mime'],bin2hex($image['bytes']),$staffId,$method]);
    }
}

function payment_qr_image(PDO $db, mixed $method, mixed $version): array
{
    if (!is_string($method) || !is_string($version)) throw new OrderError('QR code not found.',404);
    $q=$db->prepare('SELECT q.image_mime,CONVERT(varchar(max),q.image_bytes,2) image_hex FROM dbo.payment_qr_codes q JOIN dbo.online_payment_methods m ON m.payment_method=q.payment_method WHERE m.is_active=1 AND q.payment_method=? AND CONVERT(varchar(36),q.qr_version)=?');
    $q->execute([$method,$version]);
    return $q->fetch() ?: throw new OrderError('This QR code has changed. Refresh the payment options.',404);
}

function payment_receipt_image(PDO $db, int $orderId, ?int $customerId=null): array
{
    $q=$db->prepare("SELECT r.image_mime,CONVERT(varchar(max),r.image_bytes,2) image_hex FROM dbo.online_payment_receipts r JOIN dbo.orders o ON o.order_id=r.order_id WHERE o.order_source='online' AND o.order_id=?".
        ($customerId!==null?' AND o.customer_account_id=?':''));
    $q->execute($customerId!==null?[$orderId,$customerId]:[$orderId]);
    return $q->fetch() ?: throw new OrderError('Receipt image not found.',404);
}

// Staff history of customer uploads. Image bytes remain behind the protected image endpoint.
function payment_receipt_records(PDO $db,mixed $date,mixed $status='all',mixed $offset=0,mixed $search=''):array
{
    if(!is_string($date)||!preg_match('/\A[0-9]{4}-[0-9]{2}-[0-9]{2}\z/',$date))throw new OrderError('Choose a valid receipt date.');
    $day=DateTimeImmutable::createFromFormat('!Y-m-d',$date,new DateTimeZone('Asia/Manila'));
    if(!$day||$day->format('Y-m-d')!==$date)throw new OrderError('Choose a valid receipt date.');
    if(!is_string($status)||!in_array($status,['all','pending','paid','served','cancelled'],true))throw new OrderError('Choose a valid upload status.');
    $offset=filter_var($offset,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>1000000]]);
    if($offset===false)throw new OrderError('Invalid upload list offset.');
    $search=orders_text($search,100);
    $event="CASE WHEN o.order_status='cancelled' THEN COALESCE(o.cancelled_at,o.updated_at) ELSE COALESCE(p.paid_at,r.uploaded_at) END";
    $uploadStatus="CASE WHEN o.order_status='cancelled' THEN 'cancelled' WHEN o.order_status='served' THEN 'served' WHEN p.payment_id IS NOT NULL THEN 'paid' ELSE 'pending' END";
    $where=["o.order_source='online'","$event >= ?","$event < ?"];
    $params=[$day->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),$day->modify('+1 day')->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s')];
    if($status!=='all'){$where[]="$uploadStatus = ?";$params[]=$status;}
    if($search!==''){
        $where[]="LOWER(CONCAT(o.order_number,' ',o.customer_name,' ',r.payment_method,' ',m.display_name)) LIKE LOWER(?)";
        $params[]='%'.str_replace(['[','%','_'],['[[]','[%]','[_]'],$search).'%';
    }
    $sql="SELECT o.order_id,o.order_number,o.customer_name,o.total_amount,o.order_status,o.cancellation_reason,
        o.cancelled_at,o.created_at,r.uploaded_at,r.payment_method,f.fulfillment_type,
        CASE WHEN EXISTS(SELECT 1 FROM dbo.online_delivery_bookings dbk WHERE dbk.order_id=o.order_id) THEN 1 ELSE 0 END has_delivery_booking,COALESCE(m.display_name,r.payment_method) payment_method_label,p.paid_at,
        CASE WHEN p.payment_id IS NOT NULL THEN 'paid' ELSE 'unpaid' END payment_status,
        $uploadStatus upload_status,$event record_at,
        CASE WHEN o.order_status='cancelled' THEN 'cancellation' WHEN p.paid_at IS NOT NULL THEN 'payment' ELSE 'upload' END date_basis
        FROM dbo.online_payment_receipts r JOIN dbo.orders o ON o.order_id=r.order_id
        LEFT JOIN dbo.order_fulfillments f ON f.order_id=o.order_id
        LEFT JOIN dbo.payments p ON p.order_id=o.order_id
        LEFT JOIN dbo.online_payment_methods m ON m.payment_method=r.payment_method
        WHERE ".implode(' AND ',$where)." ORDER BY $event DESC,o.order_id DESC OFFSET ? ROWS FETCH NEXT 51 ROWS ONLY";
    $q=$db->prepare($sql);
    foreach($params as $index=>$value)$q->bindValue($index+1,$value,PDO::PARAM_STR);
    $q->bindValue(count($params)+1,$offset,PDO::PARAM_INT);$q->execute();$rows=$q->fetchAll();$q->closeCursor();
    $more=count($rows)>50;$rows=array_slice($rows,0,50);
    foreach($rows as &$row){
        $row['order_id']=(string)$row['order_id'];$row['total_amount']=orders_money(orders_cents($row['total_amount']));
        $row['record_date']=(new DateTimeImmutable($row['record_at'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Manila'))->format('Y-m-d');
    }unset($row);
    return ['uploads'=>$rows,'next_offset'=>$more?$offset+50:null];
}

// POS uses configured names even when no QR image has been uploaded.
function payment_pos_methods(PDO $db):array {
    $methods=[['code'=>'Cash','label'=>'Cash']];
    foreach($db->query("SELECT payment_method,display_name FROM dbo.online_payment_methods WHERE is_active=1 AND payment_method<>'Cash' ORDER BY updated_at,payment_method")->fetchAll() as $row)
        $methods[]=['code'=>$row['payment_method'],'label'=>$row['display_name']];
    return $methods;
}
function payment_active_method(PDO $db, mixed $method): array
{
    if (!is_string($method) || strlen($method)>10) throw new OrderError('Choose a valid payment method.');
    $q=$db->prepare('SELECT payment_method,display_name FROM dbo.online_payment_methods WITH (UPDLOCK,HOLDLOCK) WHERE payment_method=? AND is_active=1');
    $q->execute([$method]);$row=$q->fetch();$q->closeCursor();
    return $row ?: throw new OrderError('This payment method is no longer available.',422,'payment_unavailable');
}

function payment_add_method(PDO $db, int $staffId, mixed $name): string
{
    $name=orders_text($name,50,true);
    if (strcasecmp($name,'Cash')===0) throw new OrderError('Cash is not available for online ordering.');
    $q=$db->prepare('SELECT payment_method,is_active FROM dbo.online_payment_methods WITH (UPDLOCK,HOLDLOCK) WHERE display_name=?');
    $q->execute([$name]);$old=$q->fetch();$q->closeCursor();
    if ($old && $old['is_active']) throw new OrderError('A payment method with this name already exists.',409);
    if ($old) {
        $db->prepare('UPDATE dbo.online_payment_methods SET is_active=1,updated_by_staff_id=?,updated_at=SYSUTCDATETIME() WHERE payment_method=?')->execute([$staffId,$old['payment_method']]);
        return $old['payment_method'];
    }
    $code='PM'.bin2hex(random_bytes(4));
    $db->prepare('INSERT dbo.online_payment_methods(payment_method,display_name,updated_by_staff_id) VALUES(?,?,?)')->execute([$code,$name,$staffId]);
    return $code;
}

function payment_remove_qr(PDO $db, mixed $method): void
{
    payment_active_method($db,$method);
    $db->prepare('DELETE FROM dbo.payment_qr_codes WHERE payment_method=?')->execute([$method]);
}

function payment_remove_method(PDO $db, int $staffId, mixed $method): void
{
    payment_remove_qr($db,$method);
    $db->prepare('UPDATE dbo.online_payment_methods SET is_active=0,updated_by_staff_id=?,updated_at=SYSUTCDATETIME() WHERE payment_method=?')->execute([$staffId,$method]);
}

function payment_send_image(array $image, string $name, bool $download=false): never
{
    header('Content-Type: '.$image['image_mime']);
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store');
    header('Content-Disposition: '.($download?'attachment':'inline').'; filename="'.$name.($image['image_mime']==='image/png'?'.png':'.jpg').'"');
    echo hex2bin($image['image_hex']);
    exit;
}
