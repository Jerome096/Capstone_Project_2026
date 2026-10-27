<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';require_once __DIR__.'/../includes/menu.php';require_once __DIR__.'/../includes/pos.php';require_once __DIR__.'/ordering-fixture.php';
$checks=0;function archive_check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException($label);$checks++;echo "PASS: $label\n";}
$db=quvo_db();$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local test database required.');
$db->beginTransaction();
try{
 ordering_test_open($db);inventory_lock($db);$tag=bin2hex(random_bytes(6));$actor=(int)$db->query("SELECT MIN(s.staff_id) FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE r.role_name='Admin' AND s.is_active=1")->fetchColumn();
 $mutate=fn(array $input)=>inventory_mutate($db,$actor,['submission_key'=>ordering_test_uuid()]+$input);
 $stock=$mutate(['action'=>'save_item','name'=>'Log archive '.$tag,'category'=>'Other','unit'=>'pcs','current'=>'10','reorder'=>'2','note'=>'Opening stock']);$id=(int)$stock['item_id'];
 $menu=menu_save($db,['name'=>'Archive meal '.$tag,'category'=>'appetizer','price'=>'10.00','available'=>true,'optionGroups'=>[]]);
 $mutate(['action'=>'save_recipe','menu_id'=>$menu['id'],'ingredients'=>[['item_id'=>$id,'quantity'=>'2']]]);
 $request=['submission_key'=>ordering_test_uuid(),'customer_name'=>'Archive rollback fixture','expected_total'=>'10.00','payment_method'=>'Cash','amount_received'=>'10.00','items'=>[['menu_id'=>$menu['id'],'quantity'=>1,'custom_options'=>[],'custom_options_version'=>$menu['optionVersion']]]];
 $paid=pos_submit($db,['staff_id'=>$actor,'role'=>'admin'],$request);$order=(int)$paid['order']['order_id'];$orderBefore=orders_get($db,$order);
 for($i=0;$i<60;$i++)$db->exec("INSERT dbo.inventory_movements(inventory_item_id,movement_type,quantity_delta,recorded_by_staff_id,reason) VALUES($id,'restock',0.001,$actor,'Archived page fixture')");
 $db->exec("UPDATE dbo.inventory_movements SET recorded_at='2026-10-27T18:59:20' WHERE inventory_item_id=$id");
 $db->exec("INSERT dbo.inventory_movements(inventory_item_id,movement_type,quantity_delta,recorded_by_staff_id,reason,recorded_at) VALUES($id,'restock',0.003,$actor,'Later movement retained','2026-10-27T18:59:22')");
 $before=inventory_snapshot($db);$ledger=$db->query('SELECT * FROM dbo.inventory_movements ORDER BY movement_id')->fetchAll();$balance=inventory_balance($db,$id);
 $sql=str_replace('DECLARE @Commit bit = 0;','DECLARE @Commit bit = 1;',file_get_contents(__DIR__.'/../database/maintenance/clear-test-stock-movement-log.sql'));
 $apply=function()use($db,$sql):array{$q=$db->query($sql);$result=[];do{if($q->columnCount())$result=$q->fetchAll();}while($q->nextRowset());$q->closeCursor();return $result[0];};
 $result=$apply();$after=inventory_snapshot($db);
 archive_check((int)$result['archived_log_entries']>=62,'old restock and consumption records are archived');
 archive_check($ledger===$db->query('SELECT * FROM dbo.inventory_movements ORDER BY movement_id')->fetchAll(),'original ledger rows remain byte-for-byte unchanged');
 archive_check(inventory_balance($db,$id)===$balance,'stock balance is exactly unchanged');
 foreach(['items','recipes','menus','impact'] as $part)archive_check($before[$part]===$after[$part],$part.' snapshot is unchanged');
 archive_check(count($after['movements'])===1&&$after['movements'][0]['note']==='Later movement retained','later movement remains visible');
 archive_check($after['nextOffset']===null&&inventory_snapshot($db,50)['movements']===[],'archiving is applied before pagination');
 archive_check(orders_get($db,$order)===$orderBefore,'existing order and payment are unchanged');
 $retry=pos_submit($db,['staff_id'=>$actor,'role'=>'admin'],$request);
 archive_check($retry['replayed']&&inventory_balance($db,$id)===$balance,'payment retry does not consume stock again');
 $again=$apply();archive_check((int)$again['archived_log_entries']===0,'cleanup can be safely repeated');
 $new=$mutate(['action'=>'movement','id'=>$id,'type'=>'restock','quantity'=>'1','note'=>'New movement after archive']);
 $newSnapshot=inventory_snapshot($db);archive_check(count($newSnapshot['movements'])===2&&$newSnapshot['movements'][0]['note']==='New movement after archive','new stock activity appears normally');
 archive_check(inventory_balance($db,$id)===$balance+1000,'new restock changes balance normally');
 echo "$checks stock-log archive checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "All fixtures and archive markers rolled back.\n";}
