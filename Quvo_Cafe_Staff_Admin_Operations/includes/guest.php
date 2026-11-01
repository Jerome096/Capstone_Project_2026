<?php
declare(strict_types=1);
require_once __DIR__ . "/auth.php";
require_once __DIR__ . "/dining.php";

// Both customer endpoints share the same browser-bound guest cookie and CSRF token.
function quvo_start_guest_session(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        ini_set("session.use_strict_mode", "1");
        ini_set("session.use_only_cookies", "1");
        session_name("quvo_guest");
        session_set_cookie_params([
            "httponly" => true,
            "secure" => !empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off",
            "samesite" => "Lax",
            "path" => "/",
        ]);
        session_start();
    }
    header("Cache-Control: no-store");
    header("X-Content-Type-Options: nosniff");
    return $_SESSION["csrf"] ??= bin2hex(random_bytes(32));
}

// Remember only the opaque visit secret. SQL remains authoritative for approval and expiry.
function quvo_guest_visit_cookie(int $tableId): string
{
    return 'quvo_dine_visit_'.$tableId;
}
function quvo_guest_visit_cookie_path(): string
{
    $path=parse_url($_SERVER['REQUEST_URI']??'/customer/api/session.php',PHP_URL_PATH)?:'/customer/api/session.php';
    $api=strrpos($path,'/api/');
    return ($api===false?'/customer':substr($path,0,$api)).'/';
}
function quvo_guest_remember_visit(int $tableId,string $token): void
{
    if(!preg_match('/\A[0-9a-f]{64}\z/i',$token))throw new LogicException('Invalid visit token.');
    $name=quvo_guest_visit_cookie($tableId);
    if(isset($_COOKIE[$name])&&is_string($_COOKIE[$name])&&hash_equals($_COOKIE[$name],$token))return;
    setcookie($name,$token,['expires'=>time()+30*86400,'path'=>quvo_guest_visit_cookie_path(),
        'secure'=>!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off','httponly'=>true,'samesite'=>'Lax']);
    $_COOKIE[$name]=$token;
}
function quvo_guest_table_token(PDO $db,int $tableId): ?string
{
    $candidates=[$_SESSION['tables'][$tableId]??null,$_COOKIE[quvo_guest_visit_cookie($tableId)]??null];
    foreach($candidates as $token){
        if(!is_string($token)||!preg_match('/\A[0-9a-f]{64}\z/i',$token))continue;
        if(!dining_guest_session($db,$tableId,$token))continue;
        $_SESSION['tables'][$tableId]=$token;
        quvo_guest_remember_visit($tableId,$token);
        return $token;
    }
    return null;
}
