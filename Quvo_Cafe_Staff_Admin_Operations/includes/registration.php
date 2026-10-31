<?php
declare(strict_types=1);
require_once __DIR__.'/registration-mail.php';

// Tokens live only in the HttpOnly PHP session. SQL stores token/code digests.
function registration_schema(PDO $db): void
{
    $ready = $db->query("SELECT CASE WHEN OBJECT_ID('dbo.customer_registration_codes','U') IS NOT NULL AND OBJECT_ID('dbo.customer_registration_limits','U') IS NOT NULL AND COL_LENGTH('dbo.customer_accounts','email_verified_at') IS NOT NULL THEN 1 ELSE 0 END")->fetchColumn();
    if (!(int)$ready) throw new OrderError('Email verification is being set up. Please try again later.',503,'email_setup_required');
}

function registration_transaction(PDO $db, callable $operation): mixed
{
    $owns = !$db->inTransaction();
    if ($owns) $db->beginTransaction();
    try {
        $result = $operation();
        if ($owns) $db->commit();
        return $result;
    } catch (Throwable $error) {
        if ($owns && $db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function registration_token_hash(): ?string
{
    $token = $_SESSION['registration_token'] ?? null;
    return is_string($token) && preg_match('/\A[0-9a-f]{64}\z/', $token) ? hash('sha256', $token) : null;
}

function registration_row(PDO $db, bool $lock = false): ?array
{
    $hash = registration_token_hash();
    if (!$hash) return null;
    $q = $db->prepare('SELECT *,DATEDIFF(second,SYSUTCDATETIME(),expires_at) AS expires_in,
        DATEDIFF(second,last_sent_at,SYSUTCDATETIME()) AS since_sent,
        DATEDIFF(second,created_at,SYSUTCDATETIME()) AS age_seconds
        FROM dbo.customer_registration_codes'.($lock?' WITH (UPDLOCK,HOLDLOCK)':'').' WHERE token_hash=?');
    $q->execute([$hash]); $row = $q->fetch(); $q->closeCursor();
    return $row ?: null;
}

function registration_public(?array $row): ?array
{
    if (!$row || (int)$row['age_seconds'] >= 3600) return null;
    return ['email'=>$row['email'], 'expires_in'=>max(0,(int)$row['expires_in']),
        'resend_after'=>max(0,60-(int)$row['since_sent']), 'locked'=>(int)$row['attempts']>=5];
}

function online_registration_status(PDO $db): ?array
{
    if (!registration_token_hash()) return null;
    registration_schema($db);
    return registration_public(registration_row($db));
}

function registration_reserve_send(PDO $db, string $email, string $ip): void
{
    // Database limits survive cookie clearing and apply across server processes.
    $keys = [hash('sha256','email:'.$email)=>['max'=>5,'cooldown'=>60],
        hash('sha256','ip:'.$ip)=>['max'=>20,'cooldown'=>0]];
    ksort($keys);
    foreach ($keys as $key=>$rule) {
        $q = $db->prepare("DECLARE @result int; EXEC @result=sys.sp_getapplock @Resource=?,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000; SELECT @result;");
        $q->execute(['QuvoRegistration:'.$key]); $lock=(int)$q->fetchColumn(); $q->closeCursor();
        if ($lock<0) throw new OrderError('Verification is busy. Please try again shortly.',503);
        $q=$db->prepare('SELECT send_count,DATEDIFF(second,window_started_at,SYSUTCDATETIME()) AS age_seconds,DATEDIFF(second,last_sent_at,SYSUTCDATETIME()) AS since_sent FROM dbo.customer_registration_limits WITH (UPDLOCK,HOLDLOCK) WHERE rate_key=?');
        $q->execute([$key]);$row=$q->fetch();$q->closeCursor();
        if ($row && (($rule['cooldown']>0 && (int)$row['since_sent']<$rule['cooldown']) || ((int)$row['age_seconds']<3600 && (int)$row['send_count']>=$rule['max'])))
            throw new OrderError('Too many verification requests. Wait at least a minute before retrying. The hourly limit is five codes per email.',429,'verification_rate_limited');
        if ($row) $db->prepare('UPDATE dbo.customer_registration_limits SET send_count=CASE WHEN DATEDIFF(second,window_started_at,SYSUTCDATETIME())>=3600 THEN 1 ELSE send_count+1 END,window_started_at=CASE WHEN DATEDIFF(second,window_started_at,SYSUTCDATETIME())>=3600 THEN SYSUTCDATETIME() ELSE window_started_at END,last_sent_at=SYSUTCDATETIME() WHERE rate_key=?')->execute([$key]);
        else $db->prepare('INSERT dbo.customer_registration_limits(rate_key,window_started_at,last_sent_at,send_count) VALUES(?,SYSUTCDATETIME(),SYSUTCDATETIME(),1)')->execute([$key]);
    }
}

function online_registration_begin(PDO $db, array $input, string $ip, ?callable $testSender = null): array
{
    [$name,$email,$contact] = online_profile_values($input);
    $password = online_password($input['password']??null);
    registration_schema($db);
    if ($testSender===null) registration_mail_config();
    elseif (PHP_SAPI!=='cli') throw new LogicException('Test transport is CLI-only.');
    $token=bin2hex(random_bytes(32)); $hash=hash('sha256',$token);
    $code=str_pad((string)random_int(0,999999),6,'0',STR_PAD_LEFT);
    registration_transaction($db,function()use($db,$email,$ip,$name,$contact,$password,$hash,$code,$token){
        registration_reserve_send($db,$email,$ip);
        $q=$db->prepare('SELECT customer_account_id FROM dbo.customer_accounts WHERE email=?');$q->execute([$email]);$existing=$q->fetchColumn();$q->closeCursor();
        if($existing) throw new OrderError('This email is already registered. Please sign in instead.',409);
        $old=registration_token_hash();
        if($old)$db->prepare('DELETE FROM dbo.customer_registration_codes WHERE token_hash=?')->execute([$old]);
        $db->prepare('DELETE FROM dbo.customer_registration_codes WHERE expires_at<DATEADD(day,-1,SYSUTCDATETIME())')->execute();
        $db->prepare('DELETE FROM dbo.customer_registration_limits WHERE last_sent_at<DATEADD(day,-1,SYSUTCDATETIME())')->execute();
        $db->prepare('INSERT dbo.customer_registration_codes(token_hash,email,full_name,contact_number,password_hash,code_hash,last_sent_at,expires_at) VALUES(?,?,?,?,?,?,SYSUTCDATETIME(),DATEADD(minute,10,SYSUTCDATETIME()))')
            ->execute([$hash,$email,$name,$contact,password_hash($password,PASSWORD_DEFAULT),hash_hmac('sha256',$code,$token)]);
    });
    $_SESSION['registration_token']=$token;
    try { registration_send_code($email,$code,$testSender); }
    catch(Throwable $error){
        // Keep limits, invalidate the undelivered challenge, and allow a retry later.
        $db->prepare('DELETE FROM dbo.customer_registration_codes WHERE token_hash=?')->execute([$hash]);
        unset($_SESSION['registration_token']);throw $error;
    }
    return registration_public(registration_row($db));
}

function online_registration_resend(PDO $db, string $ip, ?callable $testSender = null): array
{
    registration_schema($db);
    if($testSender===null)registration_mail_config();
    $code=str_pad((string)random_int(0,999999),6,'0',STR_PAD_LEFT);
    // Commit the replacement before SMTP; limits remain consumed if delivery fails.
    $result=registration_transaction($db,function()use($db,$ip,$code,$testSender){
        $row=registration_row($db,true);
        if(!$row || (int)$row['age_seconds']>=3600)throw new OrderError('Please enter your registration details again.',410,'registration_expired');
        registration_reserve_send($db,$row['email'],$ip);
        $db->prepare('UPDATE dbo.customer_registration_codes SET code_hash=?,attempts=0,last_sent_at=SYSUTCDATETIME(),expires_at=DATEADD(minute,10,SYSUTCDATETIME()) WHERE token_hash=?')
            ->execute([hash_hmac('sha256',$code,$_SESSION['registration_token']),$row['token_hash']]);
        return ['email'=>$row['email'],'hash'=>$row['token_hash']];
    });
    try {registration_send_code($result['email'],$code,$testSender);}
    catch(Throwable $error){
        $db->prepare('UPDATE dbo.customer_registration_codes SET expires_at=SYSUTCDATETIME() WHERE token_hash=? AND code_hash=?')->execute([$result['hash'],hash_hmac('sha256',$code,$_SESSION['registration_token'])]);
        throw $error;
    }
    return registration_public(registration_row($db));
}

function online_registration_verify(PDO $db, mixed $code): array
{
    registration_schema($db);
    if(!is_string($code)||!preg_match('/\A[0-9]{6}\z/',$code))throw new OrderError('Enter the six-digit code from your email.');
    // Return errors after committing: failed attempts must survive an API error.
    $result=registration_transaction($db,function()use($db,$code){
        $row=registration_row($db,true);
        if(!$row || (int)$row['age_seconds']>=3600)return new OrderError('Please enter your registration details again.',410,'registration_expired');
        if((int)$row['attempts']>=5)return new OrderError('Too many incorrect codes. Request a new code.',429,'verification_locked');
        if((int)$row['expires_in']<=0)return new OrderError('This code has expired. Request a new code.',422,'verification_expired');
        if(!hash_equals($row['code_hash'],hash_hmac('sha256',$code,$_SESSION['registration_token']))){
            $db->prepare('UPDATE dbo.customer_registration_codes SET attempts=attempts+1 WHERE token_hash=?')->execute([$row['token_hash']]);
            return new OrderError((int)$row['attempts']===4?'Too many incorrect codes. Request a new code.':'That code is incorrect. Please try again.',(int)$row['attempts']===4?429:422,(int)$row['attempts']===4?'verification_locked':'verification_incorrect');
        }
        $q=$db->prepare('INSERT dbo.customer_accounts(full_name,email,contact_number,password_hash,email_verified_at) OUTPUT INSERTED.customer_account_id VALUES(?,?,?,?,SYSUTCDATETIME())');
        $q->execute([$row['full_name'],$row['email'],$row['contact_number'],$row['password_hash']]);$id=(int)$q->fetchColumn();$q->closeCursor();
        $db->prepare('DELETE FROM dbo.customer_registration_codes WHERE token_hash=?')->execute([$row['token_hash']]);
        return online_account($db,$id);
    });
    if($result instanceof OrderError)throw $result;
    unset($_SESSION['registration_token']);
    return $result;
}
