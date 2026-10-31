<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/online.php';
$db=quvo_db();
$target=$db->query("SELECT DB_NAME() name,CONVERT(nvarchar(128),SERVERPROPERTY('MachineName')) machine")->fetch();
if($target['name']!=='QuvoCafeDB'||strcasecmp($target['machine'],getenv('COMPUTERNAME')?:'')!==0)throw new RuntimeException('Local test database required.');
$checks=0;
function otp_check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException('FAIL: '.$label);$checks++;echo "PASS: $label\n";}
function otp_reject(callable $fn,int $status,string $label):void{try{$fn();}catch(OrderError $error){otp_check($error->status===$status,$label);return;}throw new RuntimeException('Accepted: '.$label);}
$db->beginTransaction();
try{
 $db->exec(file_get_contents(__DIR__.'/../database/25_registration_email_otp.sql'));
 $tag=bin2hex(random_bytes(6));$email="otp-$tag@example.invalid";$ip='fixture-'.$tag;
 $input=['name'=>'OTP sample <customer>','email'=>strtoupper($email),'contact'=>'09123456789','password'=>'Temporary-only-123'];
 $_SESSION=[];$sent=[];$send=function($to,$code)use(&$sent){$sent[]=['email'=>$to,'code'=>$code];};
 $pending=online_registration_begin($db,$input,$ip,$send);$row=registration_row($db);
 otp_check(count($sent)===1&&$sent[0]['email']===$email&&preg_match('/^[0-9]{6}$/',$sent[0]['code'])===1,'code sent to normalized email');
 otp_check($pending['expires_in']>=599&&$pending['resend_after']>=59&&!isset($pending['code'],$pending['password_hash'],$pending['token_hash']),'public response has timers without secrets');
 $q=$db->prepare('SELECT COUNT(*) FROM dbo.customer_accounts WHERE email=?');$q->execute([$email]);otp_check((int)$q->fetchColumn()===0,'requesting code does not create or activate account');$q->closeCursor();
 otp_check($row['password_hash']!==$input['password']&&password_verify($input['password'],$row['password_hash']),'pending password is hashed');
 otp_check($row['code_hash']!==$sent[0]['code']&&$row['token_hash']!==$_SESSION['registration_token'],'SQL stores code and session-token digests');
 $firstToken=$_SESSION['registration_token'];$firstCode=$sent[0]['code'];
 $_SESSION=[];otp_check(online_registration_status($db)===null,'another browser cannot retrieve challenge');
 otp_reject(fn()=>online_registration_verify($db,$firstCode),410,'another browser cannot verify code');
 otp_reject(fn()=>online_registration_begin($db,$input,$ip,$send),429,'clearing cookies does not bypass resend cooldown');
 $_SESSION['registration_token']=$firstToken;
 otp_reject(fn()=>online_registration_resend($db,$ip,$send),429,'immediate resend is denied');
 otp_reject(fn()=>online_registration_verify($db,'abcdef'),422,'non-numeric code rejected');
 $wrong=$firstCode==='000000'?'000001':'000000';
 for($n=1;$n<=5;$n++)otp_reject(fn()=>online_registration_verify($db,$wrong),$n===5?429:422,"incorrect attempt $n is rejected");
 otp_check((int)registration_row($db)['attempts']===5,'failed verification attempts persist after errors');
 otp_reject(fn()=>online_registration_verify($db,$firstCode),429,'correct code cannot bypass exhausted attempts');
 $ageRates=function()use($db,$email,$ip){foreach([hash('sha256','email:'.$email),hash('sha256','ip:'.$ip)]as$key)$db->prepare('UPDATE dbo.customer_registration_limits SET last_sent_at=DATEADD(second,-61,SYSUTCDATETIME()) WHERE rate_key=?')->execute([$key]);};
 $ageRates();$db->prepare('UPDATE dbo.customer_registration_codes SET last_sent_at=DATEADD(second,-61,SYSUTCDATETIME()) WHERE token_hash=?')->execute([hash('sha256',$firstToken)]);
 online_registration_resend($db,$ip,$send);$newCode=$sent[1]['code'];
 otp_check(count($sent)===2&&(int)registration_row($db)['attempts']===0,'resend resets attempts and sends new code');
 if($newCode!==$firstCode)otp_reject(fn()=>online_registration_verify($db,$firstCode),422,'previous code becomes invalid after resend');
 $db->prepare('UPDATE dbo.customer_registration_codes SET expires_at=DATEADD(second,-1,SYSUTCDATETIME()) WHERE token_hash=?')->execute([hash('sha256',$firstToken)]);
 otp_reject(fn()=>online_registration_verify($db,$newCode),422,'expired code cannot create account');
 $db->prepare('UPDATE dbo.customer_registration_codes SET expires_at=DATEADD(minute,10,SYSUTCDATETIME()) WHERE token_hash=?')->execute([hash('sha256',$firstToken)]);
 $account=online_registration_verify($db,$newCode);
 otp_check($account['email']===$email&&$account['email_verified_at']!==null,'successful verification creates verified account');
 otp_check(password_verify($input['password'],$account['password_hash']),'verified account keeps original password hash');
 otp_check(online_registration_status($db)===null&&!isset($_SESSION['registration_token']),'successful verification consumes challenge');
 otp_reject(fn()=>online_registration_verify($db,$newCode),410,'used code cannot create another account');
 otp_check(online_login($db,['email'=>$email,'password'=>$input['password']])['customer_account_id']===$account['customer_account_id'],'verified customer can sign in normally');
 $ageRates();otp_reject(fn()=>online_registration_begin($db,$input,$ip,$send),409,'existing customer is directed to sign in');
 $legacy=online_register($db,[...$input,'email'=>"legacy-$tag@example.invalid"]);
 otp_check($legacy['email_verified_at']===null&&online_login($db,['email'=>$legacy['email'],'password'=>$input['password']])['customer_account_id']===$legacy['customer_account_id'],'existing unverified accounts can still sign in');
 // Email/IP limits apply even when a challenge or browser session changes.
 $limitEmail="limit-$tag@example.invalid";$limitIp='limit-'.$tag;
 for($i=0;$i<5;$i++){
   $_SESSION=[];
   $db->prepare('UPDATE dbo.customer_registration_limits SET last_sent_at=DATEADD(second,-61,SYSUTCDATETIME()) WHERE rate_key=?')->execute([hash('sha256','email:'.$limitEmail)]);
   online_registration_begin($db,[...$input,'email'=>$limitEmail],$limitIp,$send);
 }
 $db->prepare('UPDATE dbo.customer_registration_limits SET last_sent_at=DATEADD(second,-61,SYSUTCDATETIME()) WHERE rate_key=?')->execute([hash('sha256','email:'.$limitEmail)]);
 $_SESSION=[];otp_reject(fn()=>online_registration_begin($db,[...$input,'email'=>$limitEmail],$limitIp,$send),429,'sixth code in one hour is blocked across sessions');
 $rateKey=hash('sha256','ip:'.$limitIp);$db->prepare('UPDATE dbo.customer_registration_limits SET send_count=20 WHERE rate_key=?')->execute([$rateKey]);
 otp_reject(fn()=>online_registration_begin($db,[...$input,'email'=>"ip-$tag@example.invalid"],$limitIp,$send),429,'IP limit blocks changing recipient addresses');
 $_SESSION=[];$failEmail="failure-$tag@example.invalid";
 otp_reject(fn()=>online_registration_begin($db,[...$input,'email'=>$failEmail],'failure-'.$tag,fn()=>throw new OrderError('Test mail failure',503)),503,'mail delivery failure is reported');
 otp_check(!isset($_SESSION['registration_token']),'undelivered initial code is invalidated');
 otp_reject(fn()=>online_registration_begin($db,[...$input,'email'=>$failEmail],'failure-'.$tag,$send),429,'mail delivery failure still consumes send cooldown');
 $_SESSION=[];$resendEmail="resend-$tag@example.invalid";$resendIp='resend-'.$tag;
 online_registration_begin($db,[...$input,'email'=>$resendEmail],$resendIp,$send);$resendCode=$sent[array_key_last($sent)]['code'];
 foreach(['email:'.$resendEmail,'ip:'.$resendIp] as $key)$db->prepare('UPDATE dbo.customer_registration_limits SET last_sent_at=DATEADD(second,-61,SYSUTCDATETIME()) WHERE rate_key=?')->execute([hash('sha256',$key)]);
 otp_reject(fn()=>online_registration_resend($db,$resendIp,fn()=>throw new OrderError('Test mail failure',503)),503,'failed resend is reported without creating account');
 otp_check((int)registration_row($db)['expires_in']<=0,'undelivered replacement code is expired');
 otp_reject(fn()=>online_registration_verify($db,$resendCode),422,'old code cannot survive a failed replacement send');
 $db->prepare('UPDATE dbo.customer_registration_codes SET created_at=DATEADD(hour,-2,SYSUTCDATETIME()) WHERE token_hash=?')->execute([registration_token_hash()]);
 otp_check(online_registration_status($db)===null,'hour-old registration cannot be restored');
 otp_reject(fn()=>online_registration_resend($db,$resendIp,$send),410,'hour-old registration must restart');
 $_SESSION['registration_token']=$firstToken; // already consumed
 otp_check(online_registration_status($db)===null,'removed challenge cannot be restored');
 echo "$checks registration OTP checks passed.\n";
}finally{if($db->inTransaction())$db->rollBack();$_SESSION=[];echo "All fixtures and schema additions rolled back. No email sent.\n";}
