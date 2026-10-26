<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__.'/../includes/online.php';
require_once __DIR__.'/../includes/pos.php';
require_once __DIR__.'/ordering-fixture.php';
$checks=0;
function limit_check(bool $ok,string $label):void {
    global $checks; if(!$ok)throw new RuntimeException($label); $checks++; echo "PASS: $label\n";
}
function limit_reject(callable $fn,string $label):void {
    try {$fn();} catch(OrderError $error) {
        limit_check($error->status===422 && $error->errorCode==='item_quantity_limit',$label); return;
    }
    throw new RuntimeException('Unexpected acceptance: '.$label);
}
$db=quvo_db();
$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local test database required.');
$db->beginTransaction();
try {
    $identity=ordering_test_open($db);$actor=(int)$identity['actor']['staff_id'];$tag=bin2hex(random_bytes(6));
    $q=$db->prepare("INSERT dbo.cafe_tables(table_code,table_name,area) OUTPUT INSERTED.table_id VALUES(?,N'Quantity rollback test','indoor')");
    $q->execute(['limit-'.$tag]);$table=(int)$q->fetchColumn();$q->closeCursor();
    $token=bin2hex(random_bytes(32));
    $q=$db->prepare("INSERT dbo.customer_sessions(table_id,guest_name,guest_token_hash,status) OUTPUT INSERTED.session_id VALUES(?,N'Quantity rollback guest',CONVERT(binary(32),?,2),'active')");
    $q->execute([$table,hash('sha256',$token)]);$q->fetchColumn();$q->closeCursor();
    $q=$db->prepare("INSERT dbo.menu_items(item_name,category,price,is_available) OUTPUT INSERTED.menu_item_id VALUES(?,'food',10,1)");
    $ids=[];foreach(['A','B'] as $name){$q->execute(['Limit '.$tag.$name]);$ids[]=(int)$q->fetchColumn();$q->closeCursor();}
    $account=online_register($db,['name'=>'Quantity test','email'=>'limit-'.$tag.'@example.invalid','contact'=>'09123456789','address'=>'Test address','password'=>'Rollback-only-123']);
    $customer=(int)$account['customer_account_id'];
    $png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5kAAAAASUVORK5CYII=');
    payment_qr_save($db,$actor,'GCash',payment_image($png));$version=payment_qr_methods($db)['GCash']['version'];
    $base=['expected_total'=>'100.00','items'=>[['itemId'=>$ids[0],'quantity'=>10]]];
    $digital=['fulfillment'=>'pickup','payment_method'=>'GCash','payment_qr_version'=>$version,'receipt_image'=>'data:image/png;base64,'.base64_encode($png)];
    foreach(['dine_in','online'] as $source) {
        $submit=fn($request)=>$source==='online'?online_submit($db,$customer,$request+$digital):orders_submit($db,$table,$token,$request);
        $before=(int)$db->query('SELECT COUNT(*) FROM dbo.orders')->fetchColumn();
        limit_reject(fn()=>$submit(['submission_key'=>ordering_test_uuid(),'items'=>[['itemId'=>$ids[0],'quantity'=>11]],'expected_total'=>'110.00']),"$source rejects eleven on one line");
        limit_reject(fn()=>$submit(['submission_key'=>ordering_test_uuid(),'items'=>[['itemId'=>(string)$ids[0],'quantity'=>6,'customization'=>['notes'=>'Size A']],['itemId'=>$ids[0],'quantity'=>5,'customization'=>['notes'=>'Size B']]],'expected_total'=>'110.00']),"$source aggregates repeated lines with different options/notes");
        limit_check((int)$db->query('SELECT COUNT(*) FROM dbo.orders')->fetchColumn()===$before,"$source rejects before inserting an order");
        $request=['submission_key'=>ordering_test_uuid()]+$base;$accepted=$submit($request);
        limit_check($accepted['order']['items'][0]['quantity']===10,"$source accepts ten and retains quantity");
        limit_check($submit($request)['replayed'],"$source safely replays an accepted request");
        $split=['submission_key'=>ordering_test_uuid(),'items'=>[['itemId'=>$ids[0],'quantity'=>6],['itemId'=>$ids[0],'quantity'=>4],['itemId'=>$ids[1],'quantity'=>10]],'expected_total'=>'200.00'];
        limit_check(count($submit($split)['order']['items'])===3,"$source permits ten across variants and ten of another item");
        // Simulate an order accepted before this limit, retaining its original hash.
        $legacy=['submission_key'=>ordering_test_uuid(),'items'=>[['itemId'=>$ids[0],'quantity'=>100]],'expected_total'=>'1000.00']+$digital;
        $lines=orders_lines($legacy['items']);$expected=orders_cents($legacy['expected_total']);
        $hashParts=$source==='online'?[$lines,$expected,'pickup','GCash',null,null]:[$lines,$expected];
        if($source==='online')$hashParts[]=[$version,payment_receipt_input($legacy['receipt_image'])['hash']];
        $hash=hash('sha256',json_encode($hashParts,JSON_THROW_ON_ERROR));
        $db->prepare('UPDATE dbo.orders SET submission_hash=CONVERT(binary(32),?,2),submission_key=? WHERE order_id=?')->execute([$hash,$legacy['submission_key'],$accepted['order']['order_id']]);
        limit_check($submit($legacy)['replayed'],"$source recovers a previously accepted oversized order without duplicating it");
    }
    // POS is intentionally outside the two customer ordering channels.
    $pos=pos_submit($db,$identity['actor'],['submission_key'=>ordering_test_uuid(),'customer_name'=>'Walk-in quantity fixture','items'=>[['menu_id'=>$ids[0],'quantity'=>11]],'expected_total'=>'110.00','payment_method'=>'Cash','amount_received'=>'110.00']);
    limit_check($pos['order']['items'][0]['quantity']===11,'walk-in POS retains its existing quantity rules');
    echo "Completed $checks checks; every fixture is rolled back.\n";
} finally { if($db->inTransaction())$db->rollBack(); }
