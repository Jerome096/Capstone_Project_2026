<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/online.php';
require_once __DIR__.'/../includes/pos.php';
require_once __DIR__.'/ordering-fixture.php';
$checks=0;
function verify_upload(bool $ok,string $message):void{global $checks;if(!$ok)throw new RuntimeException('FAIL: '.$message);$checks++;echo 'PASS: '.$message."\n";}
function reject_upload(callable $callback,int $status,string $message):void{try{$callback();}catch(OrderError $error){verify_upload($error->status===$status,$message);return;}throw new RuntimeException('Accepted invalid input: '.$message);}
function upload_key():string{$hex=bin2hex(random_bytes(16));return substr($hex,0,8).'-'.substr($hex,8,4).'-'.substr($hex,12,4).'-'.substr($hex,16,4).'-'.substr($hex,20);}
function upload_order(string $name,string $uploadedAt):int{
    global $db,$customerId,$menuId,$menuVersion,$qrVersion,$png;
    $saved=online_submit($db,$customerId,['submission_key'=>upload_key(),'expected_total'=>'15.25','fulfillment'=>'pickup','payment_method'=>'GCash','payment_qr_version'=>$qrVersion,'receipt_image'=>'data:image/png;base64,'.base64_encode($png),'items'=>[['itemId'=>$menuId,'quantity'=>1,'customization'=>['optionsVersion'=>$menuVersion,'options'=>[]]]]]);
    $id=(int)$saved['order']['order_id'];
    $db->prepare('UPDATE dbo.orders SET customer_name=? WHERE order_id=?')->execute([$name,$id]);
    $db->prepare('UPDATE dbo.online_payment_receipts SET uploaded_at=? WHERE order_id=?')->execute([$uploadedAt,$id]);
    return $id;
}
function upload_paid(int $id,string $paidAt,bool $served=false):void{
    global $db,$actorId;
    orders_pay($db,$actorId,$id,['payment_method'=>'GCash','amount_received'=>'15.25']);
    if($served){orders_status($db,$actorId,$id,'ready');orders_status($db,$actorId,$id,'served');}
    $db->prepare('UPDATE dbo.payments SET paid_at=? WHERE order_id=?')->execute([$paidAt,$id]);
}
$db=quvo_db();$before=(int)$db->query('SELECT COUNT(*) FROM dbo.online_payment_receipts')->fetchColumn();
try{
    $db->beginTransaction();ordering_test_open($db);$tag=bin2hex(random_bytes(6));
    $actorId=(int)$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name)='admin' ORDER BY s.staff_id")->fetchColumn();
    verify_upload($actorId>0,'test admin exists');
    $account=online_register($db,['name'=>'Upload test '.$tag,'email'=>'uploads-'.$tag.'@example.invalid','contact'=>'09123456789','address'=>'Test address','password'=>'Uploaded-Receipts-Test-123']);$customerId=(int)$account['customer_account_id'];
    $q=$db->prepare("INSERT dbo.menu_items(item_name,category,price,is_available,option_groups_json) OUTPUT INSERTED.menu_item_id VALUES(?,'coffee',15.25,1,N'[]')");$q->execute(['Receipt test '.$tag]);$menuId=(int)$q->fetchColumn();$q->closeCursor();
    $menuVersion=menu_rows($db,$menuId)[0]['optionVersion'];
    $png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5kAAAAASUVORK5CYII=');
    payment_qr_save($db,$actorId,'GCash',payment_image($png));$qrVersion=payment_qr_methods($db)['GCash']['version'];
    $pending=upload_order('Pending %_[<safe>] '.$tag,'2099-03-09T16:00:00');
    $paid=upload_order('Approved '.$tag,'2099-03-08T10:00:00');upload_paid($paid,'2099-03-10T02:00:00');
    $served=upload_order('Served '.$tag,'2099-03-08T11:00:00');upload_paid($served,'2099-03-10T03:00:00',true);
    $cancelled=upload_order('Canceled '.$tag,'2099-03-09T14:00:00');
    orders_cancel($db,['staff_id'=>$actorId,'role'=>'admin'],$cancelled,'Customer canceled <safe>');
    $db->prepare("UPDATE dbo.orders SET cancelled_at='2099-03-10T15:59:59' WHERE order_id=?")->execute([$cancelled]);
    $previous=upload_order('Previous '.$tag,'2099-03-09T15:59:59');
    $next=upload_order('Next '.$tag,'2099-03-10T16:00:00');
    $all=payment_receipt_records($db,'2099-03-10');$ids=array_column($all['uploads'],'order_id');
    verify_upload(count($ids)===4&&in_array((string)$pending,$ids,true)&&in_array((string)$paid,$ids,true)&&in_array((string)$served,$ids,true)&&in_array((string)$cancelled,$ids,true),'history includes pending, paid, served and canceled uploads');
    verify_upload(!in_array((string)$previous,$ids,true)&&!in_array((string)$next,$ids,true),'date filter respects Philippine midnight boundaries');
    verify_upload($ids[0]===(string)$cancelled,'history sorts by latest operation time');
    $byId=array_column($all['uploads'],null,'order_id');
    verify_upload($byId[$pending]['date_basis']==='upload'&&$byId[$pending]['record_date']==='2099-03-10','pending upload uses its upload date');
    verify_upload($byId[$paid]['date_basis']==='payment'&&$byId[$paid]['record_date']==='2099-03-10','paid upload uses its payment confirmation date');
    verify_upload($byId[$cancelled]['date_basis']==='cancellation'&&$byId[$cancelled]['record_date']==='2099-03-10','canceled upload uses the cancellation date');
    verify_upload($byId[$cancelled]['cancelled_at']!==null&&$byId[$cancelled]['uploaded_at']!==null&&$byId[$cancelled]['cancellation_reason']==='Customer canceled <safe>','upload and cancellation timestamps and reason remain available');
    verify_upload($byId[$paid]['paid_at']!==null&&$byId[$paid]['payment_method']==='GCash'&&$byId[$paid]['total_amount']==='15.25','history retains payment method, order total and approval time');
    foreach(['pending'=>$pending,'paid'=>$paid,'served'=>$served,'cancelled'=>$cancelled] as $filter=>$id){$rows=payment_receipt_records($db,'2099-03-10',$filter)['uploads'];verify_upload(count($rows)===1&&$rows[0]['order_id']===(string)$id,$filter.' filter returns the expected uploaded receipt');}
    verify_upload(count(payment_receipt_records($db,'2099-03-10','all',0,'Approved '.$tag)['uploads'])===1,'search finds customer names');
    verify_upload(count(payment_receipt_records($db,'2099-03-10','all',0,$byId[$pending]['order_number'])['uploads'])===1,'search finds order numbers');
    verify_upload(count(payment_receipt_records($db,'2099-03-10','all',0,'gcash')['uploads'])===4,'search finds payment methods without case sensitivity');
    foreach(['%','_','['] as $literal)verify_upload(count(payment_receipt_records($db,'2099-03-10','all',0,$literal)['uploads'])===1,'search treats '.$literal.' as literal text');
    verify_upload(payment_receipt_records($db,'2099-03-10','all',0,"' OR 1=1 --")['uploads']===[],'search text cannot change the SQL query');
    foreach($all['uploads'] as $row)verify_upload(!array_intersect(['image_bytes','image_hex','image_hash','password_hash'],array_keys($row)),'list metadata excludes image bytes and credentials for '.$row['order_number']);
    verify_upload(hex2bin(payment_receipt_image($db,$cancelled)['image_hex'])===$png,'staff can retrieve the original image after cancellation');
    reject_upload(fn()=>payment_receipt_image($db,$cancelled,$customerId+1000000),404,'another customer cannot retrieve the saved upload');
    $walkIn=pos_submit($db,['staff_id'=>$actorId,'role'=>'admin'],['submission_key'=>upload_key(),'expected_total'=>'15.25','payment_method'=>'Cash','amount_received'=>'20.00','items'=>[['menu_id'=>$menuId,'quantity'=>1,'custom_options'=>[],'custom_options_version'=>$menuVersion]]]);
    $walkInId=(int)$walkIn['order']['order_id'];$db->prepare("UPDATE dbo.payments SET paid_at='2099-03-10T02:00:00' WHERE order_id=?")->execute([$walkInId]);
    verify_upload(!in_array((string)$walkInId,array_column(payment_receipt_records($db,'2099-03-10')['uploads'],'order_id'),true),'generated walk-in receipts are excluded from customer uploads');
    verify_upload(payment_receipt_records($db,'2099-03-07')['uploads']===[],'an empty operation date returns an empty upload list');
    foreach(['bad date','2099-02-30','2099-3-10'] as $date)reject_upload(fn()=>payment_receipt_records($db,$date),422,'invalid upload date '.$date.' is rejected');
    reject_upload(fn()=>payment_receipt_records($db,'2099-03-10','invalid'),422,'invalid upload status is rejected');
    reject_upload(fn()=>payment_receipt_records($db,'2099-03-10','all',-1),422,'negative pagination offset is rejected');
    reject_upload(fn()=>payment_receipt_records($db,'2099-03-10','all',1000001),422,'excessive pagination offset is rejected');
    reject_upload(fn()=>payment_receipt_records($db,'2099-03-10','all',0,str_repeat('a',101)),422,'overlong upload search is rejected');
    for($i=0;$i<52;$i++)upload_order('Pagination '.$tag.' '.$i,'2099-04-01T02:00:00');
    $page1=payment_receipt_records($db,'2099-04-01');$page2=payment_receipt_records($db,'2099-04-01','all',$page1['next_offset']);
    verify_upload(count($page1['uploads'])===50&&$page1['next_offset']===50,'upload history paginates at fifty records');
    verify_upload(count($page2['uploads'])===2&&$page2['next_offset']===null,'final upload page has the remaining records');
    verify_upload(array_intersect(array_column($page1['uploads'],'order_id'),array_column($page2['uploads'],'order_id'))===[],'upload pages do not duplicate records');
    verify_upload(count(payment_receipt_records($db,'2099-04-01','all',0,'Pagination '.$tag.' 51')['uploads'])===1,'search can find an upload beyond the first unfiltered page');
    echo "$checks uploaded receipt SQL checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "All uploaded receipt, order, payment and account fixtures rolled back.\n";}
verify_upload((int)$db->query('SELECT COUNT(*) FROM dbo.online_payment_receipts')->fetchColumn()===$before,'no test customer uploads remain in the database');
