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
require_once __DIR__.'/ordering-fixture.php';
$db=quvo_db();$before=(int)$db->query('SELECT COUNT(*) FROM dbo.inventory_movements')->fetchColumn();
try {
    $db->beginTransaction();ordering_test_open($db);inventory_lock($db);$tag=bin2hex(random_bytes(6));
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
    check(count(inventory_requirements($db,[['menu_item_id'=>$coffee,'quantity'=>30],['menu_item_id'=>$food,'quantity'=>40]]))===3,'shared ingredient demand is recorded without blocking orders');
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
    countchange($milk,$name,'0.500');
    $low=array_values(array_filter(inventory_stock_alerts($db),fn($item)=>$item['id']===(string)$milk));
    check(count($low)===1&&$low[0]['status']==='low'&&in_array('Inventory coffee '.$tag,$low[0]['menus'],true),'reorder threshold produces a staff reminder with linked menu names');
    $approved=orders_pay($db,$actor['staff_id'],$pendingId,['payment_method'=>'Cash','amount_received'=>'20.00']);
    check($approved['order']['order_status']==='preparing'&&inventory_balance($db,$milk)===0,'dine-in payment succeeds across a stock shortage and stock stops at zero');
    check(orders_pay($db,$actor['staff_id'],$pendingId,['payment_method'=>'Cash','amount_received'=>'20.00'])['replayed']&&inventory_balance($db,$milk)===0,'shortage payment retries never deduct twice');
    countchange($milk,$name,'0');
    check(available($coffee),'zero recorded stock does not hide an available menu item');
    $menuRow=menu_rows($db,$coffee)[0];
    check($menuRow['available']&&$menuRow['manualAvailable']&&!$menuRow['inventoryBlocked']&&$menuRow['stockWarning'],'cashier catalog keeps manual availability and exposes only an advisory stock warning');
    check(in_array((string)$coffee,array_column(online_menu($db),'id'),true),'public online catalog includes available items with zero stock');
    $zeroDine=orders_submit($db,$table,$token,[...$dineInput,'submission_key'=>keygen()]);
    check(inventory_balance($db,$milk)===0,'dine-in can submit at zero stock without deducting unpaid items');
    orders_pay($db,$actor['staff_id'],(int)$zeroDine['order']['order_id'],['payment_method'=>'Cash','amount_received'=>'20.00']);
    check(inventory_balance($db,$milk)===0,'dine-in zero-stock orders can be paid and prepared without a negative balance');
    $lowOnlineInput=['submission_key'=>keygen(),'expected_total'=>'10.00','fulfillment'=>'pickup','payment_method'=>'GCash','payment_qr_version'=>payment_qr_methods($db)['GCash']['version'],'receipt_image'=>'data:image/png;base64,'.base64_encode($png),'items'=>[['itemId'=>$coffee,'quantity'=>1]]];
    $lowOnline=online_submit($db,(int)$account['customer_account_id'],$lowOnlineInput);
    check(inventory_balance($db,$milk)===0,'online orders can submit at zero recorded stock');
    orders_pay($db,$actor['staff_id'],(int)$lowOnline['order']['order_id'],['payment_method'=>'GCash','amount_received'=>'10.00']);
    check(inventory_balance($db,$milk)===0,'online payment approval continues with stock staying at zero');
    $lowPosInput=[...$posInput,'submission_key'=>keygen(),'expected_total'=>'20.00','items'=>[['menu_id'=>$coffee,'quantity'=>2]]];
    $lowPos=pos_submit($db,$actor,$lowPosInput);
    check($lowPos['order']['order_status']==='preparing'&&inventory_balance($db,$milk)===0,'walk-in checkout continues with stock staying at zero');
    check(pos_submit($db,$actor,$lowPosInput)['replayed']&&inventory_balance($db,$milk)===0,'walk-in shortage retry cannot duplicate payment or stock deductions');
    $alerts=inventory_stock_alerts($db);$out=array_values(array_filter($alerts,fn($item)=>$item['id']===(string)$milk));
    check(count($out)===1&&$out[0]['status']==='out'&&$out[0]['current']==='0.000','zero stock remains visible as an out-of-stock staff reminder');
    check(!in_array((string)$bean,array_column($alerts,'id'),true),'healthy stock is omitted from dashboard reminders');
    $snapshot=inventory_snapshot($db);check(in_array($coffee,array_map('intval',array_column($snapshot['impact'],'id')),true),'recipe shortages remain visible for admin review');
    $db->prepare('UPDATE dbo.menu_items SET is_available=0 WHERE menu_item_id=?')->execute([$coffee]);
    check(!available($coffee)&&!in_array((string)$coffee,array_column(online_menu($db),'id'),true),'manual unavailability still removes an item from all catalogs');
    rejected(fn()=>orders_submit($db,$table,$token,[...$dineInput,'submission_key'=>keygen()]),409,'manual unavailability still prevents new dine-in orders');
    rejected(fn()=>online_submit($db,(int)$account['customer_account_id'],[...$lowOnlineInput,'submission_key'=>keygen()]),409,'manual unavailability still prevents new online orders');
    rejected(fn()=>pos_submit($db,$actor,[...$lowPosInput,'submission_key'=>keygen()]),409,'manual unavailability still prevents walk-in checkout');
    mutate(['action'=>'movement','id'=>$milk,'type'=>'restock','quantity'=>'0.500','note'=>'Partial delivery']);
    check(inventory_balance($db,$milk)===500,'restocking starts from zero without carrying a stock deficit');
    mutate(['action'=>'movement','id'=>$milk,'type'=>'restock','quantity'=>'1.400','note'=>'Delivery']);
    check(inventory_balance($db,$milk)===1900&&!available($coffee),'restocking never overrides manual unavailability');
    countchange($milk,$name,'0.800');
    check(!in_array((string)$milk,array_column(inventory_stock_alerts($db),'id'),true),'restock or a corrected physical count clears resolved reminders');
    $db->prepare('UPDATE dbo.menu_items SET is_available=1 WHERE menu_item_id=?')->execute([$coffee]);check(available($coffee),'the cafe can explicitly make the item available again');
    $oldRemovalVersion=inventory_item($db,$milk)['version'];
    $receiptFreeRestock=['submission_key'=>keygen(),'action'=>'movement','id'=>$milk,'type'=>'restock','quantity'=>'0.200','note'=>''];
    inventory_mutate($db,$actor['staff_id'],$receiptFreeRestock);
    check(inventory_balance($db,$milk)===1000,'restock succeeds with an optional empty reference');
    check($db->query("SELECT TOP 1 reason FROM dbo.inventory_movements WHERE inventory_item_id=$milk ORDER BY movement_id DESC")->fetchColumn()==='Stock received','receipt-free restock retains a readable movement description');
    check(inventory_mutate($db,$actor['staff_id'],$receiptFreeRestock)['replayed']&&inventory_balance($db,$milk)===1000,'restock retry cannot add the same delivery twice');
    rejected(fn()=>mutate(['action'=>'movement','id'=>$milk,'type'=>'waste','quantity'=>'-0.001','note'=>'']),422,'waste still requires a reason');
    rejected(fn()=>mutate(['action'=>'remove_item','id'=>$milk,'version'=>$oldRemovalVersion]),409,'stale removal cannot discard a recently restocked item');
    check(inventory_item($db,$milk)['is_active']==1,'stale removal leaves the item active');
    $blend=menu('Inventory blend '.$tag);
    $blendRecipe=mutate(['action'=>'save_recipe','menu_id'=>$blend,'recipe_id'=>null,'ingredients'=>[['item_id'=>$milk,'quantity'=>'0.100'],['item_id'=>$bean,'quantity'=>'0.010']]]);
    countchange($milk,$name,'0');
    check(in_array((string)$milk,array_column(inventory_stock_alerts($db),'id'),true),'the item has an outstanding reminder before removal');
    $milkMovementCount=(int)$db->query("SELECT COUNT(*) FROM dbo.inventory_movements WHERE inventory_item_id=$milk")->fetchColumn();
    $milkIngredientCount=(int)$db->query("SELECT COUNT(*) FROM dbo.recipe_ingredients WHERE inventory_item_id=$milk")->fetchColumn();
    $paidSnapshot=orders_get($db,$dineId)['items'];
    $removal=['submission_key'=>keygen(),'action'=>'remove_item','id'=>$milk,'version'=>inventory_item($db,$milk)['version']];
    $removed=inventory_mutate($db,$actor['staff_id'],$removal);
    check($removed['removed_recipe_links']===3,'removal detaches the stock item from every current recipe');
    check($db->query("SELECT is_active FROM dbo.inventory_items WHERE inventory_item_id=$milk")->fetchColumn()==0,'removed inventory is archived rather than physically deleted');
    $afterRemoval=inventory_snapshot($db);
    check(!in_array((string)$milk,array_column($afterRemoval['items'],'id'),true),'removed material disappears from current stock and recipe choices');
    check(!in_array((string)$milk,array_column(inventory_stock_alerts($db),'id'),true),'removed material no longer generates dashboard reminders');
    check(!in_array($coffee,array_map('intval',array_column($afterRemoval['recipes'],'menuId')),true)&&!in_array($food,array_map('intval',array_column($afterRemoval['recipes'],'menuId')),true),'single-material recipes are retired when their last material is removed');
    $remainingBlend=array_values(array_filter($afterRemoval['recipes'],fn($row)=>(int)$row['menuId']===$blend))[0];
    check(count($remainingBlend['ingredients'])===1&&(int)$remainingBlend['ingredients'][0]['item_id']===$bean&&inventory_quantity($remainingBlend['ingredients'][0]['qty'])===10,'multi-material recipes retain the other ingredients and exact quantities');
    check((int)$remainingBlend['id']!==(int)$blendRecipe['recipe_id']&&(int)$remainingBlend['version']===2,'recipe removal creates a new version instead of editing historical ingredients');
    check((int)$db->query("SELECT COUNT(*) FROM dbo.recipe_ingredients WHERE inventory_item_id=$milk")->fetchColumn()===$milkIngredientCount,'historical recipe ingredient IDs remain intact');
    check((int)$db->query("SELECT COUNT(*) FROM dbo.inventory_movements WHERE inventory_item_id=$milk")->fetchColumn()===$milkMovementCount,'all previous stock movements are preserved');
    check(orders_get($db,$dineId)['items']===$paidSnapshot,'removal preserves paid order item snapshots and receipts');
    check(available($coffee)&&available($blend),'removing a stock item does not change manual menu availability');
    $recipeCount=(int)$db->query('SELECT COUNT(*) FROM dbo.menu_recipes')->fetchColumn();
    check(inventory_mutate($db,$actor['staff_id'],$removal)['replayed']&&(int)$db->query('SELECT COUNT(*) FROM dbo.menu_recipes')->fetchColumn()===$recipeCount,'lost removal responses retry without duplicating recipe versions');
    rejected(fn()=>mutate(['action'=>'movement','id'=>$milk,'type'=>'restock','quantity'=>'1','note'=>'']),404,'removed stock cannot receive a stale restock request');
    rejected(fn()=>mutate(['action'=>'save_recipe','menu_id'=>$coffee,'recipe_id'=>null,'ingredients'=>[['item_id'=>$milk,'quantity'=>'0.100']]]),404,'new recipes cannot link removed stock');
    $beanBefore=inventory_balance($db,$bean);
    pos_submit($db,$actor,[...$posInput,'submission_key'=>keygen(),'expected_total'=>'10.00','items'=>[['menu_id'=>$blend,'quantity'=>1]]]);
    check(inventory_balance($db,$bean)===$beanBefore-10&&(int)$db->query("SELECT COUNT(*) FROM dbo.inventory_movements WHERE inventory_item_id=$milk")->fetchColumn()===$milkMovementCount,'new orders deduct only the surviving recipe ingredients');
    check(pos_submit($db,$actor,$posInput)['replayed']&&(int)$db->query("SELECT COUNT(*) FROM dbo.inventory_movements WHERE inventory_item_id=$milk")->fetchColumn()===$milkMovementCount,'historical payment retries still work after removing stock');
    $replacement=mutate(['action'=>'save_item','name'=>$name,'category'=>'Other','unit'=>'ml','current'=>'0','reorder'=>'0','note'=>'']);
    check((int)$replacement['item_id']!==$milk,'the cafe can add a new active item with a previously removed name');
    for($i=0;$i<51;$i++)mutate(['action'=>'movement','id'=>$bean,'type'=>'restock','quantity'=>'0.001','note'=>'Pagination test']);
    $snapshot=inventory_snapshot($db);$older=inventory_snapshot($db,50);
    check(count($snapshot['movements'])===50&&$snapshot['nextOffset']===50&&count(array_intersect(array_column($snapshot['movements'],'id'),array_column($older['movements'],'id')))===0,'movement history paginates without duplicate records');
    echo "$checks inventory SQL checks passed.\n";
} finally {if($db->inTransaction())$db->rollBack();echo "All inventory fixtures and changes rolled back.\n";}
check((int)$db->query('SELECT COUNT(*) FROM dbo.inventory_movements')->fetchColumn()===$before,'no test stock movements remain in the database');
