<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';require_once __DIR__.'/../../includes/reports.php';
$db=null;
try{
    reports_access(quvo_current_user(),!empty($_SESSION['admin_confirmed']));
    if($_SERVER['REQUEST_METHOD']!=='GET')throw new OrderError('Use GET for reports.',405);
    $db=quvo_db();$db->exec('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');$db->beginTransaction();
    $report=reports_period($db,$_GET['period']??'daily',$_GET['date']??null);$db->commit();quvo_json(['ok'=>true,'report'=>$report]);
}catch(Throwable $error){orders_error($db,$error);}
