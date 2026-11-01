<?php
declare(strict_types=1);
require_once __DIR__.'/orders.php';

function cashier_approval_ready(PDO $db): bool {
    return (bool)$db->query("SELECT CASE WHEN OBJECT_ID('dbo.cashier_action_approvals','U') IS NOT NULL AND OBJECT_ID('dbo.cashier_approval_throttle','U') IS NOT NULL THEN 1 ELSE 0 END")->fetchColumn();
}
function cashier_approval_schema(PDO $db): void {
    if(!cashier_approval_ready($db))throw new OrderError('Install database/28_cashier_admin_approval.sql before using admin-approved payouts or voids.',409,'approval_setup_required');
}
function cashier_approval_lock(PDO $db,string $resource): void {
    $q=$db->prepare("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=?,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000; SELECT @r;");
    $q->execute([$resource]);$r=(int)$q->fetchColumn();$q->closeCursor();if($r<0)throw new OrderError('Another approval is being processed. Please retry.',409);
}
// Verify before the financial transaction so failed attempts survive its rollback.
// No session role or admin workspace access is granted by this check.
function cashier_approval_verify(PDO $db,array $actor,array $input): array {
    cashier_approval_schema($db);
    if($db->inTransaction())throw new LogicException('Verify approval credentials before starting the action transaction.');
    $password=$input['adminPassword']??null;
    if(!is_string($password)||$password===''||strlen($password)>4096)throw new OrderError('An admin must enter their password to approve this action.',403,'admin_approval_required');
    try{
        $db->beginTransaction();cashier_approval_lock($db,'QuvoCashierApprovalAttempts:'.$actor['staff_id']);
        $q=$db->prepare('SELECT failures,DATEDIFF(SECOND,window_started,SYSUTCDATETIME()) age FROM dbo.cashier_approval_throttle WHERE staff_id=?');$q->execute([$actor['staff_id']]);$limit=$q->fetch();$q->closeCursor();
        if($limit&&(int)$limit['age']<900&&(int)$limit['failures']>=5){$db->commit();throw new OrderError('Too many incorrect approval attempts. Wait 15 minutes from the first failed attempt before trying again.',429,'approval_locked');}
        $q=$db->query("SELECT s.staff_id,s.full_name,s.password_hash FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE s.is_active=1 AND LOWER(r.role_name)='admin' ORDER BY s.staff_id");$admins=$q->fetchAll();$q->closeCursor();
        $matches=[];foreach($admins as $admin){if(password_verify($password,$admin['password_hash']))$matches[]=$admin;}
        if(!$admins)password_verify($password,'$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
        // A unique matching account is required to preserve accurate approval attribution.
        $row=count($matches)===1?$matches[0]:null;
        if(!$row){
            if(!$limit){$db->prepare('INSERT dbo.cashier_approval_throttle(staff_id,failures) VALUES(?,1)')->execute([$actor['staff_id']]);}
            else{$db->prepare('UPDATE dbo.cashier_approval_throttle SET failures=?,window_started=CASE WHEN ?>=900 THEN SYSUTCDATETIME() ELSE window_started END WHERE staff_id=?')->execute([(int)$limit['age']>=900?1:(int)$limit['failures']+1,(int)$limit['age'],$actor['staff_id']]);}
            $db->commit();throw new OrderError(count($matches)>1?'This password matches multiple admin accounts. An admin must use a unique account password to approve.':'Admin approval failed. Check the admin password.',403,'admin_approval_failed');
        }
        $db->prepare('DELETE dbo.cashier_approval_throttle WHERE staff_id=?')->execute([$actor['staff_id']]);$db->commit();
        return ['staff_id'=>(int)$row['staff_id'],'full_name'=>$row['full_name'],'role'=>'admin','credential_stamp'=>hash('sha256',$row['password_hash'])];
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
function cashier_approval_begin(PDO $db,array $actor,array $approver,string $kind,mixed $key,array $details): array {
    if(!$db->inTransaction())throw new LogicException('Approval requires an action transaction.');
    cashier_approval_schema($db);$key=ordering_uuid($key);inventory_lock($db);cashier_approval_lock($db,'QuvoCashierAction:'.$key);
    // Recheck the active role and password version at execution, including concurrent account changes.
    $q=$db->prepare('SELECT s.password_hash,s.is_active,r.role_name FROM dbo.staff_users s WITH(HOLDLOCK) JOIN dbo.roles r WITH(HOLDLOCK) ON r.role_id=s.role_id WHERE staff_id=?');$q->execute([$approver['staff_id']]);$row=$q->fetch();$q->closeCursor();
    if(!$row||!(bool)$row['is_active']||strtolower($row['role_name'])!=='admin'||!hash_equals($approver['credential_stamp']??'',hash('sha256',$row['password_hash'])))throw new OrderError('Admin approval has changed. Ask the admin to approve again.',403);
    $hash=hash('sha256',json_encode([$actor['staff_id'],$kind,$details],JSON_THROW_ON_ERROR));
    $q=$db->prepare('SELECT result_json,CONVERT(varchar(64),request_hash,2) hash FROM dbo.cashier_action_approvals WHERE request_key=?');$q->execute([$key]);$old=$q->fetch();$q->closeCursor();
    if($old&&!hash_equals(strtolower($old['hash']),$hash))throw new OrderError('This approval submission was already used for different details. Start a new request.',409,'approval_details_changed');
    return ['key'=>$key,'hash'=>$hash,'kind'=>$kind,'details'=>$details,'result'=>$old?json_decode($old['result_json'],true,64,JSON_THROW_ON_ERROR):null];
}
function cashier_approval_save(PDO $db,array $actor,array $approver,array $approval,string $entity,array $result): void {
    $details=json_encode($approval['details'],JSON_THROW_ON_ERROR);
    $q=$db->prepare('INSERT dbo.cashier_action_approvals(request_key,request_hash,action,entity_key,requested_by_staff_id,approved_by_staff_id,requested_by_name,approved_by_name,details_json,result_json) VALUES(?,CONVERT(binary(32),?,2),?,?,?,?,?,?,?,?)');
    $q->execute([$approval['key'],$approval['hash'],$approval['kind'],$entity,$actor['staff_id'],$approver['staff_id'],$actor['full_name'],$approver['full_name'],$details,json_encode($result,JSON_THROW_ON_ERROR)]);
    $db->prepare('INSERT dbo.system_audit_log(actor_staff_id,action,entity_type,entity_key,details_json) VALUES(?,?,?,?,?)')->execute([$actor['staff_id'],'cashier_'.$approval['kind'].'_approved',$approval['kind']==='void'?'order':'cash_movement',$entity,json_encode(['requestedByStaffId'=>$actor['staff_id'],'requestedBy'=>$actor['full_name'],'approvedByStaffId'=>$approver['staff_id'],'approvedBy'=>$approver['full_name'],'requestKey'=>$approval['key'],'details'=>$approval['details']],JSON_THROW_ON_ERROR)]);
}
