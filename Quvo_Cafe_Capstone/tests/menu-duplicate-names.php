<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../includes/menu.php';
$checks=0;
function duplicate_check(bool $ok,string $message):void{global $checks;if(!$ok)throw new RuntimeException($message);$checks++;echo "PASS: $message\n";}
function duplicate_reject(callable $fn,string $message):void{try{$fn();}catch(OrderError $e){duplicate_check($e->status===409&&$e->errorCode==='duplicate_menu_name',$message);return;}throw new RuntimeException('Unexpected acceptance: '.$message);}
$db=quvo_db();$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local test database required.');
$db->beginTransaction();
try{
 $tag=bin2hex(random_bytes(6));$name='Latte '.$tag;
 $base=['name'=>$name,'category'=>'hot-coffee','price'=>'150.00','available'=>true,'optionGroups'=>[]];
 $a=menu_save($db,$base);
 duplicate_reject(fn()=>menu_save($db,$base),'adding an identical name in the same category is rejected');
 duplicate_reject(fn()=>menu_save($db,array_replace($base,['name'=>strtoupper($name)])),'uppercase duplicate rejected');
 duplicate_reject(fn()=>menu_save($db,array_replace($base,['name'=>strtolower($name)])),'lowercase duplicate rejected');
 duplicate_reject(fn()=>menu_save($db,array_replace($base,['name'=>'  '.$name.'  '])),'surrounding spaces cannot bypass duplicate check');
 $cold=menu_save($db,array_replace($base,['category'=>'cold-coffee','name'=>strtoupper($name)]));
 duplicate_check($cold['id']!==$a['id'],'same name in a different category is allowed');
 $a=menu_save($db,['id'=>$a['id']]+array_replace($base,['name'=>strtoupper($name)]));
 duplicate_check($a['name']===strtoupper($name),'editing own capitalization is allowed');
 $a=menu_save($db,['id'=>$a['id']]+array_replace($base,['available'=>false]));
 duplicate_reject(fn()=>menu_save($db,$base),'unavailable item still reserves its name');
 $b=menu_save($db,array_replace($base,['name'=>'Mocha '.$tag]));
 $before=menu_rows($db,$b['id']);
 duplicate_reject(fn()=>menu_save($db,['id'=>$b['id']]+array_replace($base,['name'=>strtolower($name),'price'=>'999.00','available'=>false])),'renaming another item to an existing same-category name is rejected');
 duplicate_check(menu_rows($db,$b['id'])===$before,'rejected update preserves item name, price, availability and options');
 duplicate_reject(fn()=>menu_save($db,['id'=>$cold['id']]+$base),'moving an item into a conflicting category is rejected');
 $moved=menu_save($db,['id'=>$b['id']]+array_replace($base,['category'=>'tea','name'=>strtolower($name)]));
 duplicate_check($moved['category']==='tea','moving to a category without a duplicate is allowed');
 $accent=menu_save($db,array_replace($base,['name'=>'Café '.$tag,'category'=>'non-coffee']));
 duplicate_reject(fn()=>menu_save($db,array_replace($base,['name'=>'CAFÉ '.$tag,'category'=>'non-coffee'])),'Unicode uppercase name is treated case-insensitively');
 $plain=menu_save($db,array_replace($base,['name'=>'Cafe '.$tag,'category'=>'non-coffee']));
 duplicate_check($plain['id']!==$accent['id'],'different accents are not conflated');
 $actor=(int)$db->query("SELECT MIN(s.staff_id) FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE r.role_name='Admin'")->fetchColumn();
 menu_remove($db,$a['id'],$actor);$replacement=menu_save($db,$base);
 duplicate_check($replacement['id']!==$a['id'],'name can be reused after the original item is removed');
 // Existing duplicates are retained, but future conflicting saves are blocked.
 $q=$db->prepare('INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(?,?,?,?)');$q->execute([$name,'hot-coffee','175.00',1]);$legacy=(int)$q->fetchColumn();$q->closeCursor();
 duplicate_reject(fn()=>menu_save($db,['id'=>$replacement['id']]+$base),'pre-existing duplicate prevents another conflicting save');
 duplicate_check(count(menu_rows($db,$legacy))===1&&count(menu_rows($db,$replacement['id']))===1,'existing duplicates are not automatically removed');
 $fixed=menu_save($db,['id'=>$legacy]+array_replace($base,['name'=>'Unique replacement '.$tag]));
 duplicate_check($fixed['name']==='Unique replacement '.$tag,'existing duplicate can be renamed to resolve the conflict');
 echo "$checks duplicate-name checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "All fixtures rolled back.\n";}
