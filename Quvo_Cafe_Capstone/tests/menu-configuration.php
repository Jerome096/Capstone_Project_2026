<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../includes/menu.php';
require_once __DIR__.'/../includes/pos.php';
require_once __DIR__.'/../includes/online.php';
$checks=0;
function verify_menu(bool $condition,string $message):void{global $checks;if(!$condition)throw new RuntimeException($message);$checks++;echo 'PASS: '.$message."\n";}
function reject_menu(callable $callback,int $status,string $message):void{try{$callback();}catch(OrderError $error){verify_menu($error->status===$status,$message);return;}throw new RuntimeException('Accepted invalid input: '.$message);}
$groups=[['id'=>'milk','label'=>'Milk','type'=>'radio','required'=>true,'default'=>'','choices'=>[['id'=>'none','label'=>'No milk'],['id'=>'oat','label'=>'Oat milk']]],['id'=>'temperature','label'=>'Temperature','type'=>'select','required'=>false,'default'=>'','choices'=>[['id'=>'hot','label'=>'Hot'],['id'=>'iced','label'=>'Iced']]]];
verify_menu(menu_validate_groups($groups)===$groups,'radio and dropdown groups retain their order and choices');
reject_menu(fn()=>menu_validate_groups([...[...$groups],$groups[0]]),422,'duplicate group IDs rejected');
$bad=$groups;$bad[0]['type']='html';reject_menu(fn()=>menu_validate_groups($bad),422,'unsupported control rejected');
$bad=$groups;$bad[0]['default']='missing';reject_menu(fn()=>menu_validate_groups($bad),422,'missing default choice rejected');
$bad=$groups;$bad[0]['choices'][]=$bad[0]['choices'][0];reject_menu(fn()=>menu_validate_groups($bad),422,'duplicate choice IDs rejected');
reject_menu(fn()=>menu_image_input('data:image/jpeg;base64,'.base64_encode('<?php phpinfo(); ?>')),422,'non-image bytes rejected');
verify_menu(count(menu_default_groups('coffee'))===2&&menu_default_groups('food')===[],'legacy drinks retain defaults and foods have no unwanted drink options');
$photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6UAAAAABJRU5ErkJggg==';
$db=quvo_db();$db->beginTransaction();
try{
    $staff=(int)$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name) IN ('admin','staff') ORDER BY s.staff_id")->fetchColumn();
    $item=menu_save($db,['name'=>'Menu configuration test '.bin2hex(random_bytes(4)),'category'=>'coffee','price'=>'150.00','available'=>true,'optionGroups'=>$groups,'image'=>$photo]);$id=$item['id'];
    verify_menu($item['optionGroups']===$groups&&$item['customOptionsConfigured'],'saved settings returned by admin catalog');
    verify_menu(is_string($item['imageUrl'])&&str_contains($item['imageUrl'],'version='),'saved photo has a versioned URL');
    $image=$db->query('SELECT image_mime,DATALENGTH(image_bytes) bytes FROM dbo.menu_item_images WHERE menu_item_id='.$id)->fetch();
    verify_menu($image['image_mime']==='image/png'&&(int)$image['bytes']>0,'photo bytes and validated MIME persist in SQL');
    $online=array_values(array_filter(online_menu($db),fn($row)=>(int)$row['id']===$id))[0];
    verify_menu($online['optionGroups']===$groups&&str_starts_with($online['imageUrl'],'api/index.php?view=menu-image&'),'customer catalog exposes the photo and option definitions');
    $base=['id'=>$id,'name'=>$item['name'],'category'=>'coffee','price'=>'150.00','available'=>true];
    $saved=menu_save($db,$base);verify_menu($saved['imageUrl']===$item['imageUrl']&&$saved['optionGroups']===$groups,'unrelated edits preserve the image and groups');
    $saved=menu_save($db,$base+['image'=>$photo]);verify_menu($saved['imageUrl']!==$item['imageUrl'],'replacing the image changes its cache version');
    $line=orders_lines([['itemId'=>(string)$id,'quantity'=>1,'customization'=>['optionsVersion'=>$item['optionVersion'],'options'=>['milk'=>'oat','temperature'=>'hot'],'optionLabels'=>[['label'=>'Forged','value'=>'Fake']],'notes'=>'No straw']]]);
    [$catalog,$total]=orders_catalog($db,$line,15000);
    verify_menu($total===15000&&$line[0]['customization']['options'][0]['label']==='Milk'&&$line[0]['customization']['options'][0]['value']==='Oat milk','server resolves selected IDs to trusted catalog labels and unchanged price');
    $missing=orders_lines([['itemId'=>(string)$id,'quantity'=>1,'customization'=>['optionsVersion'=>$item['optionVersion'],'options'=>[]]]]);reject_menu(fn()=>orders_catalog($db,$missing,15000),409,'required selection enforced on the server');
    $invalid=orders_lines([['itemId'=>(string)$id,'quantity'=>1,'customization'=>['optionsVersion'=>$item['optionVersion'],'options'=>['milk'=>'made-up']]]]);reject_menu(fn()=>orders_catalog($db,$invalid,15000),409,'forged or removed choice rejected');
    $unknown=orders_lines([['itemId'=>(string)$id,'quantity'=>1,'customization'=>['optionsVersion'=>$item['optionVersion'],'options'=>['milk'=>'oat','unknown'=>'x']]]]);reject_menu(fn()=>orders_catalog($db,$unknown,15000),409,'unknown groups rejected');
    $input=['submission_key'=>bin2hex(random_bytes(4)).'-1234-4234-8234-123456789012','customer_name'=>'Menu options test','expected_total'=>'150.00','payment_method'=>'Cash','amount_received'=>'200.00','items'=>[['menu_id'=>$id,'quantity'=>1,'drink_options'=>null,'custom_options'=>['milk'=>'oat','temperature'=>'hot'],'custom_options_version'=>$item['optionVersion'],'notes'=>'No straw']]];
    $result=pos_submit($db,['role'=>'staff','staff_id'=>$staff],$input);$orderId=$result['order']['order_id'];$snapshot=$result['order']['items'][0]['customization']['options'];
    verify_menu($snapshot[0]['value']==='Oat milk'&&$snapshot[1]['value']==='Hot','selected options persist in the immutable order snapshot');
    $groups[0]['label']='Milk preference';$groups[0]['choices'][1]['label']='Oat beverage';menu_save($db,$base+['optionGroups'=>$groups]);
    verify_menu(orders_get($db,(int)$orderId)['items'][0]['customization']['options']===$snapshot,'later menu edits preserve existing preparation instructions');
    $replayed=pos_submit($db,['role'=>'staff','staff_id'=>$staff],$input);verify_menu($replayed['replayed']&&$replayed['order']['order_id']===$orderId,'same-key retry does not charge again after menu edits');
    $stale=orders_lines([['itemId'=>(string)$id,'quantity'=>1,'customization'=>['optionsVersion'=>$item['optionVersion'],'options'=>['milk'=>'oat']]]]);
    reject_menu(fn()=>orders_catalog($db,$stale,15000),409,'renamed choices require customers to review the updated menu');
    $fresh=menu_rows($db,$id)[0];$reviewed=orders_lines([['itemId'=>(string)$id,'quantity'=>1,'customization'=>['optionsVersion'=>$fresh['optionVersion'],'options'=>['milk'=>'oat']]]]);orders_catalog($db,$reviewed,15000);
    verify_menu($reviewed[0]['customization']['options'][0]['value']==='Oat beverage','reviewed choices use the new catalog snapshot');
    menu_save($db,$base+['image'=>null,'optionGroups'=>[]]);$empty=menu_rows($db,$id)[0];verify_menu($empty['imageUrl']===null&&$empty['optionGroups']===[],'photo and all options can be removed explicitly');
    echo "$checks menu photo and option checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "Menu, image, order, payment and stock fixtures rolled back.\n";}
