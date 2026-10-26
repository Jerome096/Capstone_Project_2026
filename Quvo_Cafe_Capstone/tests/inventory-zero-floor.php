<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';require_once __DIR__.'/../includes/menu.php';require_once __DIR__.'/../includes/pos.php';
$checks=0;function floor_check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException($label);$checks++;echo "PASS: $label\n";}
function floor_key():string{return bin2hex(random_bytes(4)).'-1234-4234-8234-123456789012';}
$db=quvo_db();$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local rollback test database required.');
$db->beginTransaction();try{
 inventory_lock($db);$tag=bin2hex(random_bytes(5));$actor=(int)$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name)='admin'")->fetchColumn();
 $mutate=function(array $input)use($db,$actor):array{return inventory_mutate($db,$actor,['submission_key'=>floor_key()]+$input);};
 $raw=function(int $id)use($db):int{$q=$db->prepare('SELECT COALESCE(SUM(quantity_delta),0) FROM dbo.inventory_movements WHERE inventory_item_id=?');$q->execute([$id]);$value=inventory_quantity($q->fetchColumn(),true);$q->closeCursor();return $value;};
 $stock=function(string $name,string $unit,string $current)use($mutate,$tag):int{return (int)$mutate(['action'=>'save_item','name'=>$name.' '.$tag,'category'=>'Other','unit'=>$unit,'current'=>$current,'reorder'=>'1','note'=>''])['item_id'];};
 $menu=function(string $name,int $stock,string $quantity)use($db,$mutate,$tag):array{$item=menu_save($db,['name'=>$name.' '.$tag,'category'=>'food','price'=>'50.00','available'=>true,'optionGroups'=>[]]);$mutate(['action'=>'save_recipe','menu_id'=>$item['id'],'ingredients'=>[['item_id'=>$stock,'quantity'=>$quantity]]]);return $item;};
 $input=function(array $items):array{$total=0;$lines=[];foreach($items as [$item,$quantity]){$total+=$quantity*5000;$lines[]=['menu_id'=>$item['id'],'quantity'=>$quantity,'custom_options'=>[],'custom_options_version'=>$item['optionVersion']];}return ['submission_key'=>floor_key(),'customer_name'=>'Zero floor rollback','expected_total'=>orders_money($total),'payment_method'=>'Cash','amount_received'=>orders_money($total),'items'=>$lines];};
 $pay=function(array $request)use($db,$actor):array{return pos_submit($db,['staff_id'=>$actor,'role'=>'admin'],$request);};
 $audit=function(int $id)use($db):array{$q=$db->prepare("SELECT details_json FROM dbo.system_audit_log WHERE entity_type='order' AND entity_key=? AND action='inventory_order_consumed'");$q->execute([(string)$id]);$rows=$q->fetchAll();$q->closeCursor();floor_check(count($rows)===1,'one durable consumption marker per accepted order');return json_decode($rows[0]['details_json'],true,32,JSON_THROW_ON_ERROR);};
 $eggs=$stock('Eggs','pcs','2');$eggMenu=$menu('Egg meal',$eggs,'1');$request=$input([[$eggMenu,5]]);$first=$pay($request);$id=(int)$first['order']['order_id'];
 floor_check($first['order']['order_status']==='preparing'&&$first['order']['payment_status']==='paid','five-item order is accepted with only two units in stock');
 floor_check($raw($eggs)===0,'actual ledger balance stops at zero, not just the displayed number');
 $delta=$db->query("SELECT SUM(quantity_delta) FROM dbo.inventory_movements WHERE inventory_item_id=$eggs AND movement_type='consumption'")->fetchColumn();floor_check(inventory_quantity($delta,true)===-2000,'deduction uses only the two available units');
 $details=$audit($id);floor_check($details['shortages'][0]['required']==='5.000'&&$details['shortages'][0]['deducted']==='2.000'&&$details['shortages'][0]['shortfall']==='3.000','required, deducted and unmet quantities remain recorded');
 floor_check($first['order']['items'][0]['quantity']===5&&$first['order']['total_amount']==='250.00','order quantity and full payment amount remain unchanged');
 $mutate(['action'=>'movement','id'=>$eggs,'type'=>'restock','quantity'=>'5','note'=>'']);inventory_consume_order($db,$id,$actor);floor_check($raw($eggs)===5000,'direct consumption retry after restock does not deduct old shortages');
 floor_check($pay($request)['replayed']&&$raw($eggs)===5000,'payment retry after restock preserves the new stock');
 $mutate(['action'=>'movement','id'=>$eggs,'type'=>'adjustment','quantity'=>'-5','note'=>'Zero stock fixture']);$zeroRequest=$input([[$eggMenu,2]]);$zero=$pay($zeroRequest);$zeroId=(int)$zero['order']['order_id'];
 floor_check($raw($eggs)===0,'accepting an order at zero stock never creates a negative balance');
 floor_check((int)$db->query("SELECT COUNT(*) FROM dbo.inventory_movements WHERE order_item_id IN(SELECT order_item_id FROM dbo.order_items WHERE order_id=$zeroId)")->fetchColumn()===0,'zero deductions do not create invalid zero movement rows');
 $zeroAudit=$audit($zeroId);floor_check($zeroAudit['shortages'][0]['deducted']==='0.000'&&$zeroAudit['shortages'][0]['shortfall']==='2.000','zero-stock acceptance retains its unmet recipe requirement');
 $mutate(['action'=>'movement','id'=>$eggs,'type'=>'restock','quantity'=>'7','note'=>'']);inventory_consume_order($db,$zeroId,$actor);floor_check($raw($eggs)===7000,'zero-deduction marker prevents retroactive consumption after delivery');
 $milk=$stock('Milk','L','0.250');$latte=$menu('Latte',$milk,'0.180');$matcha=$menu('Matcha',$milk,'0.180');$shared=$pay($input([[$latte,1],[$matcha,1]]));$sharedId=(int)$shared['order']['order_id'];
 floor_check($raw($milk)===0,'multiple lines sharing an ingredient cannot overdraw it');
 $parts=$db->query("SELECT quantity_delta FROM dbo.inventory_movements WHERE inventory_item_id=$milk AND movement_type='consumption' ORDER BY movement_id")->fetchAll(PDO::FETCH_COLUMN);
 floor_check(array_map(fn($value)=>inventory_quantity($value,true),$parts)===[-180,-70],'shared stock is allocated precisely across the order lines');
 $sharedAudit=$audit($sharedId);floor_check($sharedAudit['shortages'][0]['shortfall']==='0.110','shared-ingredient shortfall is retained exactly');
 $legacy=$stock('Legacy eggs','pcs','0');$q=$db->prepare("INSERT dbo.inventory_movements(inventory_item_id,movement_type,quantity_delta,recorded_by_staff_id,reason) OUTPUT INSERTED.movement_id VALUES(?,'adjustment','-3.000',?,'Legacy negative fixture')");$q->execute([$legacy,$actor]);$oldMovement=(int)$q->fetchColumn();$q->closeCursor();
 floor_check($raw($legacy)===-3000&&inventory_balance($db,$legacy)===0,'legacy raw deficit is bounded to zero in balance reads');
 $snapshot=inventory_snapshot($db);$item=array_values(array_filter($snapshot['items'],fn($item)=>(int)$item['id']===$legacy))[0];$alerts=array_values(array_filter(inventory_stock_alerts($db),fn($item)=>(int)$item['id']===$legacy));
 floor_check($item['current']==='0.000'&&$alerts[0]['current']==='0.000','inventory and dashboard never display a legacy negative quantity');
 floor_check(inventory_normalize_negative($db,$actor,[$legacy])===1&&$raw($legacy)===0,'legacy negative ledger is corrected to zero with a real adjustment');
 floor_check((int)$db->query("SELECT COUNT(*) FROM dbo.inventory_movements WHERE movement_id=$oldMovement AND quantity_delta=-3")->fetchColumn()===1,'legacy movement rows are preserved unchanged');
 $correction=$db->query("SELECT TOP 1 movement_type,quantity_delta,reason FROM dbo.inventory_movements WHERE inventory_item_id=$legacy ORDER BY movement_id DESC")->fetch();floor_check($correction['movement_type']==='adjustment'&&inventory_quantity($correction['quantity_delta'])===3000&&str_contains($correction['reason'],'Negative stock corrected'),'the correction is visible and explained in movement history');
 $count=(int)$db->query("SELECT COUNT(*) FROM dbo.inventory_movements WHERE inventory_item_id=$legacy")->fetchColumn();floor_check(inventory_normalize_negative($db,$actor,[$legacy])===0&&(int)$db->query("SELECT COUNT(*) FROM dbo.inventory_movements WHERE inventory_item_id=$legacy")->fetchColumn()===$count,'opening inventory repeatedly cannot repeat a correction');
 $db->prepare("INSERT dbo.inventory_movements(inventory_item_id,movement_type,quantity_delta,recorded_by_staff_id,reason) VALUES(?,'adjustment','-2.000',?,'Second legacy fixture')")->execute([$legacy,$actor]);
 $restock=['submission_key'=>floor_key(),'action'=>'movement','id'=>$legacy,'type'=>'restock','quantity'=>'5','note'=>'Delivery'];inventory_mutate($db,$actor,$restock);floor_check($raw($legacy)===5000,'restocking repairs old debt first and adds the entire delivered quantity');
 floor_check(inventory_mutate($db,$actor,$restock)['replayed']&&$raw($legacy)===5000,'restock retries do not repeat corrections or add duplicate deliveries');
 try{$mutate(['action'=>'movement','id'=>$legacy,'type'=>'waste','quantity'=>'-6','note'=>'Invalid waste']);throw new RuntimeException('Negative waste accepted');}catch(OrderError $error){floor_check($error->status===422&&$raw($legacy)===5000,'manual waste cannot take stock below zero');}
 try{$stock('Invalid negative','pcs','-1');throw new RuntimeException('Negative count accepted');}catch(OrderError $error){floor_check($error->status===422,'negative physical counts remain invalid');}
 $before=$raw($eggs);$rollbackRequest=$input([[$eggMenu,1]]);$db->exec('SAVE TRANSACTION floor_atomic');$temporary=$pay($rollbackRequest);$temporaryId=(int)$temporary['order']['order_id'];$db->exec('ROLLBACK TRANSACTION floor_atomic');
 floor_check($raw($eggs)===$before&&(int)$db->query("SELECT COUNT(*) FROM dbo.system_audit_log WHERE entity_type='order' AND entity_key=N'$temporaryId' AND action='inventory_order_consumed'")->fetchColumn()===0,'rollback restores stock and removes the consumption marker together');
 $pay($rollbackRequest);floor_check($raw($eggs)===$before-1000,'retry after rollback deducts once in the successful transaction');
 echo "$checks inventory zero-floor SQL checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "All zero-floor, legacy correction, order and payment fixtures rolled back.\n";}
