<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/sales-audit.php';
require_once __DIR__.'/../../includes/sales-audit-xlsx.php';
$db=null;
try {
    $actor=quvo_current_user();reports_access($actor,!empty($_SESSION['admin_confirmed']));
    $db=quvo_db();audit_schema($db);$method=$_SERVER['REQUEST_METHOD'];
    if(!in_array($method,['GET','POST'],true))throw new OrderError('Use GET or POST for Sales Audit.',405);
    if($method==='GET'&&isset($_GET['download'])){
        $id=audit_uuid($_GET['download']);$row=audit_read($db,'SELECT CONVERT(varchar(max),file_bytes,2) file_hex,file_hash FROM dbo.sales_audit_exports WHERE export_id=?',[$id])[0]??null;
        if(!$row)throw new OrderError('Export not found.',404);$bytes=hex2bin($row['file_hex']);
    }else{
        if($method==='POST')quvo_require_post();
        $input=$method==='POST'?orders_input():$_GET;
        $db->exec('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');$db->beginTransaction();
        if($method==='POST'&&($input['action']??'')==='save'){$result=audit_save($db,$actor,$input);$db->commit();quvo_json(['ok'=>true]+$result);}
        if($method==='POST'&&($input['action']??'')!=='export')throw new OrderError('Unknown audit action.');
        $filters=audit_filters($db,$input);
        if($method==='POST'){
            $id=audit_uuid($input['requestKey']??null);audit_lock($db);
            $old=audit_read($db,'SELECT filters_json,CONVERT(varchar(max),file_bytes,2) file_hex FROM dbo.sales_audit_exports WHERE export_id=?',[$id])[0]??null;
            if($old){if(json_decode($old['filters_json'],true)!==$filters)throw new OrderError('Export ID was already used with different filters.',409);$bytes=hex2bin($old['file_hex']);}
            else{
                $report=audit_report($db,$filters);$report['window']['snapshotAt']=gmdate('Y-m-d H:i:s');$bytes=audit_workbook($report,$id,$actor['full_name']);
                if(strlen($bytes)>10485760)throw new OrderError('Workbook exceeds 10 MB. Choose a shorter export period.',413);
                $db->prepare('INSERT dbo.sales_audit_exports(export_id,actor_staff_id,filters_json,metadata_json,file_hash,file_bytes) VALUES(?,?,?,?,?,CONVERT(varbinary(max),?,2))')->execute([$id,$actor['staff_id'],json_encode($filters,JSON_THROW_ON_ERROR),json_encode(['version'=>'sales-audit-1','window'=>$report['window'],'counts'=>$report['counts']],JSON_THROW_ON_ERROR),hash('sha256',$bytes),bin2hex($bytes)]);
            }
            $db->commit();
        }else{
            $report=audit_report($db,$filters);$db->commit();
            $offset=filter_var($_GET['offset']??0,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>10000]]);if($offset===false)throw new OrderError('Invalid page.');
            $report['orders']=array_slice($report['orders'],$offset,25);unset($report['items'],$report['history']);
            $report['offset']=$offset;quvo_json(['ok'=>true,'report'=>$report]);
        }
    }
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');header('Content-Disposition: attachment; filename="Quvo-Sales-Audit-'.$id.'.xlsx"');header('Cache-Control: private, no-store');header('X-Content-Type-Options: nosniff');header('X-Export-Id: '.$id);header('X-Export-SHA256: '.hash('sha256',$bytes));echo $bytes;
}catch(Throwable $error){orders_error($db,$error);}
