<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/menu.php';
$db=null;
try{
    $user=quvo_current_user();
    if(!$user)throw new OrderError('Please sign in first.',401);
    $db=quvo_db();
    if($_SERVER['REQUEST_METHOD']==='GET')quvo_json(['ok'=>true,'items'=>menu_rows($db)]);
    quvo_require_post();
    if($user['role']!=='admin')throw new OrderError('Only admins can edit the menu.',403);
    $input=orders_input(3000000);$action=$input['action']??'save';
    if(!in_array($action,['save','delete'],true))throw new OrderError('Invalid menu action.');
    $db->beginTransaction();
    if($action==='delete'){
        inventory_lock($db);$id=orders_id($input['id']??null);
        $q=$db->prepare('DELETE dbo.menu_items OUTPUT DELETED.menu_item_id WHERE menu_item_id=?');$q->execute([$id]);$removed=$q->fetchColumn();$q->closeCursor();
        if($removed===false)throw new OrderError('This item no longer exists. Refresh the menu.',404);
        $db->commit();quvo_json(['ok'=>true,'id'=>$id]);
    }
    $item=menu_save($db,$input);$db->commit();
    quvo_json(['ok'=>true,'item'=>$item],isset($input['id'])?200:201);
}catch(Throwable $error){orders_error($db,$error);}
