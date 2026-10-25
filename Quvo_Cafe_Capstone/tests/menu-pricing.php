<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../includes/menu.php';
require_once __DIR__.'/../includes/pos.php';
require_once __DIR__.'/../includes/online.php';
require_once __DIR__.'/ordering-fixture.php';
$checks=0;
function pricing_check(bool $value,string $label):void{global $checks;if(!$value)throw new RuntimeException($label);$checks++;echo 'PASS: '.$label."\n";}
function pricing_reject(callable $fn,int $status,string $label):void{try{$fn();}catch(OrderError $error){pricing_check($error->status===$status,$label);return;}throw new RuntimeException('Accepted invalid pricing: '.$label);}
$groups=[['id'=>'milk','label'=>'Milk','type'=>'radio','required'=>false,'default'=>'','pricing'=>'extra','choices'=>[['id'=>'none','label'=>'No milk','price'=>'0.00'],['id'=>'oat','label'=>'Oat milk','price'=>'20.10']]],['id'=>'size','label'=>'Size','type'=>'select','required'=>true,'default'=>'small','pricing'=>'size','choices'=>[['id'=>'small','label'=>'Small','price'=>'150.00'],['id'=>'large','label'=>'Large','price'=>'180.20']]],['id'=>'shot','label'=>'Extra shot','type'=>'select','required'=>false,'default'=>'','pricing'=>'extra','choices'=>[['id'=>'none','label'=>'None','price'=>'0.00'],['id'=>'shot','label'=>'Add shot','price'=>'0.20']]]];
$clean=menu_validate_groups($groups);pricing_check($clean[0]['choices'][1]['price']==='20.10'&&$clean[1]['pricing']==='size','Extra and size prices are validated and normalized');
foreach(['-1','1.001','1e2','NaN','999999999','']as$badPrice){$bad=$groups;$bad[0]['choices'][1]['price']=$badPrice;pricing_reject(fn()=>menu_validate_groups($bad),422,'Reject invalid charge '.$badPrice);}
$bad=$groups;unset($bad[1]['choices'][0]['price']);pricing_reject(fn()=>menu_validate_groups($bad),422,'Size price cannot be omitted');
$bad=$groups;$bad[]=[...$groups[1],'id'=>'second-size','label'=>'Another size'];pricing_reject(fn()=>menu_validate_groups($bad),422,'Only one group can replace the base item price');
$bad=$groups;$bad[0]['pricing']='included';pricing_reject(fn()=>menu_validate_groups($bad),422,'A hidden positive price on an included choice is rejected');
$db=quvo_db();$db->beginTransaction();
try{
 $actor=ordering_test_open($db)['actor'];$tag=bin2hex(random_bytes(6));
 $base=['name'=>'Pricing test '.$tag,'category'=>'coffee','price'=>'140.00','available'=>true];
 $item=menu_save($db,$base+['optionGroups'=>$groups]);$id=$item['id'];
 pricing_check($item['optionGroups'][1]['choices'][1]['price']==='180.20','Prices persist in the existing JSON catalog');
 $selections=['size'=>'large','milk'=>'oat','shot'=>'shot'];
 $custom=['options'=>$selections,'optionsVersion'=>$item['optionVersion'],'notes'=>'No straw','pricing'=>['unitPrice'=>'0.01']];
 $inputLine=['itemId'=>(string)$id,'quantity'=>2,'customization'=>$custom];
 $lines=orders_lines([$inputLine,['itemId'=>(string)$id,'quantity'=>1,'customization'=>['options'=>['size'=>'small'],'optionsVersion'=>$item['optionVersion']]]]);
 [$catalog,$total]=orders_catalog($db,$lines,55100);
 pricing_check($total===55100&&$lines[0]['unit_price']==='200.50'&&$lines[1]['unit_price']==='150.00','Two sizes of the same product retain distinct unit prices');
 pricing_check($lines[0]['customization']['pricing']['unitPrice']==='200.50','Client-provided pricing cannot override trusted prices');
 pricing_check($lines[0]['customization']['options'][0]['price']==='20.10','Charge amount is stored with the choice label');
 $low=orders_lines([$inputLine]);pricing_reject(fn()=>orders_catalog($db,$low,28000),409,'Base-only total cannot bypass size and add-on charges');
 $missing=orders_lines([['itemId'=>$id,'quantity'=>1,'customization'=>['options'=>[],'optionsVersion'=>$item['optionVersion']]]]);pricing_reject(fn()=>orders_catalog($db,$missing,14000),409,'Required size remains mandatory');
 $forged=orders_lines([['itemId'=>$id,'quantity'=>1,'customization'=>['options'=>['size'=>'not-a-size'],'optionsVersion'=>$item['optionVersion']]]]);pricing_reject(fn()=>orders_catalog($db,$forged,14000),409,'Unknown size is rejected');
 $q=$db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT INSERTED.table_id VALUES(?,'Pricing table','indoor')");$q->execute(['pr-'.$tag]);$table=(int)$q->fetchColumn();$q->closeCursor();
 [$visit,$token]=dining_guest_request($db,$table,'Pricing guest',null);dining_change_session($db,$actor['staff_id'],(int)$visit['session_id'],'approve');
 $dine=['submission_key'=>ordering_test_uuid(),'expected_total'=>'401.00','items'=>[$inputLine]];
 $order=orders_submit($db,$table,$token,$dine)['order'];
 pricing_check($order['total_amount']==='401.00'&&$order['items'][0]['unit_price']==='200.50','Dine-in stores and returns the final configured price');
 $pos=['submission_key'=>ordering_test_uuid(),'customer_name'=>'Pricing guest','expected_total'=>'401.00','payment_method'=>'Cash','amount_received'=>'500.00','items'=>[['menu_id'=>$id,'quantity'=>2,'custom_options'=>$selections,'custom_options_version'=>$item['optionVersion'],'notes'=>'No straw']]];
 $paid=pos_submit($db,$actor,$pos)['order'];
 pricing_check($paid['items'][0]['unit_price']==='200.50'&&$paid['change_amount']==='99.00','POS payment and change use the configured item price');
 $account=online_register($db,['name'=>'Pricing guest','email'=>'pricing-'.$tag.'@example.invalid','contact'=>'09123456789','address'=>'Test address','password'=>'Temporary-pricing-test-123']);
 $png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5kAAAAASUVORK5CYII=');payment_qr_save($db,$actor['staff_id'],'GCash',payment_image($png));
 $online=['submission_key'=>ordering_test_uuid(),'expected_total'=>'401.00','fulfillment'=>'pickup','payment_method'=>'GCash','payment_qr_version'=>payment_qr_methods($db)['GCash']['version'],'receipt_image'=>'data:image/png;base64,'.base64_encode($png),'items'=>[$inputLine]];
 $saved=online_submit($db,(int)$account['customer_account_id'],$online)['order'];
 pricing_check($saved['total_amount']==='401.00'&&$saved['items'][0]['unit_price']==='200.50','Online checkout saves matching final prices and payment proof');
 pricing_reject(fn()=>menu_save($db,$base+['id'=>$id,'optionGroups'=>[]]),409,'Old admin tabs cannot silently erase configured prices');
 $updated=$groups;$updated[0]['choices'][1]['price']='25.10';
 $fresh=menu_save($db,$base+['id'=>$id,'optionGroups'=>$updated,'optionVersion'=>$item['optionVersion']]);
 pricing_check($fresh['optionVersion']!==$item['optionVersion'],'Changing a charge invalidates old menu selections');
 pricing_reject(fn()=>menu_save($db,$base+['id'=>$id,'optionGroups'=>$groups,'optionVersion'=>$item['optionVersion']]),409,'Concurrent stale admin price edit is rejected');
 $stale=orders_lines([$inputLine]);pricing_reject(fn()=>orders_catalog($db,$stale,40100),409,'Old cart choices require price review after an admin change');
 pricing_check(orders_get($db,(int)$paid['order_id'])['items'][0]['unit_price']==='200.50','Existing paid order keeps its original unit price');
 pricing_check(orders_get($db,(int)$paid['order_id'])['items'][0]['customization']['pricing']['extrasTotal']==='20.30','Existing order keeps its original charge breakdown');
 pricing_check(pos_submit($db,$actor,$pos)['replayed']&&orders_submit($db,$table,$token,$dine)['replayed']&&online_submit($db,(int)$account['customer_account_id'],$online)['replayed'],'Retries in all channels return the original order after price edits');
 $none=menu_save($db,$base+['id'=>$id,'optionGroups'=>[],'optionVersion'=>$fresh['optionVersion']]);pricing_check($none['optionGroups']===[],'Current admin can intentionally remove priced options');
 echo "$checks pricing checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "All pricing, menu, visit, order, payment and account fixtures rolled back.\n";}
