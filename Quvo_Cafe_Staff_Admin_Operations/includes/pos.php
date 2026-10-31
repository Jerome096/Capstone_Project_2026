<?php
declare(strict_types=1);
require_once __DIR__.'/orders.php';
require_once __DIR__.'/payment-images.php';

// The caller commits the order, immutable catalog snapshots, and payment together.
function pos_submit(PDO $db,array $actor,array $input): array
{
    inventory_lock($db);
    if(!in_array($actor['role'],['admin','staff'],true))throw new OrderError('Cashier access is required.',403);
    $q=$db->prepare("SELECT s.staff_id FROM dbo.staff_users s WITH (UPDLOCK,HOLDLOCK) JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.staff_id=? AND s.is_active=1 AND LOWER(r.role_name) IN ('staff','admin')");
    $q->execute([$actor['staff_id']]);if(!$q->fetchColumn())throw new OrderError('Please sign in again.',401);$q->closeCursor();
    $key=$input['submission_key']??null;
    if(!is_string($key)||!preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i',$key))throw new OrderError('A valid submission key is required.');
    $customer=orders_text($input['customer_name']??'Walk-in customer',100,true);
    $items=$input['items']??null;
    if(!is_array($items)||!array_is_list($items)||count($items)<1||count($items)>50)throw new OrderError('Submit between 1 and 50 order lines.');
    $lines=[];
    foreach($items as $item) {
        if(!is_array($item)||!is_int($item['quantity']??null)||$item['quantity']<1||$item['quantity']>999)throw new OrderError('Choose a whole quantity from 1 to 999.');
        $options=$item['drink_options']??null;
        if($options!==null && !is_array($options))throw new OrderError('Invalid drink options.');
        $size=$options['size']??'Not applicable';$sugar=$options['sugar']??'Not applicable';$ice=$options['ice']??'Not applicable';
        if(!in_array($size,['Not applicable','Regular','Large'],true)||!in_array($sugar,['Not applicable','0% sugar','25% sugar','50% sugar','75% sugar','100% sugar'],true)||!in_array($ice,['Not applicable','No ice','Less ice','Regular ice','Extra ice'],true))throw new OrderError('Invalid drink selection.');
        if($options!==null && in_array('Not applicable',[$size,$sugar,$ice],true))throw new OrderError('Complete the drink selections.');
        $lines[]=['menu_item_id'=>orders_id($item['menu_id']??null),'quantity'=>$item['quantity'],
            'customization'=>['size'=>$size,'sugarLevel'=>str_replace(' sugar','',$sugar),'iceLevel'=>$ice]+(array_key_exists('custom_options',$item)?['options'=>menu_selection_input($item['custom_options']),'optionsVersion'=>orders_text($item['custom_options_version']??'',64)]:[]),
            'notes'=>orders_text($item['notes']??'',1000)];
    }
    $expected=orders_cents($input['expected_total']??null);$received=orders_cents($input['amount_received']??null);
    $method=$input['payment_method']??null;$reference=orders_text($input['payment_reference']??'',100);
    if(!is_string($method)||$method===''||strlen($method)>10)throw new OrderError('Choose a valid payment method.');
    if($received<$expected||($method!=='Cash'&&$received!==$expected)||($method==='Cash'&&$reference!==''))throw new OrderError('Record the full payment; digital payment must match the total.');
    $hash=hash('sha256',json_encode([$customer,$lines,$expected,$method,$received,$reference],JSON_THROW_ON_ERROR));
    $q=$db->prepare('SELECT order_id,CONVERT(varchar(64),submission_hash,2) request_hash FROM dbo.orders WHERE pos_staff_id=? AND submission_key=?');
    $q->execute([$actor['staff_id'],$key]);$old=$q->fetch();$q->closeCursor();
    if($old) {
        if(!hash_equals(strtolower($old['request_hash']),$hash))throw new OrderError('This submission key was already used for a different POS order.',409);
        return ['order'=>orders_get($db,(int)$old['order_id']),'replayed'=>true];
    }
    // Validate active configuration only after replay lookup. A removed method
    // must not prevent recovery of an already accepted, identical payment.
    if($method!=='Cash')payment_active_method($db,$method);
    [$catalog,$total]=orders_catalog($db,$lines,$expected);
    foreach($lines as $line)if(!menu_category_is_drink($catalog[$line['menu_item_id']]['category'])&&$line['customization']['size']!=='Not applicable')throw new OrderError('Drink sizes apply only to drinks.');
    $q=$db->prepare("INSERT dbo.orders(order_source,pos_staff_id,customer_name,submission_key,submission_hash,total_amount,preferred_payment_method) OUTPUT INSERTED.order_id VALUES('walk_in',?,?,?,CONVERT(binary(32),?,2),?,?)");
    $q->execute([$actor['staff_id'],$customer,$key,$hash,orders_money($total),$method]);$id=(int)$q->fetchColumn();$q->closeCursor();
    $q=$db->prepare('INSERT dbo.order_items(order_id,line_number,menu_item_id,item_name,category,unit_price,quantity,customization_json,notes) VALUES(?,?,?,?,?,?,?,?,?)');
    foreach($lines as $index=>$line) {
        $menu=$catalog[$line['menu_item_id']];
        $q->execute([$id,$index+1,$line['menu_item_id'],$menu['item_name'],$menu['category'],$line['unit_price'],$line['quantity'],menu_custom_json($line["customization"]),$line['notes']]);
    }
    $paid=orders_pay($db,(int)$actor['staff_id'],$id,['payment_method'=>$method,'amount_received'=>orders_money($received),'payment_reference'=>$reference]);
    return ['order'=>$paid['order'],'replayed'=>false];
}
