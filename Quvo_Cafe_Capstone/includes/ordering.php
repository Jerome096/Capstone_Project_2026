<?php
declare(strict_types=1);

// Loaded by orders.php. A live authenticated operations workspace renews a
// 90-second lease; merely logging in or visiting a customer page never opens orders.
function ordering_access(?array $actor): void
{
    if (!$actor) throw new OrderError('Please sign in again.', 401);
    if (!in_array($actor['role'], ['admin','staff'], true)) throw new OrderError('Only staff and admins can control customer ordering.', 403);
}

function ordering_uuid(mixed $value): string
{
    if (!is_string($value) || !preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i', $value)) {
        throw new OrderError('Refresh the workspace and try again.');
    }
    return strtolower($value);
}

function ordering_lock(PDO $db, string $mode = 'Exclusive'): void
{
    if (!$db->inTransaction()) throw new LogicException('Ordering changes require a transaction.');
    if (!in_array($mode, ['Shared','Exclusive'], true)) throw new LogicException('Invalid ordering lock.');
    $query = $db->prepare("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource='QuvoOrderAcceptance',@LockMode=?,@LockOwner='Transaction',@LockTimeout=5000; SELECT @r");
    $query->execute([$mode]); $result = (int)$query->fetchColumn(); $query->closeCursor();
    if ($result < 0) throw new OrderError('Ordering status is being updated. Please try again.', 409, 'ordering_busy');
}

function ordering_assert_backend(bool $online = false): void
{
    if (!defined('QUVO_ORDERING_GATE_VERSION') || QUVO_ORDERING_GATE_VERSION !== 1
        || ($online && (!defined('QUVO_ONLINE_ORDERING_GATE_VERSION') || QUVO_ONLINE_ORDERING_GATE_VERSION !== 1))) {
        throw new OrderError('Customer ordering is unavailable. Please ask a staff member.',503,'ordering_files_required');
    }
}

function ordering_row(PDO $db): array
{
    ordering_assert_backend();
    try {
    $query = $db->query("SELECT s.*,
        (SELECT COUNT(*) FROM dbo.ordering_workspaces w
         JOIN dbo.staff_users u ON u.staff_id=w.staff_id JOIN dbo.roles r ON r.role_id=u.role_id
         WHERE w.service_version=s.service_version AND w.lease_expires_at>SYSUTCDATETIME()
           AND u.is_active=1 AND LOWER(r.role_name) IN ('admin','staff')
           AND w.credential_stamp=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varchar(255),u.password_hash)),2))) AS online_workspaces
        FROM dbo.ordering_settings s WHERE s.settings_id=1");
    $row = $query->fetch(); $query->closeCursor();
    } catch (PDOException $error) {
        if (in_array((int)($error->errorInfo[1]??0),[207,208],true)) {
            throw new OrderError('Customer ordering is unavailable. Please ask a staff member.',503,'ordering_setup_required');
        }
        throw $error;
    }
    return $row ?: throw new OrderError('Customer ordering is unavailable. Please ask a staff member.',503,'ordering_setup_required');
}

function ordering_status(PDO $db, bool $staff = false): array
{
    $row = ordering_row($db);
    $open = (bool)$row['accepting_orders'] && (int)$row['online_workspaces'] > 0;
    $offline = (bool)$row['accepting_orders'] || $row['change_reason'] === 'offline';
    $status = ['acceptingOrders'=>$open, 'state'=>$open?'open':($offline?'offline':'paused'),
        'message'=>$open?'We are accepting orders.':'We are not accepting orders right now. You can still browse the menu. Please try again when ordering reopens.'];
    if ($staff) $status += ['revision'=>strtolower($row['service_version']), 'onlineWorkspaces'=>(int)$row['online_workspaces']];
    return $status;
}

function ordering_pause(PDO $db, ?int $actor, string $reason = 'manual'): void
{
    ordering_lock($db);
    $db->prepare('UPDATE dbo.ordering_settings SET accepting_orders=0,service_version=NEWID(),change_reason=?,changed_by_staff_id=?,changed_at=SYSUTCDATETIME() WHERE settings_id=1')
        ->execute([$reason,$actor]);
}

