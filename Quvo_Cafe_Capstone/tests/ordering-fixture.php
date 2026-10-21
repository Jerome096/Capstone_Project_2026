<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/orders.php';

function ordering_test_uuid(): string
{
    $hex=bin2hex(random_bytes(16));
    return substr($hex,0,8).'-'.substr($hex,8,4).'-'.substr($hex,12,4).'-'.substr($hex,16,4).'-'.substr($hex,20);
}

// Only inside the calling test's rollback transaction. Never opens real service.
function ordering_test_open(PDO $db): array
{
    if(!$db->inTransaction())throw new LogicException('Test opening requires a rollback transaction.');
    $tag=bin2hex(random_bytes(6));$passwordHash=password_hash(bin2hex(random_bytes(24)),PASSWORD_DEFAULT);
    $role=(int)$db->query("SELECT TOP 1 role_id FROM dbo.roles WHERE LOWER(role_name)='staff'")->fetchColumn();
    $q=$db->prepare("INSERT dbo.staff_users(role_id,full_name,username,password_hash) OUTPUT INSERTED.staff_id VALUES(?,N'Ordering rollback test',?,?)");
    $q->execute([$role,'ordering-'.$tag,$passwordHash]);$actor=['role'=>'staff','staff_id'=>(int)$q->fetchColumn()];$q->closeCursor();
    $identity=['actor'=>$actor,'workspaceId'=>ordering_test_uuid(),'sessionHash'=>hash('sha256',$tag),'stamp'=>hash('sha256',$passwordHash)];
    ordering_change($db,$actor,['action'=>'start','workspaceId'=>$identity['workspaceId'],'revision'=>ordering_status($db,true)['revision']],$identity['sessionHash'],$identity['stamp']);
    return $identity;
}
