<?php
declare(strict_types=1);
const QUVO_ONLINE_ORDERING_GATE_VERSION = 1;
require_once __DIR__.'/menu.php';
require_once __DIR__.'/orders.php';
require_once __DIR__.'/auth.php';
require_once __DIR__.'/payment-images.php';

function online_start_session(): string
{
    if(session_status()!==PHP_SESSION_ACTIVE) {
        ini_set('session.use_strict_mode','1');
        ini_set('session.use_only_cookies','1');
        session_name('quvo_online');
        session_set_cookie_params(['httponly'=>true,'secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off','samesite'=>'Lax','path'=>'/']);
        session_start();
    }
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    return $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}

function online_account(PDO $db, int $id, bool $lock=false): array
{
    $q=$db->prepare('SELECT * FROM dbo.customer_accounts'.($lock?' WITH (UPDLOCK,HOLDLOCK)':'').' WHERE customer_account_id=? AND is_active=1');
    $q->execute([$id]);
    return $q->fetch() ?: throw new OrderError('Please sign in again.',401);
}

function online_current(PDO $db): ?array
{
    if(empty($_SESSION['customer_id'])) return null;
    if(time()-($_SESSION['last_activity']??0)>7200) {unset($_SESSION['customer_id']);return null;}
    try {$row=online_account($db,(int)$_SESSION['customer_id']);}
    catch(OrderError) {unset($_SESSION['customer_id']);return null;}
    if(!hash_equals($_SESSION['credential_stamp']??'',hash('sha256',$row['password_hash']))) {
        unset($_SESSION['customer_id']);return null;
    }
    $_SESSION['last_activity']=time();
    return $row;
}

function online_sign_in(array $row): void
{
    session_regenerate_id(true);
    $_SESSION['customer_id']=(string)$row['customer_account_id'];
    $_SESSION['credential_stamp']=hash('sha256',$row['password_hash']);
    $_SESSION['last_activity']=time();
    $_SESSION['csrf']=bin2hex(random_bytes(32));
}

function online_public_account(PDO $db,array $row): array
{
    $q=$db->prepare('SELECT address_text FROM dbo.customer_addresses WHERE customer_account_id=? AND is_default=1 AND is_active=1');
    $q->execute([$row['customer_account_id']]);
    return ['id'=>(string)$row['customer_account_id'],'name'=>$row['full_name'],'email'=>$row['email'],
        'contact'=>$row['contact_number'],'address'=>$q->fetchColumn()?:''];
}

function online_profile_values(array $input): array
{
    $name=orders_text($input['name']??null,100,true);
    $email=strtolower(orders_text($input['email']??null,254,true));
    $contact=orders_text($input['contact']??null,30,true);
    $address=orders_text($input['address']??'',500);
    if(!filter_var($email,FILTER_VALIDATE_EMAIL)) throw new OrderError('Enter a valid email address.');
    if(!preg_match('/\A[+0-9() .-]{5,30}\z/',$contact)) throw new OrderError('Enter a valid contact number.');
    return [$name,$email,$contact,$address];
}

function online_password(mixed $value): string
{
    if(!is_string($value)||strlen($value)<8||strlen($value)>72||str_contains($value,"\0"))
        throw new OrderError('Use a password of 8 to 72 characters (maximum 72 bytes).');
    return $value;
}

function online_save_address(PDO $db,int $id,string $address,string $contact): void
{
    // The account row is locked by the caller; only one active default address is retained.
    $q=$db->prepare('SELECT address_id FROM dbo.customer_addresses WHERE customer_account_id=? AND is_default=1 AND is_active=1');
    $q->execute([$id]);$addressId=$q->fetchColumn();
    if($address==='') {
        if($addressId!==false) $db->prepare('UPDATE dbo.customer_addresses SET is_default=0,is_active=0,updated_at=SYSUTCDATETIME() WHERE address_id=?')->execute([$addressId]);
    } elseif($addressId!==false) {
        $db->prepare('UPDATE dbo.customer_addresses SET address_text=?,contact_number=?,updated_at=SYSUTCDATETIME() WHERE address_id=?')->execute([$address,$contact,$addressId]);
    } else {
        $db->prepare("INSERT dbo.customer_addresses(customer_account_id,label,address_text,contact_number,is_default) VALUES(?,'Default',?,?,1)")->execute([$id,$address,$contact]);
    }
}

