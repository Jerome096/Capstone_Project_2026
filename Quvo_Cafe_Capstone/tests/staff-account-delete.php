<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/auth.php';
require_once __DIR__.'/../includes/accounts.php';
$db=quvo_db();$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local test database required.');
quvo_start_session();$checks=[];
function account_check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException($label);$checks[]=$label;}
function account_reject(callable $fn,string $label):void{try{$fn();}catch(AccountInputError){account_check(true,$label);return;}throw new RuntimeException('Unexpected acceptance: '.$label);}
$db->beginTransaction();
try{
 $admin=(int)$db->query("SELECT MIN(s.staff_id) FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE r.role_name='Admin' AND s.is_active=1")->fetchColumn();
 $actor=['staff_id'=>$admin,'role'=>'admin'];$tag=bin2hex(random_bytes(6));
 foreach(['active','inactive'] as $state){
  account_change($db,$actor,['action'=>'create','full_name'=>'Delete test '.$state,'username'=>'del_'.$state.'_'.$tag,'password'=>'Temporary test password!','password_confirm'=>'Temporary test password!']);
 }
 $rows=$db->query("SELECT staff_id,username,password_hash FROM dbo.staff_users WHERE username LIKE 'del_%_$tag'")->fetchAll();
 $staff=[];foreach($rows as $row)$staff[str_contains($row['username'],'inactive')?'inactive':'active']=$row;
 $id=(int)$staff['active']['staff_id'];$inactive=(int)$staff['inactive']['staff_id'];
 account_change($db,$actor,['action'=>'status','staff_id'=>$inactive,'active'=>false]);
 account_reject(fn()=>account_change($db,$actor,['action'=>'delete','staff_id'=>$admin]),'admin cannot delete own account');
 $other=(int)$db->query("SELECT MIN(role_id) FROM dbo.roles WHERE role_name='Admin'")->fetchColumn();
 $q=$db->prepare("INSERT dbo.staff_users(role_id,full_name,username,password_hash) OUTPUT INSERTED.staff_id VALUES(?,N'Protected admin',?,?)");$q->execute([$other,'protected_'.$tag,password_hash('Temporary password!',PASSWORD_DEFAULT)]);$otherId=(int)$q->fetchColumn();$q->closeCursor();
 account_reject(fn()=>account_change($db,$actor,['action'=>'delete','staff_id'=>$otherId]),'another admin cannot be deleted through staff actions');
 account_reject(fn()=>account_change($db,['staff_id'=>$id,'role'=>'staff'],['action'=>'delete','staff_id'=>$inactive]),'staff cannot delete accounts');
 account_reject(fn()=>account_change($db,$actor,['action'=>'delete','staff_id'=>-1]),'invalid IDs rejected');
 $q=$db->prepare("INSERT dbo.orders(customer_name,submission_key,submission_hash,total_amount,order_status,order_source,pos_staff_id) OUTPUT INSERTED.order_id VALUES(N'Deletion history fixture',NEWID(),CONVERT(binary(32),?,2),1,'preparing','walk_in',?)");$q->execute([hash('sha256',$tag),$id]);$order=(int)$q->fetchColumn();$q->closeCursor();
 $db->exec("INSERT dbo.payments(order_id,payment_method,amount_applied,amount_received,change_amount,received_by_staff_id) VALUES($order,'Cash',1,1,0,$id)");
 $history=$db->query("SELECT * FROM dbo.payments WHERE order_id=$order")->fetch();
 $_SESSION['staff_id']=$id;$_SESSION['last_activity']=time();$_SESSION['credential_stamp']=hash('sha256',$staff['active']['password_hash']);
 account_check(quvo_current_user()!==null,'active staff session works before deletion');
 account_change($db,$actor,['action'=>'delete','staff_id'=>$id]);
 account_check(quvo_current_user()===null,'existing session rejected after deletion');
 account_check($history===$db->query("SELECT * FROM dbo.payments WHERE order_id=$order")->fetch(),'past payment is unchanged');
 account_check((int)$db->query("SELECT pos_staff_id FROM dbo.orders WHERE order_id=$order")->fetchColumn()===$id,'past order retains staff reference');
 account_check((int)$db->query("SELECT is_active FROM dbo.staff_users WHERE staff_id=$id")->fetchColumn()===0,'deleted account cannot sign in');
 account_check(!in_array($id,array_column(account_list($db),'staff_id')),'deleted account removed from list');
 account_reject(fn()=>account_change($db,$actor,['action'=>'status','staff_id'=>$id,'active'=>true]),'deleted account cannot be reactivated');
 account_reject(fn()=>account_change($db,$actor,['action'=>'update','staff_id'=>$id]),'deleted account cannot be edited');
 $repeated=account_change($db,$actor,['action'=>'delete','staff_id'=>$id]);
 account_check($repeated['deleted_staff_id']===$id,'repeat deletion of an inactive deleted account confirms success');
 account_change($db,$actor,['action'=>'delete','staff_id'=>$inactive]);
 account_check(!in_array($inactive,array_column(account_list($db),'staff_id')),'inactive staff can also be deleted');
 $q=$db->prepare("SELECT COUNT(*) FROM dbo.system_audit_log WHERE action='staff_account_deleted' AND actor_staff_id=? AND entity_key IN (?,?)");$q->execute([$admin,(string)$id,(string)$inactive]);
 account_check((int)$q->fetchColumn()===2,'each deletion records its admin actor');$q->closeCursor();
}finally{if($db->inTransaction())$db->rollBack();$_SESSION=[];}
echo json_encode(['passed'=>count($checks),'checks'=>$checks,'fixturesRolledBack'=>true],JSON_PRETTY_PRINT),"\n";
