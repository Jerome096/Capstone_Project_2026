<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';require_once __DIR__.'/../includes/menu.php';require_once __DIR__.'/../includes/pos.php';
$checks=0;function unit_picker_check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException($label);$checks++;echo "PASS: $label\n";}
function unit_picker_key():string{return bin2hex(random_bytes(4)).'-1234-4234-8234-123456789012';}
$db=quvo_db();$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local rollback test database required.');
$db->beginTransaction();try{
 $actor=(int)$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name)='admin'")->fetchColumn();
 $tag=bin2hex(random_bytes(5));$ids=[];
 foreach(['kg','g','L','mL','pcs','pack','bottle','box','can','cup'] as $unit){
  $result=inventory_mutate($db,$actor,['action'=>'save_item','submission_key'=>unit_picker_key(),'name'=>'Picker '.$tag.' '.$unit,'category'=>'Other','unit'=>$unit,'current'=>'10','reorder'=>'2','note'=>'']);
  $id=(int)$result['item_id'];$ids[strtolower($unit)]=$id;$item=inventory_item($db,$id);
  unit_picker_check(strcasecmp($item['unit_code'],$unit)===0&&inventory_balance($db,$id)===10000,'new '.$unit.' stock saves its unit and exact opening balance');
 }
 $lines=[];
 foreach(['pack','bottle','box','can','cup'] as $unit){
  $id=$ids[$unit];inventory_mutate($db,$actor,['action'=>'movement','submission_key'=>unit_picker_key(),'id'=>$id,'type'=>'restock','quantity'=>'2.500','note'=>'']);
  unit_picker_check(inventory_balance($db,$id)===12500,'restock adds 2.500 '.$unit.' without changing units');
  $lines[]=['item_id'=>$id,'quantity'=>'1.250'];
 }
 $menu=menu_save($db,['name'=>'Picker recipe '.$tag,'category'=>'food','price'=>'50.00','available'=>true,'optionGroups'=>[]]);
 inventory_mutate($db,$actor,['action'=>'save_recipe','submission_key'=>unit_picker_key(),'menu_id'=>$menu['id'],'ingredients'=>$lines]);
 pos_submit($db,['role'=>'admin','staff_id'=>$actor],['submission_key'=>unit_picker_key(),'customer_name'=>'Unit picker rollback','expected_total'=>'50.00','payment_method'=>'Cash','amount_received'=>'50.00','items'=>[['menu_id'=>$menu['id'],'quantity'=>1,'custom_options'=>[],'custom_options_version'=>$menu['optionVersion']]]]);
 foreach(['pack','bottle','box','can','cup'] as $unit)unit_picker_check(inventory_balance($db,$ids[$unit])===11250,'payment deducts 1.250 '.$unit.' in the stock unit');
 $custom=inventory_mutate($db,$actor,['action'=>'save_item','submission_key'=>unit_picker_key(),'name'=>'Existing custom '.$tag,'category'=>'Other','unit'=>'bundle','current'=>'3','reorder'=>'0','note'=>'']);
 $id=(int)$custom['item_id'];$item=inventory_item($db,$id);
 inventory_mutate($db,$actor,['action'=>'save_item','submission_key'=>unit_picker_key(),'id'=>$id,'version'=>$item['version'],'name'=>$item['item_name'],'category'=>'Other','unit'=>'bundle','current'=>'4','reorder'=>'0','note'=>'']);
 unit_picker_check(inventory_item($db,$id)['unit_code']==='bundle'&&inventory_balance($db,$id)===4000,'an existing custom unit retains its meaning during stock edits');
 echo "$checks inventory unit picker SQL checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "Unit, stock, recipe, payment and order fixtures rolled back.\n";}
