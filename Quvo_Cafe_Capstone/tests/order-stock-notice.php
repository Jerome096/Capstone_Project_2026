<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';require_once __DIR__.'/../includes/menu.php';require_once __DIR__.'/../includes/pos.php';
$checks=0;function stock_notice_check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException($label);$checks++;echo "PASS: $label\n";}
function stock_notice_key():string{return bin2hex(random_bytes(4)).'-1234-4234-8234-123456789012';}
$db=quvo_db();$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local rollback test database required.');
$db->beginTransaction();try{
 inventory_lock($db);$tag=bin2hex(random_bytes(5));$actor=(int)$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name)='admin'")->fetchColumn();
 $stock=inventory_mutate($db,$actor,['action'=>'save_item','submission_key'=>stock_notice_key(),'name'=>'Milk <notice> '.$tag,'category'=>'Other','unit'=>'L','current'=>'0.300','reorder'=>'2','note'=>'']);$stockId=(int)$stock['item_id'];
 $menus=[];foreach(['Latte','Matcha','Untracked'] as $name)$menus[]=menu_save($db,['name'=>$name.' <notice> '.$tag,'category'=>'food','price'=>'50.00','available'=>true,'optionGroups'=>[]]);
 foreach(array_slice($menus,0,2) as $menu)inventory_mutate($db,$actor,['action'=>'save_recipe','submission_key'=>stock_notice_key(),'menu_id'=>$menu['id'],'ingredients'=>[['item_id'=>$stockId,'quantity'=>'0.180']]]);
 $create=function(array $items)use($db,$actor):int{
  $total=0;foreach($items as [$menu,$quantity])$total+=orders_cents((string)$menu['price'])*$quantity;
  $q=$db->prepare("INSERT dbo.orders(order_source,pos_staff_id,customer_name,submission_key,submission_hash,total_amount,preferred_payment_method) OUTPUT INSERTED.order_id VALUES('walk_in',?,'Stock notice rollback',?,CONVERT(binary(32),?,2),?,'Cash')");$q->execute([$actor,stock_notice_key(),hash('sha256',random_bytes(16)),orders_money($total)]);$id=(int)$q->fetchColumn();$q->closeCursor();
  $q=$db->prepare('INSERT dbo.order_items(order_id,line_number,menu_item_id,item_name,category,unit_price,quantity,customization_json,notes) VALUES(?,?,?,?,?,?,?,?,?)');
  foreach($items as $index=>[$menu,$quantity])$q->execute([$id,$index+1,$menu['id'],$menu['name'],$menu['category'],(string)$menu['price'],$quantity,json_encode(['size'=>'Not applicable','sugarLevel'=>'Not applicable','iceLevel'=>'Not applicable'],JSON_THROW_ON_ERROR),'']);return $id;
 };
 $single=$create([[$menus[0],1]]);$multi=$create([[$menus[0],2]]);$shared=$create([[$menus[0],1],[$menus[1],1]]);$untracked=$create([[$menus[2],1]]);
 stock_notice_check(!inventory_order_notice($db,$single)['hasWarnings'],'low reorder balance with enough ingredients does not claim an order shortage');
 $before=(int)$db->query('SELECT COUNT(*) FROM dbo.inventory_movements')->fetchColumn();$notice=inventory_order_notice($db,$multi);
 stock_notice_check($notice['orderId']===(string)$multi&&$notice['hasWarnings'],'staff preview identifies the selected order shortage');
 stock_notice_check(count($notice['shortages'])===1&&$notice['shortages'][0]['required']==='0.360'&&$notice['shortages'][0]['available']==='0.300','whole order quantity is compared with exact stock units');
 stock_notice_check($notice['shortages'][0]['items'][0]['quantity']===2&&$notice['shortages'][0]['items'][0]['name']===$menus[0]['name'],'affected menu snapshot and quantity are returned');
 stock_notice_check(strtolower($notice['shortages'][0]['unit'])==='l','stock unit is returned without inventing a conversion');
 stock_notice_check((int)$db->query('SELECT COUNT(*) FROM dbo.inventory_movements')->fetchColumn()===$before&&inventory_balance($db,$stockId)===300,'checking stock creates no movement and deducts nothing');
 $both=inventory_order_notice($db,$shared);
 stock_notice_check(count($both['shortages'])===1&&count($both['shortages'][0]['items'])===2&&$both['shortages'][0]['required']==='0.360','shared ingredients are aggregated across different menu items');
 $repeat=$create([[$menus[0],1],[$menus[0],1]]);stock_notice_check(inventory_order_notice($db,$repeat)['shortages'][0]['required']==='0.360','separate lines of the same item also contribute to the full requirement');
 stock_notice_check(!inventory_order_notice($db,$untracked)['hasWarnings'],'an item without a linked recipe does not invent a stock shortage');
 $move=function(string $quantity)use($db,$actor,$stockId):void{inventory_mutate($db,$actor,['action'=>'movement','submission_key'=>stock_notice_key(),'id'=>$stockId,'type'=>str_starts_with($quantity,'-')?'adjustment':'restock','quantity'=>$quantity,'note'=>'Stock notice test']);};
 $move('0.060');stock_notice_check(!inventory_order_notice($db,$multi)['hasWarnings'],'exactly enough stock is not a shortage');
 $move('-0.360');$empty=inventory_order_notice($db,$multi);stock_notice_check($empty['shortages'][0]['available']==='0.000'&&$empty['hasWarnings'],'zero recorded stock produces an order notice');
 $payment=orders_pay($db,$actor,$multi,['payment_method'=>'Cash','amount_received'=>'100.00']);
 stock_notice_check($payment['order']['order_status']==='preparing'&&$payment['order']['payment_status']==='paid','staff can accept and pay an order despite its stock notice');
 stock_notice_check(inventory_balance($db,$stockId)===0,'advisory stock does not deduct below zero');
 stock_notice_check(!inventory_order_notice($db,$multi)['hasWarnings'],'an already-paid order is not falsely checked against its own deduction');
 stock_notice_check(inventory_order_notice($db,$shared)['shortages'][0]['available']==='0.000','zero stock remains visible as an order shortage');
 $retry=orders_pay($db,$actor,$multi,['payment_method'=>'Cash','amount_received'=>'100.00']);stock_notice_check($retry['replayed']&&inventory_balance($db,$stockId)===0,'payment retries remain idempotent and stock stays at zero');
 $move('1.000');stock_notice_check(!inventory_order_notice($db,$shared)['hasWarnings'],'a fresh check reflects restocking');
 $db->prepare('UPDATE dbo.menu_items SET is_available=0 WHERE menu_item_id=?')->execute([$menus[2]['id']]);$manual=inventory_order_notice($db,$untracked);
 stock_notice_check($manual['hasWarnings']&&count($manual['unavailableItems'])===1&&$manual['shortages']===[],'manually unavailable items are flagged even without a recipe');
 $db->prepare('UPDATE dbo.inventory_items SET is_active=0 WHERE inventory_item_id=?')->execute([$stockId]);stock_notice_check(!inventory_order_notice($db,$shared)['shortages'][0]['active'],'inactive recorded ingredients are identified');
 $db->prepare('UPDATE dbo.inventory_items SET is_active=1 WHERE inventory_item_id=?')->execute([$stockId]);
 orders_cancel($db,['staff_id'=>$actor,'role'=>'admin'],$shared,'Rollback test');stock_notice_check(!inventory_order_notice($db,$shared)['hasWarnings'],'cancelled orders no longer trigger an acceptance notice');
 menu_remove($db,$menus[2]['id'],$actor);stock_notice_check(inventory_order_notice($db,$untracked)['hasWarnings'],'a removed menu item on an existing unpaid order remains reviewable');
 try{inventory_order_notice($db,2147483647);throw new RuntimeException('Unknown order accepted');}catch(OrderError $error){stock_notice_check($error->status===404,'unknown orders return a clear not-found result');}
 echo "$checks order stock notice SQL checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "Stock notice, order, payment, menu and recipe fixtures rolled back.\n";}
