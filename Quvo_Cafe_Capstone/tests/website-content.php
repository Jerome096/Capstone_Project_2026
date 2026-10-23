<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/website-content.php';
require_once __DIR__.'/../config/database.php';
$db=quvo_db();$checks=0;
$check=function(bool $condition,string $message)use(&$checks):void{if(!$condition)throw new RuntimeException($message);$checks++;};
$reject=function(callable $action,int $status)use($check):void{try{$action();throw new RuntimeException('Expected a rejected content update.');}catch(OrderError $error){$check($error->status===$status,'Expected HTTP '.$status);}};
$before=website_content_read($db);
try{
    $check(!$before['setupRequired'],'Website content schema must be installed.');
    $defaults=website_content_defaults();
    $check($defaults['address']===''&&$defaults['hours']===''&&$defaults['phone']===''&&$defaults['email']===''&&$defaults['social']==='','Do not invent cafe location or contacts.');
    $sample=$defaults+[];$sample['headline']='  Café 你好 ☕  ';$sample['story']="First paragraph.\r\n\r\n<strong>Keep as text.</strong>";$sample['address']="Test building\nTest town";$sample['hours']="Mon–Sun: test hours";$sample['email']='cafe@example.invalid';$sample['social']='https://example.invalid/quvo';
    $clean=website_content_validate($sample);
    $check($clean['headline']==='Café 你好 ☕','Headlines support Unicode and trim whitespace.');
    $check(str_contains($clean['story'],"\n\n"),'Story paragraphs normalize line breaks.');
    $check(str_contains($clean['story'],'<strong>'),'Content is plain text, not silently rewritten.');
    foreach(website_content_limits()as$field=>$limit){$invalid=$sample;$invalid[$field]=str_repeat('a',$limit+1);$reject(fn()=>website_content_validate($invalid),422);}
    foreach([[],null,'text',true]as$invalid)$reject(fn()=>website_content_validate($invalid),422);
    foreach(['javascript:alert(1)','data:text/html,hello','file:///C:/test','https://name:secret@example.invalid/']as$url){$invalid=$sample;$invalid['social']=$url;$reject(fn()=>website_content_validate($invalid),422);}
    foreach(['bad email','x@','hello@example.invalid\nBCC:x']as$email){$invalid=$sample;$invalid['email']=$email;$reject(fn()=>website_content_validate($invalid),422);}
    foreach(['headline','intro','story','address']as$field){$invalid=$sample;$invalid[$field]=['invalid'];$reject(fn()=>website_content_validate($invalid),422);}
    $invalid=$sample;$invalid['headline']='  ';$reject(fn()=>website_content_validate($invalid),422);
    $invalid=$sample;$invalid['story']="bad\0text";$reject(fn()=>website_content_validate($invalid),422);
    foreach(['staff','kitchen','barista','customer','']as$role)$reject(fn()=>website_content_actor(['role'=>$role]),403);
    $check(website_content_validate($sample+['password_hash'=>'never-public'])===$clean,'Unknown metadata is not part of website content.');
    $adminId=$db->query("SELECT TOP 1 s.staff_id FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE LOWER(r.role_name)='admin' AND s.is_active=1")->fetchColumn();
    $check($adminId!==false,'An admin fixture is available.');$admin=['staff_id'=>(int)$adminId,'role'=>'admin'];
    $db->beginTransaction();
    $saved=website_content_save($db,$admin,$sample,$before['version']);
    $check($saved['content']===$clean,'Saved content round-trips through SQL.');
    $check($saved['version']!==$before['version'],'Each save has a fresh conflict version.');
    $read=website_content_read($db);$check($read===$saved,'Public readers see saved admin content.');
    $check(array_keys($read['content'])===array_keys($defaults),'Only public About fields are returned.');
    $reject(fn()=>website_content_save($db,$admin,$sample,$before['version']),409);
    $check(website_content_read($db)===$saved,'Stale saves cannot overwrite another edit.');
    $reject(fn()=>website_content_save($db,['staff_id'=>$adminId,'role'=>'staff'],$sample,$saved['version']),403);
    $check(website_content_read($db)===$saved,'Staff cannot modify saved website content.');
    $cleared=$clean;foreach(['address','hours','phone','email','social']as$field)$cleared[$field]='';
    $next=website_content_save($db,$admin,$cleared,$saved['version']);
    $check($next['content']['address']===''&&$next['content']['hours']===''&&$next['content']['social']==='','Admins can remove optional details.');
    $db->exec(file_get_contents(__DIR__.'/../database/20_website_content.sql'));
    $check(website_content_read($db)===$next,'Reapplying migration preserves existing About content.');
    $db->rollBack();
    $check(website_content_read($db)===$before,'All content test writes were rolled back.');
    echo $checks." website content checks passed. Test changes rolled back.\n";
}catch(Throwable $error){if($db->inTransaction())$db->rollBack();fwrite(STDERR,$error->getMessage()."\n");exit(1);}
