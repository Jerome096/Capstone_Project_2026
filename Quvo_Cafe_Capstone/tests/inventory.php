<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/pos.php';
require_once __DIR__.'/../includes/online.php';
$checks=0;
function check(bool $ok,string $label):void {global $checks;if(!$ok)throw new RuntimeException('FAIL: '.$label);$checks++;echo "PASS: $label\n";}
function rejected(callable $fn,int $status,string $label):void {
    global $db;$db->exec('SAVE TRANSACTION inventory_test');
    try{$fn();}catch(OrderError $e){$db->exec('ROLLBACK TRANSACTION inventory_test');check($e->status===$status,$label);return;}
    throw new RuntimeException('FAIL: accepted '.$label);
}
function keygen():string {$h=bin2hex(random_bytes(16));return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20);}
function mutate(array $input):array {global $db,$actor;return inventory_mutate($db,$actor['staff_id'],['submission_key'=>keygen()]+$input);}
function menu(string $name,string $category='coffee'):int {global $db;$q=$db->prepare('INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(?,?,10,1)');$q->execute([$name,$category]);$id=(int)$q->fetchColumn();$q->closeCursor();return $id;}
function available(int $id):bool {global $db;$q=$db->prepare('SELECT CASE WHEN '.inventory_menu_condition().' THEN 1 ELSE 0 END FROM dbo.menu_items m WHERE menu_item_id=?');$q->execute([$id]);$result=$q->fetchColumn();$q->closeCursor();return (bool)$result;}
function countchange(int $id,string $name,string $qty):array {global $db;return mutate(['action'=>'save_item','id'=>$id,'version'=>inventory_item($db,$id)['version'],'name'=>$name,'category'=>'Other','unit'=>'ml','current'=>$qty,'reorder'=>'0.500','note'=>'Test physical count']);}
$db=quvo_db();$before=(int)$db->query('SELECT COUNT(*) FROM dbo.inventory_movements')->fetchColumn();
try {
    $db->beginTransaction();inventory_lock($db);$tag=bin2hex(random_bytes(6));
    $actor=['staff_id'=>(int)$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name)='admin' ORDER BY s.staff_id")->fetchColumn(),'role'=>'admin'];
    check($actor['staff_id']>0,'active admin exists');
    rejected(fn()=>inventory_access(null,false),401,'anonymous inventory access denied');
    rejected(fn()=>inventory_access(['role'=>'staff'],true),403,'staff inventory access denied');
    rejected(fn()=>inventory_access($actor,false),403,'admin confirmation required');inventory_access($actor,true);
    check(inventory_decimal(inventory_quantity('.001'))==='0.001'&&inventory_quantity('-.250',true)===-250,'SQL decimals and negative decimals normalize exactly');
    rejected(fn()=>inventory_quantity('1.0001'),422,'four-decimal stock rejected');
    rejected(fn()=>inventory_quantity('-1'),422,'negative stock count rejected');
    rejected(fn()=>inventory_quantity(0.1),422,'floating-point stock input rejected');
    $name='Inventory milk '.$tag;
    $payload=['submission_key'=>keygen(),'action'=>'save_item','name'=>$name,'category'=>'Milk and dairy','unit'=>'ml','current'=>'10.125','reorder'=>'1.000','note'=>'Test opening stock'];
    foreach([['name','','stock_name'],['unit','','stock_unit'],['current','','stock_current'],['current','1.0001','stock_current'],['reorder','-1','stock_reorder']] as [$field,$value,$code]) {
        try {inventory_mutate($db,$actor['staff_id'],[...$payload,$field=>$value]);throw new RuntimeException('Invalid stock field accepted');}
        catch(OrderError $error){check($error->status===422&&$error->errorCode===$code,'invalid '.$field.' returns a specific field error');}
    }
    $saved=inventory_mutate($db,$actor['staff_id'],$payload);$milk=(int)$saved['item_id'];
    check(inventory_balance($db,$milk)===10125,'opening stock recorded in ledger with three decimals');
    check(inventory_mutate($db,$actor['staff_id'],$payload)['replayed']&&inventory_balance($db,$milk)===10125,'same submission key never restocks twice');
    rejected(fn()=>inventory_mutate($db,$actor['staff_id'],[...$payload,'current'=>'20']),409,'changed retry payload rejected');
    rejected(fn()=>mutate([...$payload,'submission_key'=>keygen()]),422,'duplicate stock item name rejected');
    $empty=mutate(['action'=>'save_item','name'=>'Inventory zero '.$tag,'category'=>'Other','unit'=>'pcs','current'=>'0','reorder'=>'','note'=>'']);
    check(inventory_quantity(inventory_item($db,(int)$empty['item_id'])['reorder_level'])===0,'blank reorder level defaults to zero in SQL');
    check(inventory_balance($db,(int)$empty['item_id'])===0,'zero opening stock creates no invalid zero movement');
    $version=inventory_item($db,$milk)['version'];
    mutate(['action'=>'movement','id'=>$milk,'type'=>'restock','quantity'=>'1.000','note'=>'Delivery']);
    check(inventory_balance($db,$milk)===11125,'explicit restock increases balance');
    rejected(fn()=>mutate(['action'=>'save_item','id'=>$milk,'version'=>$version,'name'=>$name,'category'=>'Other','unit'=>'ml','current'=>'10.125','reorder'=>'1','note'=>'Stale count']),409,'stale stock form cannot overwrite concurrent stock changes');
    rejected(fn()=>mutate(['action'=>'save_item','id'=>$milk,'version'=>inventory_item($db,$milk)['version'],'name'=>$name,'category'=>'Other','unit'=>'L','current'=>'11.125','reorder'=>'1','note'=>'']),422,'existing stock unit cannot change');
    mutate(['action'=>'movement','id'=>$milk,'type'=>'waste','quantity'=>'-0.125','note'=>'Spill']);
    mutate(['action'=>'movement','id'=>$milk,'type'=>'adjustment','quantity'=>'0.250','note'=>'Physical count']);
    check(inventory_balance($db,$milk)===11250,'waste and signed adjustments reconcile exactly');
    rejected(fn()=>mutate(['action'=>'movement','id'=>$milk,'type'=>'waste','quantity'=>'-50','note'=>'Spill']),422,'movements cannot make stock negative');
    rejected(fn()=>mutate(['action'=>'movement','id'=>$milk,'type'=>'adjustment','quantity'=>'-1','note'=>'']),422,'stock adjustments require a reason');
    $bean=(int)mutate(['action'=>'save_item','name'=>'Inventory beans '.$tag,'category'=>'Coffee','unit'=>'kg','current'=>'2','reorder'=>'0.100','note'=>''])['item_id'];
    $coffee=menu('Inventory coffee '.$tag);$food=menu('Inventory food '.$tag,'food');
    $recipe=['action'=>'save_recipe','menu_id'=>$coffee,'recipe_id'=>null,'ingredients'=>[['item_id'=>$milk,'quantity'=>'0.250'],['item_id'=>$bean,'quantity'=>'0.010']]];
    $recipeSaved=mutate($recipe);$recipeId=$recipeSaved['recipe_id'];
    mutate(['action'=>'save_recipe','menu_id'=>$food,'recipe_id'=>null,'ingredients'=>[['item_id'=>$milk,'quantity'=>'0.100']]]);
    rejected(fn()=>mutate($recipe),409,'stale recipe form cannot replace a new recipe');
    rejected(fn()=>mutate([...$recipe,'recipe_id'=>$recipeId,'ingredients'=>[['item_id'=>$milk,'quantity'=>'0.250'],['item_id'=>$milk,'quantity'=>'0.100']]]),422,'duplicate ingredients rejected');
    rejected(fn()=>inventory_requirements($db,[['menu_item_id'=>$coffee,'quantity'=>30],['menu_item_id'=>$food,'quantity'=>40]]),409,'shared ingredient demand checked across every order line');
    $snapshot=inventory_snapshot($db);
    check(count(array_filter($snapshot['items'],fn($i)=>$i['id']===(string)$milk&&str_contains($i['linkedMenu'],'Inventory coffee')))===1,'snapshot links stock and menus by SQL identity');
    $q=$db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT INSERTED.table_id VALUES(?,?,'indoor')");$q->execute(['inv-'.$tag,'Inventory test']);$table=(int)$q->fetchColumn();$q->closeCursor();
    $token=bin2hex(random_bytes(32));$q=$db->prepare("INSERT dbo.customer_sessions(table_id,guest_name,guest_token_hash,status) OUTPUT INSERTED.session_id VALUES(?,'Inventory test',CONVERT(binary(32),?,2),'active')");$q->execute([$table,hash('sha256',$token)]);$q->fetchColumn();$q->closeCursor();
    $dineInput=['submission_key'=>keygen(),'expected_total'=>'20.00','items'=>[['itemId'=>$coffee,'quantity'=>2]]];
    $dine=orders_submit($db,$table,$token,$dineInput);$dineId=(int)$dine['order']['order_id'];
    check(inventory_balance($db,$milk)===11250,'unpaid dine-in submission does not deduct stock');
    $paid=orders_pay($db,$actor['staff_id'],$dineId,['payment_method'=>'Cash','amount_received'=>'20.00']);
    check(inventory_balance($db,$milk)===10750&&inventory_balance($db,$bean)===1980,'dine-in payment consumes each ingredient times quantity');
    check($paid['order']['order_status']==='preparing','stock deduction and preparation approval occur together');
    check(orders_pay($db,$actor['staff_id'],$dineId,['payment_method'=>'Cash','amount_received'=>'20.00'])['replayed']&&inventory_balance($db,$milk)===10750,'payment retry never deducts stock twice');
    $account=online_register($db,['name'=>'Inventory test','email'=>'inv-'.$tag.'@example.invalid','contact'=>'09123456789','address'=>'Test address','password'=>'Inventory-Test-only-123']);
    $png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5kAAAAASUVORK5CYII=');
    payment_qr_save($db,$actor['staff_id'],'GCash',payment_image($png));
    $online=online_submit($db,(int)$account['customer_account_id'],['submission_key'=>keygen(),'expected_total'=>'30.00','fulfillment'=>'pickup','payment_method'=>'GCash','payment_qr_version'=>payment_qr_methods($db)['GCash']['version'],'receipt_image'=>'data:image/png;base64,'.base64_encode($png),'items'=>[['itemId'=>$coffee,'quantity'=>3]]]);
    check(inventory_balance($db,$milk)===10750,'receipt upload and online order do not confirm stock consumption');
    orders_pay($db,$actor['staff_id'],(int)$online['order']['order_id'],['payment_method'=>'GCash','amount_received'=>'30.00']);
    check(inventory_balance($db,$milk)===10000&&inventory_balance($db,$bean)===1950,'online approval consumes ingredients through the same SQL transaction');
    $posInput=['submission_key'=>keygen(),'expected_total'=>'30.00','payment_method'=>'Cash','amount_received'=>'50.00','items'=>[['menu_id'=>$coffee,'quantity'=>1],['menu_id'=>$food,'quantity'=>2]]];
    $pos=pos_submit($db,$actor,$posInput);
    check(inventory_balance($db,$milk)===9550&&inventory_balance($db,$bean)===1940,'mixed walk-in order consumes shared ingredients correctly');
    check(pos_submit($db,$actor,$posInput)['replayed']&&inventory_balance($db,$milk)===9550,'POS retry preserves stock and payment');
    mutate([...$recipe,'recipe_id'=>$recipeId,'ingredients'=>[['item_id'=>$milk,'quantity'=>'0.300']]]);
    check(orders_pay($db,$actor['staff_id'],$dineId,['payment_method'=>'Cash','amount_received'=>'20.00'])['replayed']&&inventory_balance($db,$milk)===9550,'changing recipes cannot retrospectively deduct a paid order');
    $pending=orders_submit($db,$table,$token,[...$dineInput,'submission_key'=>keygen()]);$pendingId=(int)$pending['order']['order_id'];
    countchange($milk,$name,'0.500');$movementCount=(int)$db->query('SELECT COUNT(*) FROM dbo.inventory_movements')->fetchColumn();
    rejected(fn()=>orders_pay($db,$actor['staff_id'],$pendingId,['payment_method'=>'Cash','amount_received'=>'20.00']),409,'insufficient stock rejects payment approval');
    check((int)$db->query("SELECT COUNT(*) FROM dbo.payments WHERE order_id=$pendingId")->fetchColumn()===0&&(int)$db->query('SELECT COUNT(*) FROM dbo.inventory_movements')->fetchColumn()===$movementCount,'failed approval leaves payment and ledger untouched');
    check(orders_get($db,$pendingId)['order_status']==='received','failed stock approval keeps the unpaid order received');
    rejected(fn()=>pos_submit($db,$actor,[...$posInput,'submission_key'=>keygen(),'expected_total'=>'20.00','items'=>[['menu_id'=>$coffee,'quantity'=>2]]]),409,'POS rejects aggregate shortage before inserting an order');
    countchange($milk,$name,'0');
    check(!available($coffee)&&$db->query("SELECT is_available FROM dbo.menu_items WHERE menu_item_id=$coffee")->fetchColumn()==1,'stock outage changes effective availability without changing admin preference');
    $snapshot=inventory_snapshot($db);check(in_array($coffee,array_map('intval',array_column($snapshot['impact'],'id')),true),'affected menu count uses recipe shortages');
    mutate(['action'=>'movement','id'=>$milk,'type'=>'restock','quantity'=>'1.000','note'=>'Delivery']);check(available($coffee),'restock restores stock-blocked menu availability');
    $db->prepare('UPDATE dbo.menu_items SET is_available=0 WHERE menu_item_id=?')->execute([$coffee]);check(!available($coffee),'manual unavailable setting survives restock');
    $db->prepare('UPDATE dbo.menu_items SET is_available=1 WHERE menu_item_id=?')->execute([$coffee]);
    orders_pay($db,$actor['staff_id'],$pendingId,['payment_method'=>'Cash','amount_received'=>'20.00']);check(inventory_balance($db,$milk)===400,'previous unpaid order can be approved after restock');
    for($i=0;$i<51;$i++)mutate(['action'=>'movement','id'=>$bean,'type'=>'restock','quantity'=>'0.001','note'=>'Pagination test']);
    $snapshot=inventory_snapshot($db);$older=inventory_snapshot($db,50);
    check(count($snapshot['movements'])===50&&$snapshot['nextOffset']===50&&count(array_intersect(array_column($snapshot['movements'],'id'),array_column($older['movements'],'id')))===0,'movement history paginates without duplicate records');
    echo "$checks inventory SQL checks passed.\n";
} finally {if($db->inTransaction())$db->rollBack();echo "All inventory fixtures and changes rolled back.\n";}
check((int)$db->query('SELECT COUNT(*) FROM dbo.inventory_movements')->fetchColumn()===$before,'no test stock movements remain in the database');
