<?php
declare(strict_types=1);
require_once __DIR__.'/orders.php';
const KITCHEN_FOOD_CATEGORIES=QUVO_KITCHEN_CATEGORIES;
function kitchen_actor(array $actor):void {
    if(!in_array($actor['role'],['admin','staff','kitchen'],true))throw new OrderError('Kitchen access is required.',403);
}
function kitchen_get(PDO $db,int $id):array {
    $row=orders_get($db,$id);
    $food=array_values(array_filter($row['items'],fn($item)=>in_array($item['category'],KITCHEN_FOOD_CATEGORIES,true)));
    if(!$food)throw new OrderError('This order has no kitchen items.',404);
    if($row['payment_status']!=='paid'||!in_array($row['order_status'],['preparing','ready'],true))throw new OrderError('This order is no longer in the kitchen queue.',409);
    $q=$db->prepare('SELECT k.ready_at,s.full_name FROM dbo.kitchen_ticket_readiness k JOIN dbo.staff_users s ON s.staff_id=k.ready_by_staff_id WHERE k.order_id=?');$q->execute([$id]);$ready=$q->fetch();$q->closeCursor();
    return ['order_id'=>(string)$id,'order_number'=>$row['order_number'],'order_source'=>$row['order_source'],'customer_name'=>$row['customer_name'],'location'=>$row['table_name'],
        'status'=>$ready||$row['order_status']==='ready'?'ready':'preparing','order_status'=>$row['order_status'],'received_at'=>$row['paid_at'],'ready_at'=>$ready['ready_at']??null,'ready_by'=>$ready['full_name']??null,
        'has_drinks'=>count($food)!==count($row['items']),
        'items'=>array_map(fn($item)=>['name'=>$item['item_name'],'category'=>$item['category'],'quantity'=>(int)$item['quantity'],'notes'=>$item['notes'],'customization'=>$item['customization']],$food)];
}
function kitchen_list(PDO $db,mixed $offset=0):array {
    $offset=filter_var($offset,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>1000000]]);if($offset===false)throw new OrderError('Invalid queue offset.');
    $q=$db->prepare("SELECT o.order_id FROM dbo.orders o JOIN dbo.payments p ON p.order_id=o.order_id WHERE o.order_status IN ('preparing','ready') AND EXISTS(SELECT 1 FROM dbo.order_items i WHERE i.order_id=o.order_id AND i.category IN ('food','sandwich','meal','snack','pastry','pasta','dessert','meal-sets','appetizer','sandwiches','pizza')) ORDER BY p.paid_at,o.order_id OFFSET ? ROWS FETCH NEXT 101 ROWS ONLY");
    $q->bindValue(1,$offset,PDO::PARAM_INT);$q->execute();$ids=$q->fetchAll(PDO::FETCH_COLUMN);$q->closeCursor();$more=count($ids)>100;$result=[];
    foreach(array_slice($ids,0,100) as $id){try{$result[]=kitchen_get($db,(int)$id);}catch(OrderError $error){if(!in_array($error->status,[404,409],true))throw $error;}}
    return ['orders'=>$result,'next_offset'=>$more?$offset+100:null];
}
// The caller owns the transaction; lock the same order row as cashier actions.
function kitchen_ready(PDO $db,array $actor,int $id):array {
    kitchen_actor($actor);orders_lock($db,$id);$ticket=kitchen_get($db,$id);
    $q=$db->prepare('SELECT order_id FROM dbo.kitchen_ticket_readiness WHERE order_id=?');$q->execute([$id]);$exists=(bool)$q->fetchColumn();$q->closeCursor();
    if(!$exists){$db->prepare('INSERT dbo.kitchen_ticket_readiness(order_id,ready_by_staff_id) VALUES(?,?)')->execute([$id,$actor['staff_id']]);}
    if(!$ticket['has_drinks']&&$ticket['order_status']==='preparing')orders_status($db,$actor['staff_id'],$id,'ready');
    return ['order'=>kitchen_get($db,$id),'replayed'=>$exists];
}