function ordering_lease(PDO $db, int $actor, string $workspace, string $sessionHash, string $stamp): void
{
    if (!preg_match('/\A[0-9a-f]{64}\z/', $sessionHash) || !preg_match('/\A[0-9a-f]{64}\z/', $stamp)) throw new LogicException('Invalid authenticated workspace identity.');
    // Settings are exclusively locked by the caller. Expired records have no effect.
    $db->exec('DELETE dbo.ordering_workspaces WHERE lease_expires_at<DATEADD(day,-1,SYSUTCDATETIME())');
    $q = $db->prepare('SELECT staff_id,CONVERT(varchar(64),staff_session_hash,2) session_hash FROM dbo.ordering_workspaces WHERE workspace_id=?');
    $q->execute([$workspace]); $old=$q->fetch(); $q->closeCursor();
    if ($old && ((int)$old['staff_id']!==$actor || !hash_equals(strtolower($old['session_hash']),$sessionHash))) {
        throw new OrderError('This workspace changed. Refresh it to reconnect.', 409, 'workspace_changed');
    }
    if ($old) {
        $db->prepare('UPDATE dbo.ordering_workspaces SET credential_stamp=?,service_version=(SELECT service_version FROM dbo.ordering_settings WHERE settings_id=1),lease_expires_at=DATEADD(second,90,SYSUTCDATETIME()) WHERE workspace_id=?')->execute([$stamp,$workspace]);
    } else {
        $db->prepare('INSERT dbo.ordering_workspaces(workspace_id,staff_id,staff_session_hash,credential_stamp,service_version,lease_expires_at) SELECT ?,?,CONVERT(binary(32),?,2),?,service_version,DATEADD(second,90,SYSUTCDATETIME()) FROM dbo.ordering_settings WHERE settings_id=1')
            ->execute([$workspace,$actor,$sessionHash,$stamp]);
    }
}

function ordering_change(PDO $db, ?array $actor, array $input, string $sessionHash, string $stamp): array
{
    ordering_access($actor);
    $action=$input['action']??null;
    if (!in_array($action,['start','pause','heartbeat'],true)) throw new OrderError('Unknown ordering action.');
    $workspace=ordering_uuid($input['workspaceId']??null);
    $revision=ordering_uuid($input['revision']??null);
    ordering_lock($db); $row=ordering_row($db);
    if (!hash_equals(strtolower($row['service_version']),$revision)) {
        if ($action==='heartbeat') return ordering_status($db,true);
        throw new OrderError('Another staff member changed ordering. Review the current status and try again.',409,'ordering_changed');
    }
    $actorId=(int)$actor['staff_id'];
    if ($action==='pause') ordering_pause($db,$actorId);
    elseif ($action==='start') {
        $db->prepare("UPDATE dbo.ordering_settings SET accepting_orders=1,service_version=NEWID(),change_reason='manual',changed_by_staff_id=?,changed_at=SYSUTCDATETIME() WHERE settings_id=1")->execute([$actorId]);
        ordering_lease($db,$actorId,$workspace,$sessionHash,$stamp);
    } elseif ((bool)$row['accepting_orders']) {
        if ((int)$row['online_workspaces']===0) ordering_pause($db,null,'offline');
        else ordering_lease($db,$actorId,$workspace,$sessionHash,$stamp);
    }
    return ordering_status($db,true);
}

function ordering_release_session(PDO $db, string $sessionHash): void
{
    ordering_lock($db);
    $db->prepare('DELETE dbo.ordering_workspaces WHERE staff_session_hash=CONVERT(binary(32),?,2)')->execute([$sessionHash]);
    $row=ordering_row($db);
    if ((bool)$row['accepting_orders'] && (int)$row['online_workspaces']===0) ordering_pause($db,null,'offline');
}

function ordering_require_open(PDO $db): void
{
    // Held through the order commit. A pause waits for earlier orders to finish;
    // requests reaching this check after the pause cannot create another order.
    ordering_lock($db,'Shared');
    $status=ordering_status($db);
    if (!$status['acceptingOrders']) throw new OrderError($status['message'],409,'ordering_closed');
}
