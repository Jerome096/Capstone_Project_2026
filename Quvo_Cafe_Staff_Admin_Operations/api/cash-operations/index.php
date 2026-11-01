<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';require_once __DIR__.'/../../includes/cash-operations.php';
require_once __DIR__.'/../../includes/cashier-approval.php';
$db=null;
try{
    $actor=quvo_current_user();ordering_access($actor);$db=quvo_db();cash_ops_schema($db);$method=$_SERVER['REQUEST_METHOD'];
    if($method==='GET'){
        $view=$_GET['view']??'current';
        if($view==='current')quvo_json(['ok'=>true,'operation'=>cash_ops_public(cash_ops_active($db))]);
        if($view==='record')quvo_json(['ok'=>true,'record'=>cash_ops_record($db,orders_id($_GET['id']??null),$actor,!empty($_SESSION['admin_confirmed']))]);
        reports_access($actor,!empty($_SESSION['admin_confirmed']));
        if($view==='approvals'){
            cashier_approval_schema($db);$offset=filter_var($_GET['offset']??'0',FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>1000000]]);if($offset===false)throw new OrderError('Invalid approval page.');
            $q=$db->prepare('SELECT approval_id,action,entity_key,requested_by_name,approved_by_name,approved_at,details_json FROM dbo.cashier_action_approvals ORDER BY approval_id DESC OFFSET ? ROWS FETCH NEXT 26 ROWS ONLY');$q->bindValue(1,$offset,PDO::PARAM_INT);$q->execute();$rows=$q->fetchAll();$q->closeCursor();$more=count($rows)>25;if($more)array_pop($rows);
            quvo_json(['ok'=>true,'approvals'=>$rows,'nextOffset'=>$more?$offset+25:null]);
        }
        if($view==='history')quvo_json(['ok'=>true]+cash_ops_history($db,$_GET));
        if($view==='admin-current'){$op=cash_ops_active($db);quvo_json(['ok'=>true,'operation'=>cash_ops_public($op),'movements'=>$op?cash_ops_movements($db,(int)$op['operation_id']):[]]);}
        throw new OrderError('Unknown cash-operation view.');
    }
    quvo_require_post();$input=orders_input();
    if(($input['action']??'')==='cashier-payout'){
        $id=orders_id($input['operationId']??null);$amount=orders_cents($input['amount']??null);if($amount<=0)throw new OrderError('Enter a positive cash amount.');
        $details=['operationId'=>$id,'amount'=>orders_money($amount),'evidence'=>orders_text($input['evidence']??'',300),'note'=>orders_text($input['note']??'',1000,true)];
        $approver=cashier_approval_verify($db,$actor,$input);$db->beginTransaction();
        $approval=cashier_approval_begin($db,$actor,$approver,'payout',$input['requestKey']??null,$details);
        if($approval['result']!==null){$result=$approval['result'];$result['replayed']=true;}
        else{
            $result=cash_ops_move($db,$approver,['requestKey'=>$approval['key'],'type'=>'payout']+$details);
            cashier_approval_save($db,$actor,$approver,$approval,$result['movementId'],$result);
        }
        $db->commit();quvo_json(['ok'=>true]+$result);
    }
    reports_access($actor,!empty($_SESSION['admin_confirmed']));
    if(($input['action']??'')!=='movement')throw new OrderError('Unknown cash-operation action.');
    $db->beginTransaction();$result=cash_ops_move($db,$actor,$input);$db->commit();quvo_json(['ok'=>true]+$result);
}catch(Throwable $error){orders_error($db,$error);}
