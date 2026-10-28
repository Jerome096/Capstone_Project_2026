<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/online.php';
require_once __DIR__.'/../includes/kitchen.php';
$checks=0;
function check(bool $ok,string $label): void {global $checks;if(!$ok)throw new RuntimeException('FAIL: '.$label);$checks++;echo "PASS: $label\n";}
function rejected(callable $fn,int $status,string $label): void {
    try{$fn();}catch(OrderError $e){check($e->status===$status,$label);return;}throw new RuntimeException('FAIL: accepted '.$label);
}
require_once __DIR__.'/ordering-fixture.php';
require_once __DIR__.'/delivery-fixture.php';
$db=quvo_db();$before=$db->query('SELECT COUNT(*) FROM dbo.customer_sessions')->fetchColumn();
try {
    $db->beginTransaction();ordering_test_open($db);delivery_test_settings($db);
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
    $a=online_update_profile($db,$id,['name'=>'Updated name','email'=>"updated-$tag@example.invalid",'contact'=>'09123456789']);
    check(online_public_account($db,$a)['address']==='Updated address','profile save without retired address field preserves saved address');
    rejected(fn()=>online_change_password($db,$id,['current_password'=>'wrong','password'=>'Replacement-123']),422,'password change checks old password');
    $a=online_change_password($db,$id,['current_password'=>$input['password'],'password'=>'Replacement-123']);
    check(password_verify('Replacement-123',$a['password_hash']),'password change persisted');
    $q=$db->prepare("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(?,'coffee',15.25,1)");$q->execute(['Online test '.$tag]);$menuId=(int)$q->fetchColumn();$q->closeCursor();
    check(count(array_filter(online_menu($db),fn($item)=>$item['id']===(string)$menuId))===1,'live menu includes available item');
    $actor=(int)$db->query('SELECT TOP 1 staff_id FROM dbo.staff_users WHERE is_active=1 ORDER BY staff_id')->fetchColumn();
    $db->exec('DELETE FROM dbo.payment_qr_codes');
    check(!payment_qr_methods($db)['GCash']['available']&&!payment_qr_methods($db)['PayMaya']['available'],'unconfigured payment methods unavailable');
    rejected(fn()=>payment_admin(null,false),401,'anonymous QR administration rejected');
    rejected(fn()=>payment_admin(['role'=>'staff'],true),403,'cashier cannot change QR codes');
    rejected(fn()=>payment_admin(['role'=>'admin'],false),403,'admin must confirm workspace access');
    payment_admin(['role'=>'admin'],true);
    rejected(fn()=>payment_image('<?php echo "unsafe";'),422,'non-image uploads rejected');
    rejected(fn()=>payment_image(str_repeat('x',2097153)),422,'oversized image rejected');
    $png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5kAAAAASUVORK5CYII=');
    $proof=payment_image($png);
    $orderInput=['submission_key'=>'11111111-1111-4111-8111-111111111111','expected_total'=>'30.50','fulfillment'=>'pickup','payment_method'=>'GCash',
        'items'=>[['itemId'=>$menuId,'quantity'=>2,'customization'=>['sugarLevel'=>'50%','iceLevel'=>'Less ice','notes'=>'No straw']]]];
    rejected(fn()=>online_submit($db,$id,$orderInput),422,'order rejected without configured QR');
    payment_qr_save($db,$actor,'GCash',$proof);
    $version=payment_qr_methods($db)['GCash']['version'];
    check(hex2bin(payment_qr_image($db,'GCash',$version)['image_hex'])===$png,'QR image stored accurately in SQL');
    $orderInput['payment_qr_version']=$version;
    rejected(fn()=>online_submit($db,$id,$orderInput),422,'receipt required before order insertion');
    $orderInput['receipt_image']='data:image/png;base64,'.base64_encode($png);
    rejected(fn()=>online_submit($db,$id,[...$orderInput,'payment_qr_version'=>'00000000-0000-0000-0000-000000000000']),409,'stale QR version rejected');
    rejected(fn()=>online_submit($db,$id,[...$orderInput,'expected_total'=>'1.00']),409,'forged total rejected');
    rejected(fn()=>online_submit($db,$id,[...$orderInput,'fulfillment'=>'delivery']),422,'delivery requires address and contact');
    rejected(fn()=>online_submit($db,$id,[...$orderInput,'payment_method'=>'Cash']),422,'new online orders cannot select cash');
    $saved=online_submit($db,$id,$orderInput);$orderId=(int)$saved['order']['order_id'];
    check($saved['order']['order_source']==='online'&&$saved['order']['session_id']===null,'online order does not create a dining session');
    check($saved['order']['payment_status']==='unpaid'&&$saved['order']['order_status']==='received','checkout cannot confirm its own payment');
    check((int)$saved['order']['has_payment_receipt']===1,'order carries saved payment proof');
    check(hex2bin(payment_receipt_image($db,$orderId,$id)['image_hex'])===$png,'receipt bytes saved with order');
    rejected(fn()=>payment_receipt_image($db,$orderId,$otherId),404,'other customer cannot view receipt');
    check(payment_receipt_image($db,$orderId)['image_mime']==='image/png','authorized staff can retrieve proof');
    check($saved['order']['items'][0]['item_name']==='Online test '.$tag&&$saved['order']['total_amount']==='30.50','server menu prices and names saved');
    check(online_submit($db,$id,$orderInput)['replayed'],'same submission retries safely');
    payment_qr_save($db,$actor,'GCash',$proof);
    check(online_submit($db,$id,$orderInput)['replayed'],'saved order retries even after admin replaces QR');
    rejected(fn()=>online_submit($db,$id,[...$orderInput,'submission_key'=>'44444444-4444-4444-8444-444444444444']),409,'new order cannot use replaced QR');
    $orderInput['payment_qr_version']=payment_qr_methods($db)['GCash']['version'];
    rejected(fn()=>online_submit($db,$id,[...$orderInput,'payment_method'=>'PayMaya']),409,'changed retry rejected');
    rejected(fn()=>online_order($db,$otherId,$orderId),404,'another customer cannot read the order');
    check(count(online_orders($db,$otherId)['orders'])===0,'history only contains own orders');
    $db->prepare('UPDATE dbo.menu_items SET is_available=0 WHERE menu_item_id=?')->execute([$menuId]);
    check(online_submit($db,$id,[...$orderInput,'payment_qr_version'=>$version])['replayed'],'accepted order retries after menu becomes unavailable');
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
    $delivery=online_submit($db,$id,[...$orderInput,'submission_key'=>'33333333-3333-4333-8333-333333333333','fulfillment'=>'delivery','address'=>'Delivery snapshot','contact'=>'09999999999','payment_method'=>'GCash',...delivery_test_payload($db,$png)]);
    $deliveryId=(int)$delivery['order']['order_id'];
    online_update_profile($db,$id,[...$input,'address'=>'Another address']);
    check(online_order($db,$id,$deliveryId)['pickup_address_snapshot']==='Quvo test pickup address','cafe pickup address is a historical snapshot');
    check(orders_cancel($db,['staff_id'=>$actor,'role'=>'staff'],$deliveryId,'Customer request')['order_status']==='cancelled','cashier can cancel unpaid online order');
    check(online_order($db,$id,$deliveryId)['payment_status']==='not_due','customer sees cancellation and no payment due');
    check(count(online_orders($db,$id)['orders'])===2,'history survives account profile changes');
    rejected(fn()=>payment_add_method($db,$actor,'Cash'),422,'cash cannot be added to online checkout');
    $custom=payment_add_method($db,$actor,'Bank transfer '.$tag);
    check(!payment_qr_methods($db)[$custom]['available'],'new method requires a QR');
    rejected(fn()=>payment_add_method($db,$actor,'Bank transfer '.$tag),409,'duplicate method names rejected');
    payment_qr_save($db,$actor,$custom,$proof);
    $customVersion=payment_qr_methods($db)[$custom]['version'];
    $customInput=[...$orderInput,'submission_key'=>'55555555-5555-4555-8555-555555555555','payment_method'=>$custom,'payment_qr_version'=>$customVersion];
    $customOrder=online_submit($db,$id,$customInput);$customId=(int)$customOrder['order']['order_id'];
    check($customOrder['order']['preferred_payment_label']==='Bank transfer '.$tag,'custom method name appears on saved order');
    payment_remove_qr($db,$custom);
    check(!payment_qr_methods($db)[$custom]['available'],'removing QR keeps method but disables new orders');
    rejected(fn()=>payment_qr_image($db,$custom,$customVersion),404,'removed QR cannot be downloaded');
    check(payment_receipt_image($db,$customId,$id)['image_mime']==='image/png','removing QR preserves saved receipt');
    rejected(fn()=>online_submit($db,$id,[...$customInput,'submission_key'=>'66666666-6666-4666-8666-666666666666']),422,'removed QR blocks new order at server');
    payment_qr_save($db,$actor,$custom,$proof);
    check(payment_qr_methods($db)[$custom]['available'],'replacement QR re-enables method');
    payment_remove_method($db,$actor,$custom);
    check(!isset(payment_qr_methods($db)[$custom]),'removed method hidden from checkout');
    rejected(fn()=>payment_qr_save($db,$actor,$custom,$proof),422,'cannot upload QR to removed method');
    rejected(fn()=>online_submit($db,$id,[...$customInput,'submission_key'=>'77777777-7777-4777-8777-777777777777']),422,'removed method blocks new orders');
    check(online_submit($db,$id,$customInput)['replayed'],'accepted checkout retries after method removal');
    orders_pay($db,$actor,$customId,['payment_method'=>$custom,'amount_received'=>'30.50','payment_reference'=>'TEST-REFERENCE']);
    check(online_order($db,$id,$customId)['payment_method_label']==='Bank transfer '.$tag,'cashier can settle historical custom-method order');
    check(payment_add_method($db,$actor,'Bank transfer '.$tag)===$custom,'re-adding method keeps its historical identity');
    check(!payment_qr_methods($db)[$custom]['available'],'reactivated method needs new QR');
    // Exercise actual online checkout -> cashier approval -> kitchen readiness.
    $q=$db->prepare("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(?,'food',10,1)");$q->execute(['Online kitchen food '.$tag]);$foodId=(int)$q->fetchColumn();$q->closeCursor();
    foreach(['pickup','delivery'] as $fulfillment){
        $mixed=$fulfillment==='delivery';
        $kitchenInput=[...$orderInput,'submission_key'=>$mixed?'ffffffff-1111-4111-8111-111111111111':'eeeeeeee-1111-4111-8111-111111111111',
            'fulfillment'=>$fulfillment,'address'=>'Kitchen integration delivery address','contact'=>'09999999999','expected_total'=>$mixed?'25.25':'10.00',
            'items'=>[['itemId'=>$foodId,'quantity'=>1,'customization'=>['notes'=>'No sauce']],...($mixed?$orderInput['items']:[])]];
        // The mixed ticket uses one drink plus one food item.
        if($mixed){$kitchenInput['items'][1]['quantity']=1;$kitchenInput+=delivery_test_payload($db,$png);}
        $onlineFood=online_submit($db,$id,$kitchenInput);$foodOrderId=(int)$onlineFood['order']['order_id'];
        rejected(fn()=>kitchen_get($db,$foodOrderId),409,$fulfillment.' online food waits for cashier approval');
        orders_pay($db,$actor,$foodOrderId,['payment_method'=>'GCash','amount_received'=>$kitchenInput['expected_total']]);
        $ticket=kitchen_get($db,$foodOrderId);
        check(count($ticket['items'])===1&&$ticket['items'][0]['name']==='Online kitchen food '.$tag,$fulfillment.' checkout food reaches kitchen without drinks');
        check($ticket['location']===($mixed?'Online delivery':'Online pickup'),$fulfillment.' kitchen ticket identifies fulfillment');
        $ready=kitchen_ready($db,['staff_id'=>$actor,'role'=>'staff'],$foodOrderId);
        check($ready['order']['status']==='ready'&&online_order($db,$id,$foodOrderId)['kitchen_ready_at']!==null,$fulfillment.' kitchen readiness is visible on the saved online order');
        check(online_order($db,$id,$foodOrderId)['order_status']===($mixed?'preparing':'ready'),$fulfillment.' food readiness preserves the full-order workflow');
    }
    $db->prepare('UPDATE dbo.customer_accounts SET is_active=0 WHERE customer_account_id=?')->execute([$id]);
    rejected(fn()=>online_submit($db,$id,$orderInput),401,'inactive account cannot submit');
    check($db->query('SELECT COUNT(*) FROM dbo.customer_sessions')->fetchColumn()===$before,'dine-in sessions untouched');
    rejected(fn()=>orders_list($db,null,'all',0,'2099-02-30'),422,'invalid receipt date rejected');
    rejected(fn()=>orders_list($db,null,'all',0,'bad date'),422,'malformed receipt date rejected');
    $db->prepare("UPDATE dbo.payments SET paid_at='2099-03-09T15:59:59' WHERE order_id=?")->execute([$orderId]);
    $db->prepare("UPDATE dbo.payments SET paid_at='2099-03-09T16:00:00' WHERE order_id=?")->execute([$customId]);
    $db->prepare("UPDATE dbo.orders SET cancelled_at='2099-03-10T15:59:59' WHERE order_id=?")->execute([$deliveryId]);
    $dated=orders_list($db,null,'all',0,'2099-03-10')['orders'];$datedIds=array_column($dated,'order_id');
    check(in_array((string)$customId,$datedIds,true),'receipt date includes Philippine midnight');
    check(!in_array((string)$orderId,$datedIds,true),'receipt date excludes previous day');
    check(in_array((string)$deliveryId,$datedIds,true),'voided receipt uses cancellation date');
    check(orders_get($db,$customId)['receipt_date']==='2099-03-10','saved receipt reports Philippine calendar date');
    $db->prepare("UPDATE dbo.payments SET paid_at='2099-03-10T16:00:00' WHERE order_id=?")->execute([$customId]);
    check(!in_array((string)$customId,array_column(orders_list($db,null,'all',0,'2099-03-10')['orders'],'order_id'),true),'receipt date excludes next midnight');
    echo "$checks online checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "All temporary online rows rolled back.\n";}
