<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/menu.php';
require_once __DIR__.'/../includes/online.php';
require_once __DIR__.'/../includes/pos.php';
require_once __DIR__.'/../includes/kitchen.php';
require_once __DIR__.'/ordering-fixture.php';
$checks=0;
function category_check(bool $ok,string $label):void {global $checks;if(!$ok)throw new RuntimeException($label);$checks++;echo "PASS: $label\n";}
$db=quvo_db();$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local test database required.');
$db->beginTransaction();
try {
    $identity=ordering_test_open($db);$actor=$identity['actor'];$tag=bin2hex(random_bytes(5));
    $q=$db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT INSERTED.table_id VALUES(?,N'Category rollback table','indoor')");$q->execute(['cat-'.$tag]);$table=(int)$q->fetchColumn();$q->closeCursor();
    $token=bin2hex(random_bytes(32));$q=$db->prepare("INSERT dbo.customer_sessions(table_id,guest_name,guest_token_hash,status) OUTPUT INSERTED.session_id VALUES(?,N'Category rollback guest',CONVERT(binary(32),?,2),'active')");$q->execute([$table,hash('sha256',$token)]);$q->fetchColumn();$q->closeCursor();
    $legacy=[];foreach(['coffee','food','pastry'] as $category)$legacy[$category]=menu_save($db,['name'=>'Legacy '.$tag.' '.$category,'category'=>$category,'price'=>'10.00','available'=>true]);
    $oldRequest=['submission_key'=>ordering_test_uuid(),'expected_total'=>'10.00','items'=>[['itemId'=>$legacy['coffee']['id'],'quantity'=>1]]];
    $oldOrder=orders_submit($db,$table,$token,$oldRequest)['order'];$oldBefore=orders_get($db,(int)$oldOrder['order_id']);
    $sql=file_get_contents(__DIR__.'/../database/22_menu_categories.sql');$db->exec($sql);
    foreach(['coffee'=>'cold-coffee','food'=>'appetizer','pastry'=>'appetizer'] as $old=>$new)category_check(menu_rows($db,$legacy[$old]['id'])[0]['category']===$new,"migration maps $old to $new");
    category_check(orders_get($db,(int)$oldOrder['order_id'])===$oldBefore,'migration preserves every saved order field and historical category');
    category_check(orders_submit($db,$table,$token,$oldRequest)['replayed'],'accepted retry survives category migration');
    $db->exec($sql);category_check(menu_rows($db,$legacy['coffee']['id'])[0]['category']==='cold-coffee','migration can run again safely');
    $account=online_register($db,['name'=>'Category test','email'=>'category-'.$tag.'@example.invalid','contact'=>'09123456789','address'=>'Test address','password'=>'Rollback-only-123']);$customer=(int)$account['customer_account_id'];
    $png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5kAAAAASUVORK5CYII=');payment_qr_save($db,(int)$actor['staff_id'],'GCash',payment_image($png));$version=payment_qr_methods($db)['GCash']['version'];
    foreach(QUVO_MENU_CATEGORIES as $category){
        $item=menu_save($db,['name'=>'Category '.$tag.' '.$category,'category'=>$category,'price'=>'10.00','available'=>true,'optionGroups'=>[]]);
        category_check($item['category']===$category,"admin saves $category");
        $item=menu_save($db,['id'=>$item['id'],'name'=>$item['name'].' edited','category'=>$category,'price'=>'12.00','available'=>true]);
        category_check($item['price']===12.0,"admin edits $category without losing its category");
        $catalog=array_values(array_filter(online_menu($db),fn($row)=>(int)$row['id']===$item['id']));
        category_check(count($catalog)===1&&$catalog[0]['category']===$category,"online catalog publishes $category");
        $base=['items'=>[['itemId'=>$item['id'],'quantity'=>1,'customization'=>['options'=>[],'optionsVersion'=>$item['optionVersion']]]],'expected_total'=>'12.00'];
        $dine=orders_submit($db,$table,$token,['submission_key'=>ordering_test_uuid()]+$base)['order'];
        category_check($dine['items'][0]['category']===$category,"dine-in order snapshots $category");
        $online=online_submit($db,$customer,['submission_key'=>ordering_test_uuid(),'fulfillment'=>'pickup','payment_method'=>'GCash','payment_qr_version'=>$version,'receipt_image'=>'data:image/png;base64,'.base64_encode($png)]+$base)['order'];
        category_check($online['items'][0]['category']===$category,"online checkout accepts $category");
        $pos=pos_submit($db,$actor,['submission_key'=>ordering_test_uuid(),'customer_name'=>'Category walk-in','items'=>[['menu_id'=>$item['id'],'quantity'=>1,'custom_options'=>[],'custom_options_version'=>$item['optionVersion']]],'expected_total'=>'12.00','payment_method'=>'Cash','amount_received'=>'12.00'])['order'];
        category_check($pos['items'][0]['category']===$category,"POS payment and receipt retain $category");
        if(menu_category_is_drink($category)){
            category_check(menu_default_groups($category)!==[]&& !in_array($category,KITCHEN_FOOD_CATEGORIES,true),"$category remains with drinks preparation");
            try{kitchen_get($db,(int)$pos['order_id']);throw new RuntimeException('Drink routed to kitchen');}catch(OrderError $error){category_check($error->status===404,"kitchen excludes $category drinks");}
        }else{
            $ticket=kitchen_get($db,(int)$pos['order_id']);
            category_check(count($ticket['items'])===1&&$ticket['items'][0]['category']===$category,"kitchen receives $category");
            category_check(in_array($pos['order_id'],array_column(kitchen_list($db)['orders'],'order_id'),true),"kitchen queue lists $category");
        }
    }
    try{menu_save($db,['name'=>'Invalid category','category'=>'made-up','price'=>'1.00','available'=>true]);throw new RuntimeException('Invalid category accepted');}catch(OrderError $error){category_check($error->status===422,'server rejects categories outside the supported list');}
    echo "Completed $checks category checks; all fixtures and migration effects are rolled back.\n";
}finally{if($db->inTransaction())$db->rollBack();}