function online_register(PDO $db,array $input): array
{
    [$name,$email,$contact,$address]=online_profile_values($input);
    $password=online_password($input['password']??null);
    $q=$db->prepare('INSERT dbo.customer_accounts(full_name,email,contact_number,password_hash) OUTPUT INSERTED.customer_account_id VALUES(?,?,?,?)');
    $q->execute([$name,$email,$contact,password_hash($password,PASSWORD_DEFAULT)]);
    $id=(int)$q->fetchColumn();$q->closeCursor();
    online_save_address($db,$id,$address,$contact);
    return online_account($db,$id);
}

function online_login(PDO $db,array $input): array
{
    $email=strtolower(orders_text($input['email']??null,254,true));
    $password=$input['password']??null;
    if(!is_string($password)||strlen($password)>72||str_contains($password,"\0")) throw new OrderError('Invalid email or password.',401);
    $q=$db->prepare('SELECT * FROM dbo.customer_accounts WHERE email=? AND is_active=1');$q->execute([$email]);$row=$q->fetch();
    if(!$row||!password_verify($password,$row['password_hash'])) throw new OrderError('Invalid email or password.',401);
    return $row;
}

function online_update_profile(PDO $db,int $id,array $input): array
{
    online_account($db,$id,true);
    [$name,$email,$contact,$address]=online_profile_values($input);
    $db->prepare('UPDATE dbo.customer_accounts SET full_name=?,email=?,contact_number=?,updated_at=SYSUTCDATETIME() WHERE customer_account_id=?')->execute([$name,$email,$contact,$id]);
    online_save_address($db,$id,$address,$contact);
    return online_account($db,$id);
}

function online_change_password(PDO $db,int $id,array $input): array
{
    $row=online_account($db,$id,true);
    $current=$input['current_password']??null;
    if(!is_string($current)||!password_verify($current,$row['password_hash'])) throw new OrderError('Current password is incorrect.');
    $password=online_password($input['password']??null);
    $db->prepare('UPDATE dbo.customer_accounts SET password_hash=?,updated_at=SYSUTCDATETIME() WHERE customer_account_id=?')->execute([password_hash($password,PASSWORD_DEFAULT),$id]);
    return online_account($db,$id);
}

function online_menu(PDO $db): array
{
    $rows=$db->query('SELECT m.menu_item_id AS id,m.item_name AS name,m.category,m.price,m.option_groups_json,CONVERT(varchar(36),mi.image_version) image_version FROM dbo.menu_items m LEFT JOIN dbo.menu_item_images mi ON mi.menu_item_id=m.menu_item_id WHERE '.inventory_menu_condition().' ORDER BY m.item_name')->fetchAll();
    foreach($rows as &$row) {$row+=menu_metadata($row,'api/index.php?view=menu-image&');unset($row['option_groups_json'],$row['image_version']);$row['id']=(string)$row['id'];$row['price']=(float)$row['price'];$row['description']='';$row['icon']='☕';}
    return $rows;
}

function online_order(PDO $db,int $customerId,int $id): array
{
    $q=$db->prepare("SELECT order_id FROM dbo.orders WHERE order_id=? AND customer_account_id=? AND order_source='online'");$q->execute([$id,$customerId]);
    if(!$q->fetchColumn()) throw new OrderError('Order not found.',404);
    $order=orders_get($db,$id);
    unset($order['received_by_staff_id'],$order['customer_account_id']);
    return $order;
}

function online_orders(PDO $db,int $customerId,mixed $offset=0): array
{
    $offset=filter_var($offset,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>1000000]]);
    if($offset===false) throw new OrderError('Invalid history offset.');
    $q=$db->prepare("SELECT order_id FROM dbo.orders WHERE customer_account_id=? AND order_source='online' ORDER BY order_id DESC OFFSET ? ROWS FETCH NEXT 21 ROWS ONLY");
    $q->bindValue(1,$customerId,PDO::PARAM_INT);$q->bindValue(2,$offset,PDO::PARAM_INT);$q->execute();$ids=$q->fetchAll(PDO::FETCH_COLUMN);
    return ['orders'=>array_map(fn($id)=>online_order($db,$customerId,(int)$id),array_slice($ids,0,20)),
        'next_offset'=>count($ids)>20?$offset+20:null];
}

