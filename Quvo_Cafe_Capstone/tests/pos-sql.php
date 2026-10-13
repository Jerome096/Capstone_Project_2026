<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/pos.php';require_once __DIR__.'/../config/database.php';
$checks=0;function check(bool $value,string $label):void{global $checks;if(!$value)throw new RuntimeException('FAIL: '.$label);$checks++;echo "PASS: $label\n";}
function rejected(callable $fn,int $status,string $label):void{try{$fn();}catch(OrderError $error){check($error->status===$status,$label);return;}throw new RuntimeException('FAIL: accepted '.$label);}
$db=quvo_db();$before=$db->query('SELECT COUNT(*) FROM dbo.customer_sessions')->fetchColumn();
try{
 $db->beginTransaction();$tag=bin2hex(random_bytes(6));$actor=['staff_id'=>(int)$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name) IN ('admin','staff') ORDER BY s.staff_id")->fetchColumn(),'role'=>'staff'];
 $q=$db->prepare("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(?,'coffee',15.25,1)");$q->execute(['POS test '.$tag]);$menuId=(int)$q->fetchColumn();$q->closeCursor();
 $input=['submission_key'=>'aaaaaaaa-1111-4111-8111-111111111111','customer_name'=>'Walk-in <test>','expected_total'=>'30.50','payment_method'=>'Cash','amount_received'=>'50.00','items'=>[['menu_id'=>$menuId,'quantity'=>2,'notes'=>'No straw','drink_options'=>['size'=>'Large','sugar'=>'50% sugar','ice'=>'Extra ice']]]];
 rejected(fn()=>pos_submit($db,[...$actor,'role'=>'barista'],$input),403,'cashier permission required');
 rejected(fn()=>pos_submit($db,$actor,[...$input,'amount_received'=>'20.00']),422,'partial cash rejected');
 rejected(fn()=>pos_submit($db,$actor,[...$input,'expected_total'=>'1.00']),409,'forged total rejected');
 rejected(fn()=>pos_submit($db,$actor,[...$input,'items'=>[['menu_id'=>$menuId,'quantity'=>1.5]]]),422,'fractional quantities rejected');
 rejected(fn()=>pos_submit($db,$actor,[...$input,'submission_key'=>'bad']),422,'invalid retry key rejected');
 $saved=pos_submit($db,$actor,$input);$id=(int)$saved['order']['order_id'];$order=$saved['order'];
 check($order['order_source']==='walk_in'&&$order['session_id']===null&&$order['customer_account_id']===null,'POS order needs no customer account or dining session');
 check($order['table_name']==='Counter'&&$order['order_status']==='preparing'&&$order['payment_status']==='paid','POS saves directly to paid preparing queue');
 check($order['change_amount']==='19.50'&&$order['amount_received']==='50.00','exact payment and change saved');
 check($order['items'][0]['item_name']==='POS test '.$tag&&$order['items'][0]['category']==='coffee','SQL catalog supplies saved name/category');
 check($order['items'][0]['customization']['size']==='Large'&&$order['items'][0]['customization']['iceLevel']==='Extra ice','existing POS drink choices retained');
 check($order['items'][0]['notes']==='No straw','item notes retained');
 check($db->query("SELECT pos_staff_id FROM dbo.orders WHERE order_id=$id")->fetchColumn()==$actor['staff_id'],'cashier ownership saved');
 check(pos_submit($db,$actor,$input)['replayed'],'identical retry restores saved order');
 check((int)$db->query("SELECT COUNT(*) FROM dbo.payments WHERE order_id=$id")->fetchColumn()===1,'retry creates no duplicate payment');
 rejected(fn()=>pos_submit($db,$actor,[...$input,'customer_name'=>'Different customer']),409,'changed retry cannot create another order');
 $db->prepare('UPDATE dbo.menu_items SET is_available=0 WHERE menu_item_id=?')->execute([$menuId]);check(pos_submit($db,$actor,$input)['replayed'],'accepted retry survives menu changes');
 rejected(fn()=>pos_submit($db,$actor,[...$input,'submission_key'=>'bbbbbbbb-1111-4111-8111-111111111111']),409,'new POS order rejects unavailable items');
 $db->prepare('UPDATE dbo.menu_items SET is_available=1 WHERE menu_item_id=?')->execute([$menuId]);
 orders_status($db,$actor['staff_id'],$id,'ready');orders_status($db,$actor['staff_id'],$id,'served');check(orders_get($db,$id)['order_status']==='served','SQL cashier ready/served workflow works');
 check(pos_submit($db,$actor,$input)['replayed'],'retry after serving preserves original order');
 $digital=pos_submit($db,$actor,[...$input,'submission_key'=>'cccccccc-1111-4111-8111-111111111111','payment_method'=>'GCash','amount_received'=>'30.50','payment_reference'=>'POS-TEST-REF']);check($digital['order']['payment_reference']==='POS-TEST-REF'&&$digital['order']['change_amount']==='0.00','digital payment/reference saved');
 rejected(fn()=>pos_submit($db,$actor,[...$input,'submission_key'=>'dddddddd-1111-4111-8111-111111111111','payment_method'=>'GCash','amount_received'=>'50.00']),422,'digital payment must match exact total');
 check(in_array((string)$id,array_column(orders_list($db,null,'all',0,$order['receipt_date'])['orders'],'order_id'),true),'POS order appears in operation-date receipts');
 check($db->query('SELECT COUNT(*) FROM dbo.customer_sessions')->fetchColumn()===$before,'dine-in sessions unchanged');echo "$checks POS SQL checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "All temporary POS rows rolled back.\n";}
