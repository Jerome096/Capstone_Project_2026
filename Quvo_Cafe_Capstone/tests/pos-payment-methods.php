<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../config/database.php';require_once __DIR__.'/../includes/pos.php';require_once __DIR__.'/../includes/menu.php';require_once __DIR__.'/../includes/reports.php';
$checks=0;function pos_method_check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException($label);$checks++;echo "PASS: $label\n";}
function pos_method_key():string{return bin2hex(random_bytes(4)).'-1234-4234-8234-123456789012';}
function pos_method_reject(callable $callback,string $label):void{try{$callback();}catch(OrderError $error){pos_method_check($error->status===422,$label);return;}throw new RuntimeException('Unexpected acceptance: '.$label);}
$db=quvo_db();$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local rollback test database required.');
$db->beginTransaction();try{
 $actor=(int)$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name)='admin'")->fetchColumn();$who=['staff_id'=>$actor,'role'=>'admin'];$tag=bin2hex(random_bytes(5));
 $label='Bank <POS> '.$tag;$code=payment_add_method($db,$actor,$label);$methods=payment_pos_methods($db);$found=array_values(array_filter($methods,fn($method)=>$method['code']===$code));
 pos_method_check($methods[0]===['code'=>'Cash','label'=>'Cash'],'Cash is always the first POS payment choice');
 pos_method_check(count($found)===1&&$found[0]['label']===$label,'configured custom method exposes its name and internal code');
 pos_method_check(count($found[0])===2,'POS method list exposes no QR image or version metadata');
 pos_method_check(!$db->query("SELECT COUNT(*) FROM dbo.payment_qr_codes WHERE payment_method='$code'")->fetchColumn(),'new custom method has no QR upload');
 $menu=menu_save($db,['name'=>'Custom method POS '.$tag,'category'=>'food','price'=>'50.00','available'=>true,'optionGroups'=>[]]);
 $request=['submission_key'=>pos_method_key(),'customer_name'=>'Payment method rollback','expected_total'=>'50.00','payment_method'=>$code,'amount_received'=>'50.00','payment_reference'=>'REF-'.$tag,'items'=>[['menu_id'=>$menu['id'],'quantity'=>1,'custom_options'=>[],'custom_options_version'=>$menu['optionVersion']]]];
 $date=sales_business_date($db);$reportBefore=reports_daily($db,$date);$previewBefore=sales_preview($db);$historyBefore=sales_history($db)['summary'];
 $result=pos_submit($db,$who,$request);$id=(int)$result['order']['order_id'];$order=$result['order'];
 pos_method_check(!$result['replayed']&&$order['order_source']==='walk_in'&&$order['order_status']==='preparing','custom digital POS payment creates a paid preparing walk-in order');
 pos_method_check($order['payment_method']===$code&&$order['preferred_payment_method']===$code,'payment and saved order retain the same configured method code');
 pos_method_check($order['payment_method_label']===$label&&$order['preferred_payment_label']===$label,'order and receipt APIs expose the configured display name');
 pos_method_check($order['payment_reference']==='REF-'.$tag&&$order['amount_received']==='50.00'&&$order['change_amount']==='0.00','custom digital payment stores reference and exact amount with zero change');
 pos_method_check(pos_submit($db,$who,$request)['replayed'],'same-key custom-method retry returns its saved payment');
 $invalid=$request;$invalid['submission_key']=pos_method_key();$invalid['payment_method']='Forged';pos_method_reject(fn()=>pos_submit($db,$who,$invalid),'unknown methods cannot create payments');
 $invalid=$request;$invalid['submission_key']=pos_method_key();$invalid['amount_received']='49.99';pos_method_reject(fn()=>pos_submit($db,$who,$invalid),'custom methods still require the full digital payment');
 $invalid=$request;$invalid['submission_key']=pos_method_key();$invalid['amount_received']='60.00';pos_method_reject(fn()=>pos_submit($db,$who,$invalid),'custom methods cannot be used to manufacture cash change');
 payment_remove_qr($db,$code);$second=$request;$second['submission_key']=pos_method_key();$second['payment_reference']='';$secondOrder=pos_submit($db,$who,$second)['order'];$secondId=(int)$secondOrder['order_id'];
 pos_method_check($secondOrder['payment_status']==='paid','removing or omitting the QR image does not disable the POS method');
 pos_method_check($secondOrder['payment_reference']===null,'digital reference remains optional');
 $report=reports_daily($db,$date);$details=array_values(array_filter($report['paymentDetails'],fn($method)=>$method['code']===$code));
 pos_method_check(count($details)===1&&$details[0]['label']===$label&&$details[0]['orders']===2&&$details[0]['revenue']==='100.00','Reports lists custom method name, paid orders and revenue');
 pos_method_check(orders_cents($report['summary']['totalRevenue'])===orders_cents($reportBefore['summary']['totalRevenue'])+10000,'custom payments contribute once to total revenue');
 pos_method_check(orders_cents($report['breakdown'][1]['values']['Other'])===orders_cents($reportBefore['breakdown'][1]['values']['Other'])+10000,'existing Other digital report group includes custom POS amounts');
 pos_method_check(orders_cents(sales_preview($db)['otherSales'])===orders_cents($previewBefore['otherSales'])+10000,'EOD preview includes custom POS payments under Other digital');
 pos_method_check(orders_cents(sales_history($db)['summary']['today'])===orders_cents($historyBefore['today'])+10000,'Sales history totals include custom POS payments');
 payment_remove_method($db,$actor,$code);
 pos_method_check(!in_array($code,array_column(payment_pos_methods($db),'code'),true),'deactivated methods disappear from new checkout choices');
 pos_method_check(pos_submit($db,$who,$request)['replayed'],'deactivation never blocks recovery of an already accepted identical payment');
 $after=orders_get($db,$id);pos_method_check($after['payment_method_label']===$label&&$after['payment_reference']==='REF-'.$tag,'old receipts keep their method name and reference after removal');
 $fresh=$request;$fresh['submission_key']=pos_method_key();pos_method_reject(fn()=>pos_submit($db,$who,$fresh),'a removed method cannot be used for a new walk-in payment');
 $report=reports_daily($db,$date);pos_method_check(array_values(array_filter($report['paymentDetails'],fn($method)=>$method['code']===$code))[0]['label']===$label,'Reports keeps removed method names for historical totals');
 foreach([$id,$secondId] as $served){orders_status($db,$actor,$served,'ready');orders_status($db,$actor,$served,'served');}
 $q=$db->prepare("INSERT dbo.eod_closures(closed_by_staff_id,note,business_date) OUTPUT INSERTED.closure_id VALUES(?,'Custom POS rollback',?)");$q->execute([$actor,$date]);$closure=(int)$q->fetchColumn();$q->closeCursor();
 $db->prepare("INSERT dbo.eod_sales_orders(order_id,closure_id,amount,payment_method,order_status,entry_type) SELECT order_id,?,amount_applied,payment_method,'served','payment' FROM dbo.payments WHERE order_id IN (?,?)")->execute([$closure,$id,$secondId]);
 $record=sales_record($db,$closure);pos_method_check($record['otherSales']==='100.00'&&$record['totalSales']==='100.00','saved EOD and sales-history records retain custom method amounts');
 pos_method_check(orders_cents(sales_history($db)['summary']['today'])===orders_cents($historyBefore['today'])+10000,'closing preserves approved-payment totals without double counting');
 echo "$checks custom POS payment SQL checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();echo "Custom payment method, POS, report and EOD fixtures rolled back.\n";}