// Account lock serializes retries. The caller owns the transaction.
function online_submit(PDO $db,int $customerId,array $input): array
{
    inventory_lock($db);
    $account=online_account($db,$customerId,true);
    $key=$input['submission_key']??null;
    if(!is_string($key)||!preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i',$key)) throw new OrderError('A valid submission key is required.');
    $lines=orders_lines($input['items']??null);$expected=orders_cents($input['expected_total']??null);
    $fulfillment=$input['fulfillment']??null;$method=$input['payment_method']??null;
    if(!in_array($fulfillment,['pickup','delivery'],true)) throw new OrderError('Choose pickup or delivery request.');
    if(!is_string($method)||$method===''||strlen($method)>10) throw new OrderError('Choose a payment method.');
    $address=$fulfillment==='delivery'?orders_text($input['address']??null,500,true):null;
    $contact=$fulfillment==='delivery'?orders_text($input['contact']??null,30,true):$account['contact_number'];
    if(!preg_match('/\A[+0-9() .-]{5,30}\z/',$contact)) throw new OrderError('Enter a valid contact number.');
    // Include only submitted values in the retry hash; profile edits must not create duplicate orders.
    $receipt = isset($input['receipt_image']) ? payment_receipt_input($input['receipt_image']) : null;
    $version = $input['payment_qr_version'] ?? null;
    $hashParts = [$lines,$expected,$fulfillment,$method,$address,$fulfillment==='delivery'?$contact:null];
    if ($receipt !== null || $version !== null) $hashParts[] = [$version,$receipt['hash'] ?? null];
    $hash=hash('sha256',json_encode($hashParts,JSON_THROW_ON_ERROR));
    $q=$db->prepare('SELECT order_id,CONVERT(varchar(64),submission_hash,2) request_hash FROM dbo.orders WHERE customer_account_id=? AND submission_key=?');$q->execute([$customerId,$key]);$old=$q->fetch();
    if($old) {
        if(!hash_equals(strtolower($old['request_hash']),$hash)) throw new OrderError('Submission key already used for a different order.',409);
        return ['order'=>online_order($db,$customerId,(int)$old['order_id']),'replayed'=>true];
    }
    ordering_require_open($db);
    // Existing submissions can still be recovered with their original payment choice.
    if($method==='Cash') throw new OrderError('Choose an available online payment method.');
    $paymentMethod=payment_active_method($db,$method);
    $q=$db->prepare('SELECT CONVERT(varchar(36),qr_version) FROM dbo.payment_qr_codes WITH (HOLDLOCK) WHERE payment_method=?');
    $q->execute([$method]);$currentVersion=$q->fetchColumn();$q->closeCursor();
    if (!$currentVersion) throw new OrderError($paymentMethod['display_name'].' payment is unavailable. Its QR code has not been configured.',422,'payment_unavailable');
    if (!is_string($version) || strcasecmp($version,$currentVersion)!==0) throw new OrderError('The payment QR code changed. Review the current QR and payment details before ordering.',409,'payment_qr_changed');
    if (!$receipt) throw new OrderError('Upload your payment receipt before placing the order.');
    [$catalog,$total]=orders_catalog($db,$lines,$expected);
    $q=$db->prepare("INSERT dbo.orders(customer_account_id,order_source,customer_name,submission_key,submission_hash,total_amount,preferred_payment_method)
        OUTPUT INSERTED.order_id VALUES(?,'online',?,?,CONVERT(binary(32),?,2),?,?)");
    $q->execute([$customerId,$account['full_name'],$key,$hash,orders_money($total),$method]);$id=(int)$q->fetchColumn();$q->closeCursor();
    $q=$db->prepare('INSERT dbo.order_items(order_id,line_number,menu_item_id,item_name,category,unit_price,quantity,customization_json,notes) VALUES(?,?,?,?,?,?,?,?,?)');
    foreach($lines as $index=>$line) {
        $menu=$catalog[$line['menu_item_id']];
        $q->execute([$id,$index+1,$line['menu_item_id'],$menu['item_name'],$menu['category'],$menu['price'],$line['quantity'],menu_custom_json($line["customization"]),$line['notes']]);
    }
    $db->prepare('INSERT dbo.order_fulfillments(order_id,fulfillment_type,recipient_name,contact_snapshot,address_snapshot) VALUES(?,?,?,?,?)')->execute([$id,$fulfillment,$account['full_name'],$contact,$address]);
    $db->prepare("INSERT dbo.order_status_history(order_id,to_status) VALUES(?,'received')")->execute([$id]);
    $db->prepare('INSERT dbo.online_payment_receipts(order_id,payment_method,qr_version,image_mime,image_bytes,image_hash) VALUES(?,?,?,?,CONVERT(varbinary(max),?,2),CONVERT(binary(32),?,2))')
        ->execute([$id,$method,$version,$receipt['mime'],bin2hex($receipt['bytes']),$receipt['hash']]);
    return ['order'=>online_order($db,$customerId,$id),'replayed'=>false];
}
