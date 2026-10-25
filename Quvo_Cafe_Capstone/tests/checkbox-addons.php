<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../includes/menu.php';
require_once __DIR__.'/../includes/pos.php';
require_once __DIR__.'/../includes/online.php';
require_once __DIR__.'/ordering-fixture.php';
$checks=0;
function addons_check(bool $value,string $label):void{global $checks;if(!$value)throw new RuntimeException($label);$checks++;echo 'PASS: '.$label."\n";}
function addons_reject(callable $fn,int $status,string $label):void{try{$fn();}catch(OrderError $error){addons_check($error->status===$status,$label);return;}throw new RuntimeException('Accepted invalid add-ons: '.$label);}
$groups=[['id'=>'sizes','label'=>'Size','type'=>'select','required'=>true,'default'=>'regular','pricing'=>'size','choices'=>[['id'=>'regular','label'=>'Regular','price'=>'150.00'],['id'=>'large','label'=>'Large','price'=>'180.00']]],['id'=>'addons','label'=>'Add-ons','type'=>'checkbox','required'=>false,'default'=>'','pricing'=>'extra','choices'=>[['id'=>'shot','label'=>'Extra shot','price'=>'25.10'],['id'=>'cream','label'=>'Cream','price'=>'10.20'],['id'=>'free','label'=>'Free topping','price'=>'0.00']]]];
addons_check(menu_validate_groups($groups)[1]['type']==='checkbox','Checkbox groups support multiple priced choices');
$bad=$groups;$bad[0]['type']='checkbox';addons_reject(fn()=>menu_validate_groups($bad),422,'Checkboxes cannot select multiple size prices');
addons_reject(fn()=>menu_selection_input(['addons'=>['shot','shot']]),422,'Duplicate add-ons are rejected');
addons_reject(fn()=>menu_selection_input(['addons'=>[['shot']]]),422,'Nested selections are rejected');
addons_reject(fn()=>menu_selection_input(['addons'=>array_fill(0,21,'shot')]),422,'Too many checkbox selections are rejected');
addons_check(menu_selection_input(['addons'=>['shot','cream']])===menu_selection_input(['addons'=>['cream','shot']]),'Checkbox order is normalized for duplicate-safe retries');
$db=quvo_db();$db->beginTransaction();
try{
 $actor=ordering_test_open($db)['actor'];$tag=bin2hex(random_bytes(6));$base=['name'=>'Checkbox test '.$tag,'category'=>'coffee','price'=>'119.99','available'=>true];
 $item=menu_save($db,$base+['optionGroups'=>$groups]);$id=$item['id'];
 $selected=['sizes'=>'large','addons'=>['shot','cream']];
 $custom=['options'=>$selected,'optionsVersion'=>$item['optionVersion'],'notes'=>'No straw'];
 $line=['itemId'=>(string)$id,'quantity'=>2,'customization'=>$custom];
 $lines=orders_lines([$line]);[$catalog,$total]=orders_catalog($db,$lines,43060);
 addons_check($total===43060&&$lines[0]['unit_price']==='215.30','A full size price and multiple add-ons are added in centavos');
 addons_check(count($lines[0]['customization']['options'])===3,'Each selected add-on gets an immutable snapshot');
 addons_check($lines[0]['customization']['pricing']['extrasTotal']==='35.30','The snapshot records the sum of all add-on charges');
 $empty=orders_lines([['itemId'=>$id,'quantity'=>1,'customization'=>['options'=>['sizes'=>'regular','addons'=>[]],'optionsVersion'=>$item['optionVersion']]]]);orders_catalog($db,$empty,15000);
 addons_check($empty[0]['unit_price']==='150.00','Optional unchecked add-ons do not change the size price');
 $free=orders_lines([['itemId'=>$id,'quantity'=>1,'customization'=>['options'=>['sizes'=>'regular','addons'=>['free']],'optionsVersion'=>$item['optionVersion']]]]);orders_catalog($db,$free,15000);addons_check($free[0]['unit_price']==='150.00','A free selected add-on costs zero');
 foreach([['addons'=>'shot','sizes'=>'large'],['addons'=>['unknown'],'sizes'=>'large'],['addons'=>['shot'],'sizes'=>['regular','large']]]as$invalid){$badLines=orders_lines([['itemId'=>$id,'quantity'=>1,'customization'=>['options'=>$invalid,'optionsVersion'=>$item['optionVersion']]]]);addons_reject(fn()=>orders_catalog($db,$badLines,18000),409,'Wrong selection shape or unknown choice is rejected');}
 $row=['item_name'=>'Required add-ons','price'=>'119.99','category'=>'coffee','option_groups_json'=>json_encode([$groups[0],[...$groups[1],'required'=>true]])];
 addons_reject(fn()=>menu_selected_customization($row,['optionsVersion'=>menu_options_version($row),'options'=>['sizes'=>'regular','addons'=>[]]]),409,'Required checkbox group needs at least one selection');
 $required=menu_selected_customization($row,['optionsVersion'=>menu_options_version($row),'options'=>['sizes'=>'regular','addons'=>['free']]]);addons_check($required['pricing']['unitPrice']==='150.00','One free add-on satisfies a required checkbox group');
 $q=$db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT INSERTED.table_id VALUES(?,'Add-on test','indoor')");$q->execute(['ad-'.$tag]);$table=(int)$q->fetchColumn();$q->closeCursor();[$visit,$token]=dining_guest_request($db,$table,'Add-on test',null);dining_change_session($db,$actor['staff_id'],(int)$visit['session_id'],'approve');
 $dine=['submission_key'=>ordering_test_uuid(),'expected_total'=>'430.60','items'=>[$line]];$order=orders_submit($db,$table,$token,$dine)['order'];addons_check($order['items'][0]['unit_price']==='215.30'&&$order['total_amount']==='430.60','Dine-in persists the final price for both selected add-ons');
 $pos=['submission_key'=>ordering_test_uuid(),'customer_name'=>'Add-on test','expected_total'=>'430.60','payment_method'=>'Cash','amount_received'=>'500.00','items'=>[['menu_id'=>$id,'quantity'=>2,'custom_options'=>$selected,'custom_options_version'=>$item['optionVersion']]]];$paid=pos_submit($db,$actor,$pos)['order'];addons_check($paid['change_amount']==='69.40'&&count($paid['items'][0]['customization']['options'])===3,'POS payment and preparation snapshot include every selected add-on');
 $account=online_register($db,['name'=>'Add-on test','email'=>'addons-'.$tag.'@example.invalid','contact'=>'09123456789','address'=>'Test address','password'=>'Temporary-addons-test-123']);$png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5kAAAAASUVORK5CYII=');payment_qr_save($db,$actor['staff_id'],'GCash',payment_image($png));
 $online=['submission_key'=>ordering_test_uuid(),'expected_total'=>'430.60','fulfillment'=>'pickup','payment_method'=>'GCash','payment_qr_version'=>payment_qr_methods($db)['GCash']['version'],'receipt_image'=>'data:image/png;base64,'.base64_encode($png),'items'=>[$line]];$saved=online_submit($db,(int)$account['customer_account_id'],$online)['order'];addons_check($saved['total_amount']==='430.60'&&count($saved['items'][0]['customization']['options'])===3,'Online checkout saves all add-ons and the matching total');
 $dine['items'][0]['customization']['options']['addons']=['cream','shot'];$pos['items'][0]['custom_options']['addons']=['cream','shot'];$online['items'][0]['customization']['options']['addons']=['cream','shot'];
 addons_check(orders_submit($db,$table,$token,$dine)['replayed']&&pos_submit($db,$actor,$pos)['replayed']&&online_submit($db,(int)$account['customer_account_id'],$online)['replayed'],'Changing checkbox order cannot create or charge a duplicate order');
 $changed=$groups;$changed[1]['choices'][0]['price']='50.00';menu_save($db,$base+['id'=>$id,'optionGroups'=>$changed,'optionVersion'=>$item['optionVersion']]);addons_check(orders_get($db,(int)$paid['order_id'])['items'][0]['unit_price']==='215.30','Later add-on edits preserve existing order prices');
 $current=menu_rows($db,$id)[0];$single=$changed;$single[1]['type']='select';
 addons_reject(fn()=>menu_save($db,$base+['id'=>$id,'optionGroups'=>$single,'optionVersion'=>$current['optionVersion']]),409,'Older admin clients cannot silently convert multiple add-ons to a dropdown');
 $converted=menu_save($db,$base+['id'=>$id,'optionGroups'=>$single,'optionVersion'=>$current['optionVersion'],'checkboxOptionsSupported'=>true]);addons_check($converted['optionGroups'][1]['type']==='select','Updated admin can deliberately change the control type');
 $freeGroup=[['id'=>'free-addons','label'=>'Free add-ons','type'=>'checkbox','required'=>false,'default'=>'','choices'=>[['id'=>'napkin','label'=>'Napkin']]]];$freeItem=menu_save($db,$base+['optionGroups'=>$freeGroup]);
 addons_reject(fn()=>menu_save($db,$base+['id'=>$freeItem['id'],'optionGroups'=>$freeGroup]),409,'Free checkbox choices also require the current catalog version when edited');
 echo "$checks checkbox add-on checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "All checkbox, menu, order, payment and account fixtures rolled back.\n";}
