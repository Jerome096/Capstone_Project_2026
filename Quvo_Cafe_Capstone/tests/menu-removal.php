<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../includes/menu.php';
require_once __DIR__.'/../includes/pos.php';
require_once __DIR__.'/../includes/online.php';
$checks=0;
function removal_check(bool $ok,string $message):void {global $checks;if(!$ok)throw new RuntimeException($message);$checks++;echo "PASS: $message\n";}
function removal_reject(callable $callback,int $status,string $message):void {
    try{$callback();}catch(OrderError $error){removal_check($error->status===$status,$message);return;}
    throw new RuntimeException('Unexpected acceptance: '.$message);
}
function removal_key():string {return bin2hex(random_bytes(4)).'-1234-4234-8234-123456789012';}
$db=quvo_db();
$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local test database required.');
$db->beginTransaction();
try{
    $actor=(int)$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name)='admin' ORDER BY s.staff_id")->fetchColumn();
    if(!$actor)throw new RuntimeException('An active local admin is required.');
    $base=['name'=>'Removal fixture '.bin2hex(random_bytes(4)),'category'=>'food','price'=>'50.00','available'=>true,'optionGroups'=>[]];
    $item=menu_save($db,$base+['image'=>'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6UAAAAABJRU5ErkJggg==']);$id=$item['id'];
    $stock=inventory_mutate($db,$actor,['action'=>'save_item','submission_key'=>removal_key(),'name'=>'Removal stock '.bin2hex(random_bytes(4)),'category'=>'Other','unit'=>'pcs','current'=>'10','reorder'=>'0']);
    $recipe=inventory_mutate($db,$actor,['action'=>'save_recipe','submission_key'=>removal_key(),'menu_id'=>$id,'ingredients'=>[['item_id'=>(int)$stock['item_id'],'quantity'=>'1']]]);
    $request=['submission_key'=>removal_key(),'customer_name'=>'Removal test','expected_total'=>'50.00','payment_method'=>'Cash','amount_received'=>'50.00','items'=>[['menu_id'=>$id,'quantity'=>1,'custom_options'=>[],'custom_options_version'=>$item['optionVersion']]]];
    $paid=pos_submit($db,['role'=>'admin','staff_id'=>$actor],$request);$paidId=(int)$paid['order']['order_id'];$before=orders_get($db,$paidId);
    removal_check(inventory_balance($db,(int)$stock['item_id'])===9000,'recipe consumption fixture exists before removal');
    $q=$db->prepare("INSERT dbo.orders(order_source,pos_staff_id,customer_name,submission_key,submission_hash,total_amount,preferred_payment_method) OUTPUT INSERTED.order_id VALUES('walk_in',?,'Pending removal fixture',?,CONVERT(binary(32),?,2),50,'Cash')");
    $q->execute([$actor,removal_key(),hash('sha256',random_bytes(16))]);$unpaid=(int)$q->fetchColumn();$q->closeCursor();
    $q=$db->prepare('INSERT dbo.order_items(order_id,line_number,menu_item_id,item_name,category,unit_price,quantity,customization_json,notes) SELECT ?,line_number,menu_item_id,item_name,category,unit_price,quantity,customization_json,notes FROM dbo.order_items WHERE order_id=?');$q->execute([$unpaid,$paidId]);
    menu_remove($db,$id,$actor);
    removal_check(menu_rows($db,$id)===[],'used recipe-linked item is removed from the admin/POS catalog');
    removal_check(!in_array($id,array_column(menu_rows($db),'id'),true),'full catalog excludes the removed item');
    removal_check(!in_array((string)$id,array_column(online_menu($db),'id'),true),'online catalog excludes the removed item');
    removal_check((int)$db->query('SELECT COUNT(*) FROM dbo.menu_items m WHERE m.menu_item_id='.$id.' AND '.inventory_menu_condition())->fetchColumn()===0,'dine-in availability filter excludes the removed item');
    removal_check((int)$db->query('SELECT is_available FROM dbo.menu_items WHERE menu_item_id='.$id)->fetchColumn()===0,'removed item is also marked unavailable');
    removal_check(orders_get($db,$paidId)===$before,'paid order snapshot and payment details remain unchanged');
    removal_check((int)$db->query('SELECT COUNT(*) FROM dbo.menu_item_images WHERE menu_item_id='.$id)->fetchColumn()===1,'historical menu photo is retained');
    removal_check((int)$db->query('SELECT COUNT(*) FROM dbo.menu_recipes WHERE menu_item_id='.$id.' AND is_active=1')->fetchColumn()===1,'recipe is retained for existing unpaid orders');
    $snapshot=inventory_snapshot($db);
    removal_check(!in_array($id,array_map('intval',array_column($snapshot['menus'],'id')),true),'removed item is absent from new BOM menu choices');
    removal_check(!in_array($id,array_map('intval',array_column($snapshot['recipes'],'menuId')),true),'removed recipe is hidden in the active BOM editor');
    $db->prepare("INSERT dbo.inventory_movements(inventory_item_id,movement_type,quantity_delta,recorded_by_staff_id,reason) VALUES(?,'adjustment','-8.500',?,'Removal alert fixture')")->execute([(int)$stock['item_id'],$actor]);
    removal_check(!in_array((string)$stock['item_id'],array_column(inventory_stock_alerts($db),'id'),true),'removed recipes do not create misleading ingredient-shortage alerts');
    $db->prepare("INSERT dbo.inventory_movements(inventory_item_id,movement_type,quantity_delta,recorded_by_staff_id,reason) VALUES(?,'restock','8.500',?,'Restore removal fixture')")->execute([(int)$stock['item_id'],$actor]);
    removal_reject(fn()=>menu_save($db,['id'=>$id]+$base),404,'a stale menu editor cannot restore a removed item');
    removal_reject(fn()=>inventory_mutate($db,$actor,['action'=>'save_recipe','submission_key'=>removal_key(),'menu_id'=>$id,'ingredients'=>[['item_id'=>(int)$stock['item_id'],'quantity'=>'2']]]),404,'stale BOM cannot edit a removed item');
    $retry=pos_submit($db,['role'=>'admin','staff_id'=>$actor],$request);
    removal_check($retry['replayed']&&(int)$retry['order']['order_id']===$paidId,'accepted POS retry still returns its original order');
    $new=$request;$new['submission_key']=removal_key();
    removal_reject(fn()=>pos_submit($db,['role'=>'admin','staff_id'=>$actor],$new),409,'a new POS order cannot use the removed item');
    $lines=orders_lines([['itemId'=>(string)$id,'quantity'=>1]]);
    removal_reject(function()use($db,&$lines){orders_catalog($db,$lines,5000);},409,'shared online/dine-in stale-cart validation rejects removed item');
    $payment=orders_pay($db,$actor,$unpaid,['payment_method'=>'Cash','amount_received'=>'50.00']);
    removal_check($payment['order']['order_status']==='preparing','an existing unpaid order can still be paid after menu removal');
    removal_check(inventory_balance($db,(int)$stock['item_id'])===8000,'existing unpaid order still consumes the retained recipe');
    menu_remove($db,$id,$actor);
    $count=$db->query("SELECT COUNT(*) FROM dbo.system_audit_log WHERE entity_type='menu_item' AND action='menu_item_removed' AND entity_key=N'$id'")->fetchColumn();
    removal_check((int)$count===1,'repeated removal succeeds without a duplicate lifecycle record');
    $db->exec('UPDATE dbo.menu_items SET is_available=1 WHERE menu_item_id='.$id);
    removal_check(menu_rows($db,$id)===[]&&(int)$db->query('SELECT COUNT(*) FROM dbo.menu_items m WHERE m.menu_item_id='.$id.' AND '.inventory_menu_condition())->fetchColumn()===0,'availability alone cannot restore a removed item');
    $unused=menu_save($db,array_replace($base,['name'=>$base['name'].' unused','available'=>false]));menu_remove($db,$unused['id'],$actor);
    removal_check(menu_rows($db,$unused['id'])===[],'unused and already unavailable items can also be removed');
    $replacement=menu_save($db,$base);
    removal_check($replacement['id']!==$id&&count(menu_rows($db,$replacement['id']))===1,'a replacement with the same name is a separate active item');
    removal_reject(fn()=>menu_remove($db,2147483647,$actor),404,'unknown IDs return a clear not-found response');
    echo "$checks menu removal checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "All menu, recipe, order, payment and removal fixtures rolled back.\n";}
