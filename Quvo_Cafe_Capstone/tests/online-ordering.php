<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/online.php';
$checks=0;
function check(bool $ok,string $label): void {global $checks;if(!$ok)throw new RuntimeException('FAIL: '.$label);$checks++;echo "PASS: $label\n";}
function rejected(callable $fn,int $status,string $label): void {
    try{$fn();}catch(OrderError $e){check($e->status===$status,$label);return;}throw new RuntimeException('FAIL: accepted '.$label);
}
$db=quvo_db();$before=$db->query('SELECT COUNT(*) FROM dbo.customer_sessions')->fetchColumn();
try {
    $db->beginTransaction();
    $tag=bin2hex(random_bytes(6));
    $input=['name'=>'Online <test>','email'=>"online-$tag@example.invalid",'contact'=>'09123456789','address'=>'Test address','password'=>'Temporary-only-123'];
    $a=online_register($db,$input);$id=(int)$a['customer_account_id'];
    check(password_verify($input['password'],$a['password_hash'])&&$a['password_hash']!==$input['password'],'password stored as a hash');
    $public=online_public_account($db,$a);check(!isset($public['password_hash'])&&!isset($public['password']),'public account excludes credentials');
    check($public['address']==='Test address','default address saved');
    check(online_login($db,['email'=>strtoupper($input['email']),'password'=>$input['password']])['customer_account_id']==$id,'case-insensitive SQL login');
    rejected(fn()=>online_login($db,['email'=>$input['email'],'password'=>'incorrect']),401,'incorrect password rejected');
    rejected(fn()=>online_register($db,[...$input,'password'=>'short']),422,'short password rejected');
    try{online_register($db,$input);throw new RuntimeException('Duplicate email accepted');}catch(PDOException $e){check(in_array((int)($e->errorInfo[1]??0),[2601,2627],true),'duplicate email blocked by SQL');}
    $b=online_register($db,[...$input,'email'=>"other-$tag@example.invalid"]);$otherId=(int)$b['customer_account_id'];
    $a=online_update_profile($db,$id,[...$input,'name'=>'Updated name','email'=>"updated-$tag@example.invalid",'address'=>'Updated address']);
    check(online_public_account($db,$a)['address']==='Updated address','profile and address updated');
    rejected(fn()=>online_change_password($db,$id,['current_password'=>'wrong','password'=>'Replacement-123']),422,'password change checks old password');
    $a=online_change_password($db,$id,['current_password'=>$input['password'],'password'=>'Replacement-123']);
    check(password_verify('Replacement-123',$a['password_hash']),'password change persisted');
    $q=$db->prepare("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(?,'coffee',15.25,1)");$q->execute(['Online test '.$tag]);$menuId=(int)$q->fetchColumn();$q->closeCursor();
    check(count(array_filter(online_menu($db),fn($item)=>$item['id']===(string)$menuId))===1,'live menu includes available item');
    $orderInput=['submission_key'=>'11111111-1111-4111-8111-111111111111','expected_total'=>'30.50','fulfillment'=>'pickup','payment_method'=>'GCash',
        'items'=>[['itemId'=>$menuId,'quantity'=>2,'customization'=>['sugarLevel'=>'50%','iceLevel'=>'Less ice','notes'=>'No straw']]]];
    rejected(fn()=>online_submit($db,$id,[...$orderInput,'expected_total'=>'1.00']),409,'forged total rejected');
    rejected(fn()=>online_submit($db,$id,[...$orderInput,'fulfillment'=>'delivery']),422,'delivery requires address and contact');
    rejected(fn()=>online_submit($db,$id,[...$orderInput,'payment_method'=>'Cash']),422,'new online orders cannot select cash');
    $saved=online_submit($db,$id,$orderInput);$orderId=(int)$saved['order']['order_id'];
    check($saved['order']['order_source']==='online'&&$saved['order']['session_id']===null,'online order does not create a dining session');
    check($saved['order']['payment_status']==='unpaid'&&$saved['order']['order_status']==='received','checkout cannot confirm its own payment');
    check($saved['order']['items'][0]['item_name']==='Online test '.$tag&&$saved['order']['total_amount']==='30.50','server menu prices and names saved');
    check(online_submit($db,$id,$orderInput)['replayed'],'same submission retries safely');
    rejected(fn()=>online_submit($db,$id,[...$orderInput,'payment_method'=>'PayMaya']),409,'changed retry rejected');
    rejected(fn()=>online_order($db,$otherId,$orderId),404,'another customer cannot read the order');
    check(count(online_orders($db,$otherId)['orders'])===0,'history only contains own orders');
    $db->prepare('UPDATE dbo.menu_items SET is_available=0 WHERE menu_item_id=?')->execute([$menuId]);
    check(online_submit($db,$id,$orderInput)['replayed'],'accepted order retries after menu becomes unavailable');
    rejected(fn()=>online_submit($db,$id,[...$orderInput,'submission_key'=>'22222222-2222-4222-8222-222222222222']),409,'new order rejects unavailable item');
    $db->prepare('UPDATE dbo.menu_items SET is_available=1 WHERE menu_item_id=?')->execute([$menuId]);
    $actor=(int)$db->query('SELECT TOP 1 staff_id FROM dbo.staff_users WHERE is_active=1 ORDER BY staff_id')->fetchColumn();
    check($actor>0,'active staff available');
    rejected(fn()=>orders_status($db,$actor,$orderId,'ready'),409,'unpaid online order cannot become ready');
    orders_pay($db,$actor,$orderId,['payment_method'=>'Cash','amount_received'=>'50.00']);
    check(online_order($db,$id,$orderId)['change_amount']==='19.50','cashier payment visible to customer');
    rejected(fn()=>orders_cancel($db,['staff_id'=>$actor,'role'=>'staff'],$orderId,'Customer request'),409,'paid online order cannot be cancelled');
    orders_status($db,$actor,$orderId,'ready');orders_status($db,$actor,$orderId,'served');
    check(online_order($db,$id,$orderId)['order_status']==='served','cashier progress visible to online customer');
    check((int)$db->query("SELECT COUNT(*) FROM dbo.order_status_history WHERE order_id=$orderId")->fetchColumn()===4,'online status history saved');
    check($db->query("SELECT completed_at FROM dbo.order_fulfillments WHERE order_id=$orderId")->fetchColumn()!==null,'fulfillment completion recorded');
    $delivery=online_submit($db,$id,[...$orderInput,'submission_key'=>'33333333-3333-4333-8333-333333333333','fulfillment'=>'delivery','address'=>'Delivery snapshot','contact'=>'09999999999','payment_method'=>'GCash']);
    $deliveryId=(int)$delivery['order']['order_id'];
    online_update_profile($db,$id,[...$input,'address'=>'Another address']);
    check(online_order($db,$id,$deliveryId)['address_snapshot']==='Delivery snapshot','delivery address is a historical snapshot');
    check(orders_cancel($db,['staff_id'=>$actor,'role'=>'staff'],$deliveryId,'Customer request')['order_status']==='cancelled','cashier can cancel unpaid online order');
    check(online_order($db,$id,$deliveryId)['payment_status']==='not_due','customer sees cancellation and no payment due');
    check(count(online_orders($db,$id)['orders'])===2,'history survives account profile changes');
    $db->prepare('UPDATE dbo.customer_accounts SET is_active=0 WHERE customer_account_id=?')->execute([$id]);
    rejected(fn()=>online_submit($db,$id,$orderInput),401,'inactive account cannot submit');
    check($db->query('SELECT COUNT(*) FROM dbo.customer_sessions')->fetchColumn()===$before,'dine-in sessions untouched');
    echo "$checks online checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "All temporary online rows rolled back.\n";}
