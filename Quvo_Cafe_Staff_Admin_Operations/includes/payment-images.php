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

function payment_validate_customer_reference(PDO $db,string $reference): bool
{
    $ready=orders_customer_reference_ready($db);
    if(!$ready&&$reference!=='')throw new OrderError('Reference-number entry is temporarily unavailable. Leave the optional reference blank to submit, or ask staff for help.',422,'payment_reference_setup_required');
    return $ready;
}

function payment_store_customer_receipt(PDO $db,int $orderId,string $method,string $version,array $image,string $reference=''): void
{
    $reference=orders_text($reference,100);$ready=payment_validate_customer_reference($db,$reference);
    $sql='INSERT dbo.online_payment_receipts(order_id,payment_method,qr_version,image_mime,image_bytes,image_hash'.($ready?',customer_reference':'').') VALUES(?,?,?,?,CONVERT(varbinary(max),?,2),CONVERT(binary(32),?,2)'.($ready?',?':'').')';
    $params=[$orderId,$method,$version,$image['mime'],bin2hex($image['bytes']),$image['hash']];
    if($ready)$params[]=$reference===''?null:$reference;
    $db->prepare($sql)->execute($params);
}

function payment_dine_input(array $input): array
{
    $choice=$input['payment_choice']??'counter';
    $reference=orders_text($input['payment_reference']??'',100);
    if(!in_array($choice,['counter','qr'],true))throw new OrderError('Choose Pay at counter or Pay by QR.');
    if($choice==='counter'){
        if(isset($input['receipt_image'])||isset($input['payment_method'])||isset($input['payment_qr_version'])||$reference!=='')throw new OrderError('Choose Pay by QR to submit a payment receipt or reference.');
        return ['choice'=>'counter','method'=>null,'version'=>null,'receipt'=>null,'reference'=>''];
    }
    $method=$input['payment_method']??null;$version=$input['payment_qr_version']??null;
    if(!is_string($method)||$method===''||strlen($method)>10||$method==='Cash')throw new OrderError('Choose an available QR payment method.');
    if(!is_string($version)||!preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i',$version))throw new OrderError('Refresh the QR payment options and try again.',409,'payment_qr_changed');
    return ['choice'=>'qr','method'=>$method,'version'=>$version,'receipt'=>payment_receipt_input($input['receipt_image']??null),'reference'=>$reference];
}

function payment_dine_validate(PDO $db,array $payment): void
{
    if($payment['choice']!=='qr')return;
    // Dine-in uses active in-store methods, including those hidden from online pickup.
    payment_active_method($db,$payment['method']);
    $q=$db->prepare('SELECT CONVERT(varchar(36),qr_version) FROM dbo.payment_qr_codes WITH(HOLDLOCK) WHERE payment_method=?');$q->execute([$payment['method']]);$version=$q->fetchColumn();$q->closeCursor();
    if(!$version)throw new OrderError('This payment QR is no longer available. Ask the cashier before paying again.',422,'payment_unavailable');
    if(strcasecmp($version,$payment['version'])!==0)throw new OrderError('The payment QR changed. Ask the cashier to check any payment already sent before submitting again.',409,'payment_qr_changed');
}

function payment_visibility_ready(PDO $db): bool
{
    return (bool)$db->query("SELECT CASE WHEN COL_LENGTH('dbo.online_payment_methods','online_enabled') IS NULL THEN 0 ELSE 1 END")->fetchColumn();
}

function payment_qr_methods(PDO $db, bool $onlineOnly=true): array
{
    $result = [];
    $ready=payment_visibility_ready($db);
    foreach ($db->query('SELECT m.payment_method,m.display_name,'.($ready?'m.online_enabled':'CAST(1 AS bit) online_enabled').',CONVERT(varchar(36),q.qr_version) qr_version,q.updated_at FROM dbo.online_payment_methods m LEFT JOIN dbo.payment_qr_codes q ON q.payment_method=m.payment_method WHERE m.is_active=1'.($onlineOnly&&$ready?' AND m.online_enabled=1':'').' ORDER BY m.updated_at,m.payment_method')->fetchAll() as $row) {
        $result[$row['payment_method']] = ['label'=>$row['display_name'],'available'=>$row['qr_version']!==null,'onlineEnabled'=>(bool)$row['online_enabled'],'version'=>$row['qr_version'],'updated_at'=>$row['updated_at']];
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

function payment_qr_image(PDO $db, mixed $method, mixed $version, bool $onlineOnly=true): array
{
    if (!is_string($method) || !is_string($version)) throw new OrderError('QR code not found.',404);
    $q=$db->prepare('SELECT q.image_mime,CONVERT(varchar(max),q.image_bytes,2) image_hex FROM dbo.payment_qr_codes q JOIN dbo.online_payment_methods m ON m.payment_method=q.payment_method WHERE m.is_active=1'.($onlineOnly&&payment_visibility_ready($db)?' AND m.online_enabled=1':'').' AND q.payment_method=? AND CONVERT(varchar(36),q.qr_version)=?');
    $q->execute([$method,$version]);
    return $q->fetch() ?: throw new OrderError('This QR code has changed. Refresh the payment options.',404);
}

function payment_receipt_image(PDO $db, int $orderId, ?int $customerId=null, ?int $sessionId=null): array
{
    $where="o.order_source IN ('online','dine_in') AND o.order_id=?";$params=[$orderId];
    if($customerId!==null){$where="o.order_source='online' AND o.order_id=? AND o.customer_account_id=?";$params[]=$customerId;}
    elseif($sessionId!==null){$where="o.order_source='dine_in' AND o.order_id=? AND o.session_id=?";$params[]=$sessionId;}
    $q=$db->prepare('SELECT r.image_mime,CONVERT(varchar(max),r.image_bytes,2) image_hex FROM dbo.online_payment_receipts r JOIN dbo.orders o ON o.order_id=r.order_id WHERE '.$where);
    $q->execute($params);
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
    $where=["o.order_source IN ('online','dine_in')","$event >= ?","$event < ?"];
    $params=[$day->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),$day->modify('+1 day')->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s')];
    if($status!=='all'){$where[]="$uploadStatus = ?";$params[]=$status;}
    if($search!==''){
        $where[]="LOWER(CONCAT(o.order_number,' ',o.customer_name,' ',r.payment_method,' ',m.display_name)) LIKE LOWER(?)";
        $params[]='%'.str_replace(['[','%','_'],['[[]','[%]','[_]'],$search).'%';
    }
    $reference=orders_customer_reference_ready($db)?'r.customer_reference':'CAST(NULL AS nvarchar(100))';
    $sql="SELECT o.order_id,o.order_number,o.customer_name,o.total_amount,o.order_status,o.cancellation_reason,o.order_source,t.table_name,
        o.cancelled_at,o.created_at,r.uploaded_at,r.payment_method,$reference customer_payment_reference,f.fulfillment_type,
        CASE WHEN EXISTS(SELECT 1 FROM dbo.online_delivery_bookings dbk WHERE dbk.order_id=o.order_id) THEN 1 ELSE 0 END has_delivery_booking,COALESCE(m.display_name,r.payment_method) payment_method_label,p.paid_at,
        CASE WHEN p.payment_id IS NOT NULL THEN 'paid' ELSE 'unpaid' END payment_status,
        $uploadStatus upload_status,$event record_at,
        CASE WHEN o.order_status='cancelled' THEN 'cancellation' WHEN p.paid_at IS NOT NULL THEN 'payment' ELSE 'upload' END date_basis
        FROM dbo.online_payment_receipts r JOIN dbo.orders o ON o.order_id=r.order_id
        LEFT JOIN dbo.order_fulfillments f ON f.order_id=o.order_id
        LEFT JOIN dbo.customer_sessions cs ON cs.session_id=o.session_id
        LEFT JOIN dbo.cafe_tables t ON t.table_id=cs.table_id
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
    $q=$db->prepare('SELECT payment_method,display_name,'.(payment_visibility_ready($db)?'online_enabled':'CAST(1 AS bit) online_enabled').' FROM dbo.online_payment_methods WITH (UPDLOCK,HOLDLOCK) WHERE payment_method=? AND is_active=1');
    $q->execute([$method]);$row=$q->fetch();$q->closeCursor();
    return $row ?: throw new OrderError('This payment method is no longer available.',422,'payment_unavailable');
}

function payment_set_online_visibility(PDO $db,int $staffId,mixed $method,bool $enabled): bool
{
    if(!payment_visibility_ready($db))throw new OrderError('Install database/29_payment_method_online_visibility.sql before changing online visibility.',409,'payment_visibility_setup');
    $old=payment_active_method($db,$method);
    if((bool)$old['online_enabled']===$enabled)return false;
    $db->prepare('UPDATE dbo.online_payment_methods SET online_enabled=?,updated_by_staff_id=?,updated_at=SYSUTCDATETIME() WHERE payment_method=?')->execute([$enabled?1:0,$staffId,$method]);
    $db->prepare("INSERT dbo.system_audit_log(actor_staff_id,action,entity_type,entity_key,details_json) VALUES(?,'payment_online_visibility','payment_method',?,?)")->execute([$staffId,$method,json_encode(['label'=>$old['display_name'],'onlineEnabled'=>$enabled],JSON_THROW_ON_ERROR)]);
    return true;
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
