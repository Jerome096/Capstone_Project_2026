<?php
declare(strict_types=1);
require_once __DIR__.'/orders.php';

function operating_hours_access(?array $actor,bool $confirmed,bool $write=false):void {
    if(!$actor)throw new OrderError('Please sign in again.',401);
    if(!in_array($actor['role'],['admin','staff'],true))throw new OrderError('Access denied.',403);
    if($write&&($actor['role']!=='admin'||!$confirmed))throw new OrderError('Confirmed admin access is required.',403);
}
function operating_hours_time(int $minute):string {return sprintf('%02d:%02d',intdiv($minute,60),$minute%60);}
function operating_hours_minute(mixed $time):int {
    if(!is_string($time)||!preg_match('/\A([01][0-9]|2[0-3]):([0-5][0-9])\z/',$time,$parts))throw new OrderError('Choose a valid opening and closing time.');
    return (int)$parts[1]*60+(int)$parts[2];
}
function operating_hours_date(mixed $date):DateTimeImmutable {
    if(!is_string($date)||!preg_match('/\A[0-9]{4}-[0-9]{2}-[0-9]{2}\z/',$date))throw new OrderError('Choose a valid business date.');
    $value=DateTimeImmutable::createFromFormat('!Y-m-d',$date,new DateTimeZone('Asia/Manila'));
    if(!$value||$value->format('Y-m-d')!==$date||(int)$value->format('Y')<1||(int)$value->format('Y')>9998)throw new OrderError('Choose a valid business date.');
    return $value;
}
function operating_hours_context(PDO $db):array {
    $now=new DateTimeImmutable((string)$db->query('SELECT CONVERT(varchar(19),SYSUTCDATETIME(),126)')->fetchColumn(),new DateTimeZone('UTC'));
    $ready=(bool)$db->query("SELECT CASE WHEN OBJECT_ID('dbo.operating_hours_settings','U') IS NOT NULL AND OBJECT_ID('dbo.operating_hours_schedule','U') IS NOT NULL THEN 1 ELSE 0 END")->fetchColumn();
    $context=['now'=>$now,'version'=>null,'setupRequired'=>!$ready,'schedule'=>[['effectiveDate'=>'0001-01-01','openingMinute'=>0,'closingMinute'=>0,'legacy'=>true]]];
    if(!$ready)return $context;
    $context['version']=$db->query('SELECT CONVERT(varchar(36),settings_version) FROM dbo.operating_hours_settings WHERE settings_id=1')->fetchColumn()?:null;
    $rows=$db->query('SELECT CONVERT(char(10),s.effective_date,23) effectiveDate,s.opening_minute,s.closing_minute,s.legacy_calendar,s.changed_at,u.full_name changedBy FROM dbo.operating_hours_schedule s LEFT JOIN dbo.staff_users u ON u.staff_id=s.changed_by_staff_id ORDER BY s.effective_date')->fetchAll();
    if($rows)$context['schedule']=array_map(fn($row)=>['effectiveDate'=>$row['effectiveDate'],'openingMinute'=>(int)$row['opening_minute'],'closingMinute'=>(int)$row['closing_minute'],'legacy'=>(bool)$row['legacy_calendar'],'changedAt'=>$row['changed_at'],'changedBy'=>$row['changedBy']],$rows);
    $context['setupRequired']=$context['version']===null;
    return $context;
}
function operating_hours_for_date(array $context,string $date):array {
    $selected=$context['schedule'][0];
    foreach($context['schedule'] as $rule){if($rule['effectiveDate']>$date)break;$selected=$rule;}
    return $selected;
}
function operating_business_date(array $context,?DateTimeImmutable $at=null):string {
    $local=($at??$context['now'])->setTimezone(new DateTimeZone('Asia/Manila'));
    $rule=operating_hours_for_date($context,$local->format('Y-m-d'));
    if((int)$local->format('H')*60+(int)$local->format('i')<$rule['openingMinute'])$local=$local->modify('-1 day');
    return $local->format('Y-m-d');
}
function operating_day_bounds(array $context,string $date):array {
    $day=operating_hours_date($date);$rule=operating_hours_for_date($context,$date);
    $next=$day->modify('+1 day');$nextRule=operating_hours_for_date($context,$next->format('Y-m-d'));
    $start=$day->modify('+'.$rule['openingMinute'].' minutes');$end=$next->modify('+'.$nextRule['openingMinute'].' minutes');
    $close=$day->modify('+'.($rule['closingMinute']+($rule['closingMinute']<=$rule['openingMinute']?1440:0)).' minutes');
    return ['start'=>$start,'end'=>$end,'close'=>$close,'rule'=>$rule,'startUtc'=>$start->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),'endUtc'=>$end->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),'closeUtc'=>$close->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s')];
}
function operating_hours_public(array $context):array {
    $date=operating_business_date($context);$active=operating_hours_for_date($context,$date);$bounds=operating_day_bounds($context,$date);
    $publicRule=fn($rule)=>$rule+['opening'=>operating_hours_time($rule['openingMinute']),'closing'=>operating_hours_time($rule['closingMinute']),'overnight'=>$rule['closingMinute']<=$rule['openingMinute']];
    return ['version'=>$context['version'],'setupRequired'=>$context['setupRequired'],'timezone'=>'Asia/Manila','serverTime'=>$context['now']->format('Y-m-d\TH:i:s\Z'),'businessDate'=>$date,'earliestEffectiveDate'=>operating_hours_date($date)->modify('+1 day')->format('Y-m-d'),'active'=>$publicRule($active),'schedule'=>array_map($publicRule,$context['schedule']),'windowStart'=>$bounds['startUtc'],'windowEnd'=>$bounds['endUtc'],'scheduledClose'=>$bounds['closeUtc']];
}
// Use the schedule for the event's calendar date to assign it to the most recent opening date.
function operating_date_sql(array $context,string $column,string $alias='bh'):array {
    $local="DATEADD(hour,8,$column)";
    if($context['setupRequired'])return ['apply'=>'','date'=>"CAST($local AS date)"];
    return ['apply'=>" OUTER APPLY (SELECT TOP 1 opening_minute FROM dbo.operating_hours_schedule WHERE effective_date<=CAST($local AS date) ORDER BY effective_date DESC) $alias ",'date'=>"CAST(DATEADD(minute,-COALESCE($alias.opening_minute,0),$local) AS date)"];
}
function operating_hours_save(PDO $db,array $actor,array $input):array {
    if(($actor['role']??null)!=='admin')throw new OrderError('Only admins can change operating hours.',403);
    if(!$db->inTransaction())throw new LogicException('Operating hours updates require a transaction.');
    $open=operating_hours_minute($input['opening']??null);$close=operating_hours_minute($input['closing']??null);
    if($open===$close)throw new OrderError('Opening and closing times must be different.');
    $day=operating_hours_date($input['effectiveDate']??null);$date=$day->format('Y-m-d');
    $q=$db->query("DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource='QuvoOperatingHours',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;SELECT @r");$lock=(int)$q->fetchColumn();$q->closeCursor();
    if($lock<0)throw new OrderError('Operating hours are being updated. Try again.',409);
    $context=operating_hours_context($db);
    if($context['setupRequired'])throw new OrderError('Install the operating-hours SQL setup before saving.',409,'hours_setup_required');
    $matching=null;foreach($context['schedule'] as $rule)if($rule['effectiveDate']===$date)$matching=$rule;
    if(!is_string($input['version']??null)||!hash_equals(strtolower($context['version']),strtolower($input['version']))){
        if($matching&&$matching['openingMinute']===$open&&$matching['closingMinute']===$close)return operating_hours_public($context)+['replayed'=>true];
        throw new OrderError('Operating hours changed. Reload the saved schedule before saving your draft.',409,'hours_changed');
    }
    if($date<=operating_business_date($context)||$day->modify('+'.$open.' minutes')<=$context['now'])throw new OrderError('Choose a future business date and opening time. Saved history cannot be changed.');
    $q=$db->prepare('SELECT effective_date FROM dbo.operating_hours_schedule WITH(UPDLOCK,HOLDLOCK) WHERE effective_date=?');$q->execute([$date]);$exists=$q->fetchColumn();$q->closeCursor();
    if($exists)$db->prepare('UPDATE dbo.operating_hours_schedule SET opening_minute=?,closing_minute=?,changed_by_staff_id=?,changed_at=SYSUTCDATETIME() WHERE effective_date=?')->execute([$open,$close,$actor['staff_id'],$date]);
    else $db->prepare('INSERT dbo.operating_hours_schedule(opening_minute,closing_minute,changed_by_staff_id,effective_date) VALUES(?,?,?,?)')->execute([$open,$close,$actor['staff_id'],$date]);
    $db->prepare('UPDATE dbo.operating_hours_settings SET settings_version=NEWID(),updated_at=SYSUTCDATETIME(),updated_by_staff_id=? WHERE settings_id=1')->execute([$actor['staff_id']]);
    $db->prepare("INSERT dbo.system_audit_log(actor_staff_id,action,entity_type,entity_key,details_json) VALUES(?,'operating_hours_updated','operating_hours',?,?)")->execute([$actor['staff_id'],$date,json_encode(['opening'=>operating_hours_time($open),'closing'=>operating_hours_time($close),'effectiveDate'=>$date],JSON_THROW_ON_ERROR)]);
    return operating_hours_public(operating_hours_context($db))+['replayed'=>false];
}
