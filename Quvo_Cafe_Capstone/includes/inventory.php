<?php
declare(strict_types=1);
// Loaded by orders.php. Quantities use integer thousandths, never floating-point arithmetic.
function inventory_quantity(mixed $value,bool $signed=false):int {
    if(is_string($value))$value=preg_replace('/^(-?)\./','${1}0.',$value);
    if((!is_string($value)&&!is_int($value))||!preg_match($signed?'/\A(-?)([0-9]{1,9})(?:\.([0-9]{1,3}))?\z/':'/\A()([0-9]{1,9})(?:\.([0-9]{1,3}))?\z/',(string)$value,$m))throw new OrderError('Enter a stock quantity with at most three decimal places.');
    $n=(int)$m[2]*1000+(int)str_pad($m[3]??'',3,'0');return $m[1]==='-'?-$n:$n;
}
function inventory_decimal(int $value):string {return ($value<0?'-':'').intdiv(abs($value),1000).'.'.str_pad((string)(abs($value)%1000),3,'0',STR_PAD_LEFT);}
function inventory_stock_text(mixed $value,int $max,bool $required,string $code,string $label):string {
    try {return orders_text($value,$max,$required);}
    catch(OrderError $error){throw new OrderError($label.($required?' is required and must be valid text, up to ':' must be valid text, up to ').$max.' characters.',422,$code);}
}
function inventory_stock_quantity(mixed $value,string $code,string $label):int {
    try {return inventory_quantity($value);}
    catch(OrderError $error){throw new OrderError($label.' must be zero or a positive number with at most three decimal places.',422,$code);}
}
function inventory_lock(PDO $db):void {
    $q=$db->query("DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource='QuvoInventory',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;SELECT @r");$r=(int)$q->fetchColumn();$q->closeCursor();if($r<0)throw new OrderError('Stock is being updated. Retry this action.',409);
}
function inventory_access(?array $actor,bool $confirmed):void {
    if(!$actor)throw new OrderError('Please sign in again.',401);
    if($actor['role']!=='admin'||!$confirmed)throw new OrderError('Confirmed admin access is required.',403);
}
function inventory_balance(PDO $db,int $id):int {
    $q=$db->prepare('SELECT COALESCE(SUM(quantity_delta),0) FROM dbo.inventory_movements WHERE inventory_item_id=?');$q->execute([$id]);$n=inventory_quantity($q->fetchColumn(),true);$q->closeCursor();return max(0,$n);
}
// Repair legacy deficits with visible adjustments, never by rewriting old movements.
// The caller owns the transaction and the inventory lock. Optional IDs scope payment repairs.
function inventory_normalize_negative(PDO $db,int $actor,?array $ids=null):int {
    if(!$db->inTransaction())throw new LogicException('Stock corrections require a transaction.');
    $corrected=0;$batches=$ids===null?[null]:array_chunk(array_values(array_unique($ids)),900);
    foreach($batches as $batch){
        $filter=$batch===null?'':' AND i.inventory_item_id IN ('.implode(',',array_fill(0,count($batch),'?')).')';
        $q=$db->prepare('SELECT i.inventory_item_id,SUM(m.quantity_delta) balance FROM dbo.inventory_items i JOIN dbo.inventory_movements m ON m.inventory_item_id=i.inventory_item_id WHERE i.is_active=1'.$filter.' GROUP BY i.inventory_item_id HAVING SUM(m.quantity_delta)<0');
        $q->execute($batch??[]);$rows=$q->fetchAll();$q->closeCursor();
        foreach($rows as $row){
            $balance=inventory_quantity($row['balance'],true);$id=(int)$row['inventory_item_id'];
            $db->prepare("INSERT dbo.inventory_movements(inventory_item_id,movement_type,quantity_delta,recorded_by_staff_id,reason) VALUES(?,'adjustment',?,?,?)")->execute([$id,inventory_decimal(-$balance),$actor,'Negative stock corrected from '.inventory_decimal($balance).' to 0.000; previous movements retained.']);
            $db->prepare('UPDATE dbo.inventory_items SET updated_at=SYSUTCDATETIME() WHERE inventory_item_id=?')->execute([$id]);$corrected++;
        }
    }
    return $corrected;
}
function inventory_item(PDO $db,int $id):array {
    $q=$db->prepare('SELECT i.*,u.unit_code,CONVERT(varchar(16),i.record_version,2) version FROM dbo.inventory_items i JOIN dbo.inventory_units u ON u.unit_id=i.unit_id WHERE inventory_item_id=? AND is_active=1');$q->execute([$id]);$row=$q->fetch();$q->closeCursor();if(!$row)throw new OrderError('Stock item not found.',404);return $row;
}
function inventory_stock_condition(string $alias='m'):string {
    return "NOT EXISTS(SELECT 1 FROM dbo.menu_recipes mr JOIN dbo.recipe_ingredients ri ON ri.recipe_id=mr.recipe_id JOIN dbo.inventory_items ii ON ii.inventory_item_id=ri.inventory_item_id WHERE mr.menu_item_id=$alias.menu_item_id AND mr.is_active=1 AND (ii.is_active=0 OR COALESCE((SELECT SUM(im.quantity_delta) FROM dbo.inventory_movements im WHERE im.inventory_item_id=ii.inventory_item_id),0)<ri.quantity_required))";
}
// A durable removal marker keeps menu/order/recipe foreign keys intact. These audit
// entries are lifecycle records and must be retained with the menu's history.
function menu_active_condition(string $alias='m'):string {
    return "NOT EXISTS(SELECT 1 FROM dbo.system_audit_log removed_menu WHERE removed_menu.entity_type='menu_item' AND removed_menu.action='menu_item_removed' AND removed_menu.entity_key=CONVERT(nvarchar(100),$alias.menu_item_id))";
}
// Stock is advisory. Removed items cannot be ordered, even from a stale cart.
function inventory_menu_condition(string $alias='m'):string {return "$alias.is_available=1 AND ".menu_active_condition($alias);}
function inventory_requirements(PDO $db,array $lines):array {
    $q=$db->prepare('SELECT ri.recipe_ingredient_id,ri.inventory_item_id,ri.quantity_required FROM dbo.menu_recipes mr JOIN dbo.recipe_ingredients ri ON ri.recipe_id=mr.recipe_id WHERE mr.menu_item_id=? AND mr.is_active=1 ORDER BY ri.inventory_item_id');$parts=[];
    foreach($lines as $line){$q->execute([$line['menu_item_id']]);$ingredients=$q->fetchAll();$q->closeCursor();foreach($ingredients as $ingredient)$parts[]=['item_id'=>(int)$ingredient['inventory_item_id'],'ingredient_id'=>(int)$ingredient['recipe_ingredient_id'],'quantity'=>inventory_quantity($ingredient['quantity_required'])*(int)$line['quantity'],'order_item_id'=>$line['order_item_id']??null];}
    return $parts;
}
// Staff-only advisory preview. The caller holds the inventory transaction lock;
// this uses the same recipe quantities as payment deductions and never writes stock.
function inventory_order_notice(PDO $db,int $id):array {
    $q=$db->prepare("SELECT o.order_status,CASE WHEN EXISTS(SELECT 1 FROM dbo.payments p WHERE p.order_id=o.order_id) THEN 1 ELSE 0 END paid FROM dbo.orders o WHERE o.order_id=?");
    $q->execute([$id]);$order=$q->fetch();$q->closeCursor();
    if(!$order)throw new OrderError('Order not found.',404);
    $notice=['orderId'=>(string)$id,'hasWarnings'=>false,'unavailableItems'=>[],'shortages'=>[],'checkedAt'=>gmdate('Y-m-d\TH:i:s\Z')];
    if($order['order_status']!=='received'||(bool)$order['paid'])return $notice;
    $q=$db->prepare('SELECT i.order_item_id,i.menu_item_id,i.item_name,i.quantity,CASE WHEN '.inventory_menu_condition().' THEN 1 ELSE 0 END available FROM dbo.order_items i JOIN dbo.menu_items m ON m.menu_item_id=i.menu_item_id WHERE i.order_id=? ORDER BY i.line_number');
    $q->execute([$id]);$lines=$q->fetchAll();$q->closeCursor();$items=[];
    foreach($lines as $line){
        $item=['id'=>(string)$line['menu_item_id'],'name'=>$line['item_name'],'quantity'=>(int)$line['quantity']];$items[(string)$line['order_item_id']]=$item;
        if(!(bool)$line['available'])$notice['unavailableItems'][]=$item;
    }
    $requirements=[];
    foreach(inventory_requirements($db,$lines) as $part){
        $key=$part['item_id'];$requirements[$key]??=['quantity'=>0,'items'=>[]];
        $requirements[$key]['quantity']+=$part['quantity'];
        $requirements[$key]['items'][(string)$part['order_item_id']]=$items[(string)$part['order_item_id']];
    }
    // Stay below SQL Server's parameter limit even for large multi-item recipes.
    foreach(array_chunk(array_keys($requirements),900) as $ids){
        $q=$db->prepare('SELECT i.inventory_item_id,i.item_name,i.is_active,u.unit_code,COALESCE((SELECT SUM(m.quantity_delta) FROM dbo.inventory_movements m WHERE m.inventory_item_id=i.inventory_item_id),0) balance FROM dbo.inventory_items i JOIN dbo.inventory_units u ON u.unit_id=i.unit_id WHERE i.inventory_item_id IN ('.implode(',',array_fill(0,count($ids),'?')).') ORDER BY i.item_name,i.inventory_item_id');
        $q->execute($ids);$stock=$q->fetchAll();$q->closeCursor();
        foreach($stock as $row){
            $needed=$requirements[(int)$row['inventory_item_id']];$balance=max(0,inventory_quantity($row['balance'],true));
            if((bool)$row['is_active']&&$balance>=$needed['quantity'])continue;
            $notice['shortages'][]=['id'=>(string)$row['inventory_item_id'],'name'=>$row['item_name'],'unit'=>$row['unit_code'],'active'=>(bool)$row['is_active'],
                'available'=>inventory_decimal($balance),'required'=>inventory_decimal($needed['quantity']),'items'=>array_values($needed['items'])];
        }
    }
    $notice['hasWarnings']=(bool)($notice['unavailableItems']||$notice['shortages']);return $notice;
}
function inventory_consume_order(PDO $db,int $id,int $actor):void {
    if(!$db->inTransaction())throw new LogicException('Order stock deductions require a transaction.');
    // A zero deduction cannot have a movement row. Keep a durable order marker so
    // a retry after restocking never deducts those skipped quantities retroactively.
    $q=$db->prepare("SELECT TOP 1 audit_id FROM dbo.system_audit_log WHERE entity_type='order' AND entity_key=? AND action='inventory_order_consumed'");$q->execute([(string)$id]);$done=$q->fetchColumn();$q->closeCursor();if($done)return;
    $q=$db->prepare("SELECT i.order_item_id,i.menu_item_id,i.quantity FROM dbo.order_items i WHERE i.order_id=? AND NOT EXISTS(SELECT 1 FROM dbo.inventory_movements m WHERE m.order_item_id=i.order_item_id AND m.movement_type='consumption') ORDER BY i.line_number");$q->execute([$id]);$lines=$q->fetchAll();$q->closeCursor();$parts=inventory_requirements($db,$lines);
    inventory_normalize_negative($db,$actor,array_column($parts,'item_id'));$remaining=[];$shortages=[];
    $q=$db->prepare("INSERT dbo.inventory_movements(inventory_item_id,movement_type,quantity_delta,order_item_id,recipe_ingredient_id,recorded_by_staff_id,reason) VALUES(?,'consumption',?,?,?,?,?)");
    foreach($parts as $part){
        $item=$part['item_id'];$remaining[$item]??=inventory_balance($db,$item);$used=min($part['quantity'],$remaining[$item]);$remaining[$item]-=$used;
        if($used>0){
            $reason=$used===$part['quantity']?'Deducted after cashier payment approval':'Stock stopped at zero: deducted '.inventory_decimal($used).' of '.inventory_decimal($part['quantity']).' required.';
            $q->execute([$item,inventory_decimal(-$used),$part['order_item_id'],$part['ingredient_id'],$actor,$reason]);
            $db->prepare('UPDATE dbo.inventory_items SET updated_at=SYSUTCDATETIME() WHERE inventory_item_id=?')->execute([$item]);
        }
        if($used<$part['quantity'])$shortages[]=['itemId'=>(string)$item,'orderItemId'=>(string)$part['order_item_id'],'recipeIngredientId'=>(string)$part['ingredient_id'],'required'=>inventory_decimal($part['quantity']),'deducted'=>inventory_decimal($used),'shortfall'=>inventory_decimal($part['quantity']-$used)];
    }
    $db->prepare("INSERT dbo.system_audit_log(actor_staff_id,action,entity_type,entity_key,details_json) VALUES(?,'inventory_order_consumed','order',?,?)")->execute([$actor,(string)$id,json_encode(['zeroFloor'=>true,'shortages'=>$shortages],JSON_THROW_ON_ERROR)]);
}
// Replace only the active recipe. Historical ingredient IDs remain available to paid orders.
function inventory_replace_recipe(PDO $db,int $menu,int $actor,array $lines):?int {
    $db->prepare('UPDATE dbo.menu_recipes SET is_active=0 WHERE menu_item_id=? AND is_active=1')->execute([$menu]);
    if(!$lines)return null;
    $q=$db->prepare('INSERT dbo.menu_recipes(menu_item_id,version_number,created_by_staff_id) OUTPUT INSERTED.recipe_id SELECT ?,COALESCE(MAX(version_number),0)+1,? FROM dbo.menu_recipes WHERE menu_item_id=?');
    $q->execute([$menu,$actor,$menu]);$recipe=(int)$q->fetchColumn();$q->closeCursor();
    $q=$db->prepare('INSERT dbo.recipe_ingredients(recipe_id,inventory_item_id,quantity_required) VALUES(?,?,?)');
    foreach($lines as [$stock,$quantity])$q->execute([$recipe,$stock,inventory_decimal($quantity)]);
    return $recipe;
}
function inventory_mutate(PDO $db,int $actor,array $input):array {
    inventory_lock($db);$key=$input['submission_key']??null;
    if(!is_string($key)||!preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i',$key))throw new OrderError('A valid stock submission key is required.');
    $hash=hash('sha256',json_encode($input,JSON_THROW_ON_ERROR));$q=$db->prepare('SELECT CONVERT(varchar(64),request_hash,2) hash,result_json FROM dbo.inventory_requests WHERE staff_id=? AND request_key=?');$q->execute([$actor,$key]);$old=$q->fetch();$q->closeCursor();
    if($old){if(!hash_equals(strtolower($old['hash']),$hash))throw new OrderError('This stock key was used for a different change.',409);return json_decode($old['result_json'],true,32,JSON_THROW_ON_ERROR)+['replayed'=>true];}
    inventory_normalize_negative($db,$actor);
    $action=$input['action']??'';
    if($action==='save_item'){
        $name=inventory_stock_text($input['name']??'',100,true,'stock_name','Stock item name');
        $category=inventory_stock_text($input['category']??'',40,true,'stock_category','Category');
        $unit=strtolower(inventory_stock_text($input['unit']??'',20,true,'stock_unit','Unit'));
        if(!preg_match('/\A[a-z][a-z0-9 ._-]{0,19}\z/',$unit))throw new OrderError('Enter one unit, such as kg, g, L, ml or pcs.',422,'stock_unit');
        $current=inventory_stock_quantity($input['current']??null,'stock_current','Current stock');
        $reorderInput=$input['reorder']??'0';if(is_string($reorderInput)&&trim($reorderInput)==='')$reorderInput='0';
        $reorder=inventory_stock_quantity($reorderInput,'stock_reorder','Reorder level');
        $note=inventory_stock_text($input['note']??'',500,false,'stock_note','Reason');
        $id=isset($input['id'])?orders_id($input['id']):null;
        $q=$db->prepare('SELECT inventory_item_id FROM dbo.inventory_items WHERE is_active=1 AND item_name=? AND inventory_item_id<>?');$q->execute([$name,$id??0]);$duplicate=$q->fetchColumn();$q->closeCursor();if($duplicate)throw new OrderError('An active stock item already uses this name. Edit that item or use a different name.',422,'stock_name');
        if($id){$item=inventory_item($db,$id);if(strtoupper((string)($input['version']??''))!==strtoupper($item['version']))throw new OrderError('This stock item changed. Refresh and review the current quantity.',409,'stock_changed');if(strcasecmp($unit,$item['unit_code'])!==0)throw new OrderError('The unit of an existing stock item cannot be changed.');$previous=inventory_balance($db,$id);
            $db->prepare('UPDATE dbo.inventory_items SET item_name=?,category=?,reorder_level=?,updated_at=SYSUTCDATETIME() WHERE inventory_item_id=?')->execute([$name,$category,inventory_decimal($reorder),$id]);
        }else{
            $q=$db->prepare('SELECT unit_id FROM dbo.inventory_units WHERE unit_code=?');$q->execute([$unit]);$unitId=$q->fetchColumn();$q->closeCursor();if(!$unitId){$q=$db->prepare('INSERT dbo.inventory_units(unit_code,unit_name) OUTPUT INSERTED.unit_id VALUES(?,?)');$q->execute([$unit,$unit]);$unitId=$q->fetchColumn();$q->closeCursor();}
            $q=$db->prepare('INSERT dbo.inventory_items(unit_id,item_name,category,reorder_level) OUTPUT INSERTED.inventory_item_id VALUES(?,?,?,?)');$q->execute([$unitId,$name,$category,inventory_decimal($reorder)]);$id=(int)$q->fetchColumn();$q->closeCursor();$previous=0;
        }
        $delta=$current-$previous;if($delta!==0){$type=$delta>0?'restock':'adjustment';if($delta<0&&$note==='')throw new OrderError('Enter a reason for reducing the stock count.',422,'stock_note');$db->prepare('INSERT dbo.inventory_movements(inventory_item_id,movement_type,quantity_delta,recorded_by_staff_id,reason) VALUES(?,?,?,?,?)')->execute([$id,$type,inventory_decimal($delta),$actor,$note?:'Opening stock / count update']);}
        $result=['item_id'=>(string)$id,'message'=>'Stock item saved.'];
    }elseif($action==='movement'){
        $id=orders_id($input['id']??null);$item=inventory_item($db,$id);$type=$input['type']??'';$amount=inventory_quantity($input['quantity']??null,true);$note=orders_text($input['note']??'',500,$type!=='restock');
        if(!in_array($type,['restock','waste','adjustment'],true)||$amount===0||($type==='restock'&&$amount<0)||($type==='waste'&&$amount>0))throw new OrderError('Restock must be positive; waste must be negative; adjustment must be nonzero.');
        $balance=inventory_balance($db,$id)+$amount;if(($balance<0&&$amount<0)||$balance>999999999999)throw new OrderError('The movement would reduce stock below zero or exceed its limit.');
        $db->prepare('INSERT dbo.inventory_movements(inventory_item_id,movement_type,quantity_delta,recorded_by_staff_id,reason) VALUES(?,?,?,?,?)')->execute([$id,$type,inventory_decimal($amount),$actor,$note?:'Stock received']);$db->prepare('UPDATE dbo.inventory_items SET updated_at=SYSUTCDATETIME() WHERE inventory_item_id=?')->execute([$id]);$result=['item_id'=>(string)$id,'message'=>$type==='restock'?'Stock added.':'Stock movement saved.'];
    }elseif($action==='remove_item'){
        $id=orders_id($input['id']??null);$item=inventory_item($db,$id);
        if(!is_string($input['version']??null)||strtoupper($input['version'])!==strtoupper($item['version']))throw new OrderError('This stock item changed. Refresh and review it before removing.',409,'stock_changed');
        $q=$db->prepare('SELECT DISTINCT mr.recipe_id,mr.menu_item_id FROM dbo.menu_recipes mr JOIN dbo.recipe_ingredients ri ON ri.recipe_id=mr.recipe_id WHERE mr.is_active=1 AND ri.inventory_item_id=?');
        $q->execute([$id]);$recipes=$q->fetchAll();$q->closeCursor();
        $remaining=$db->prepare('SELECT inventory_item_id,quantity_required FROM dbo.recipe_ingredients WHERE recipe_id=? AND inventory_item_id<>? ORDER BY inventory_item_id');
        foreach($recipes as $recipe){
            $remaining->execute([$recipe['recipe_id'],$id]);$rows=$remaining->fetchAll();$remaining->closeCursor();
            $lines=array_map(fn($row)=>[(int)$row['inventory_item_id'],inventory_quantity($row['quantity_required'])],$rows);
            inventory_replace_recipe($db,(int)$recipe['menu_item_id'],$actor,$lines);
        }
        $db->prepare('UPDATE dbo.inventory_items SET is_active=0,updated_at=SYSUTCDATETIME() WHERE inventory_item_id=?')->execute([$id]);
        $result=['item_id'=>(string)$id,'removed_recipe_links'=>count($recipes),'message'=>'Stock item removed.'];
    }elseif($action==='save_recipe'){
        $menu=orders_id($input['menu_id']??null);$q=$db->prepare('SELECT m.menu_item_id FROM dbo.menu_items m WHERE m.menu_item_id=? AND '.menu_active_condition());$q->execute([$menu]);$exists=$q->fetchColumn();$q->closeCursor();if(!$exists)throw new OrderError('Menu item not found.',404);
        $q=$db->prepare('SELECT recipe_id FROM dbo.menu_recipes WHERE menu_item_id=? AND is_active=1');$q->execute([$menu]);$oldId=$q->fetchColumn();$q->closeCursor();if((string)($input['recipe_id']??'')!==(string)($oldId?:''))throw new OrderError('This recipe changed. Refresh before saving.',409,'recipe_changed');
        $ingredients=$input['ingredients']??null;if(!is_array($ingredients)||!array_is_list($ingredients)||count($ingredients)<1||count($ingredients)>50)throw new OrderError('Use between 1 and 50 ingredient lines.');$seen=[];$lines=[];
        foreach($ingredients as $ingredient){if(!is_array($ingredient))throw new OrderError('Invalid ingredient line.');$stock=orders_id($ingredient['item_id']??null);inventory_item($db,$stock);$quantity=inventory_quantity($ingredient['quantity']??null);if($quantity<1||isset($seen[$stock]))throw new OrderError('Each ingredient must appear once with a positive quantity.');$seen[$stock]=true;$lines[]=[$stock,$quantity];}
        $recipe=inventory_replace_recipe($db,$menu,$actor,$lines);$result=['recipe_id'=>(string)$recipe,'message'=>'Bill of Materials saved.'];
    }else throw new OrderError('Unknown inventory action.');
    $db->prepare('INSERT dbo.inventory_requests(staff_id,request_key,request_hash,result_json) VALUES(?,?,CONVERT(binary(32),?,2),?)')->execute([$actor,$key,$hash,json_encode($result,JSON_THROW_ON_ERROR)]);return $result+['replayed'=>false];
}
// Staff may read these reminders without access to the admin-only inventory editor.
function inventory_stock_alerts(PDO $db):array {
    $rows=$db->query("SELECT i.inventory_item_id id,i.item_name name,u.unit_code unit,
        COALESCE(b.quantity,0) [current],i.reorder_level reorder
        FROM dbo.inventory_items i JOIN dbo.inventory_units u ON u.unit_id=i.unit_id
        LEFT JOIN (SELECT inventory_item_id,SUM(quantity_delta) quantity FROM dbo.inventory_movements GROUP BY inventory_item_id) b ON b.inventory_item_id=i.inventory_item_id
        WHERE i.is_active=1 AND (COALESCE(b.quantity,0)<=i.reorder_level OR EXISTS(
            SELECT 1 FROM dbo.recipe_ingredients ri JOIN dbo.menu_recipes mr ON mr.recipe_id=ri.recipe_id
            JOIN dbo.menu_items m ON m.menu_item_id=mr.menu_item_id
            WHERE ri.inventory_item_id=i.inventory_item_id AND mr.is_active=1 AND ".menu_active_condition()." AND COALESCE(b.quantity,0)<ri.quantity_required))
        ORDER BY CASE WHEN COALESCE(b.quantity,0)<=0 THEN 0 ELSE 1 END,i.item_name")->fetchAll();
    if(!$rows)return [];
    $menus=[];
    foreach($db->query('SELECT DISTINCT ri.inventory_item_id,m.item_name FROM dbo.recipe_ingredients ri JOIN dbo.menu_recipes mr ON mr.recipe_id=ri.recipe_id JOIN dbo.menu_items m ON m.menu_item_id=mr.menu_item_id WHERE mr.is_active=1 AND '.menu_active_condition().' ORDER BY m.item_name')->fetchAll() as $link)$menus[(string)$link['inventory_item_id']][]=$link['item_name'];
    return array_map(function($row)use($menus){
        $current=max(0,inventory_quantity($row['current'],true));
        return ['id'=>(string)$row['id'],'name'=>$row['name'],'unit'=>$row['unit'],'current'=>inventory_decimal($current),'reorder'=>inventory_decimal(inventory_quantity($row['reorder'])),'status'=>$current<=0?'out':'low','menus'=>$menus[(string)$row['id']]??[]];
    },$rows);
}
function inventory_snapshot(PDO $db,int $offset=0):array {
    if($offset<0||$offset>1000000)throw new OrderError('Invalid movement page.');
    $items=$db->query("SELECT i.inventory_item_id id,i.item_name name,i.category,u.unit_code unit,i.reorder_level reorder,CONVERT(varchar(16),i.record_version,2) version,COALESCE((SELECT SUM(m.quantity_delta) FROM dbo.inventory_movements m WHERE m.inventory_item_id=i.inventory_item_id),0) [current] FROM dbo.inventory_items i JOIN dbo.inventory_units u ON u.unit_id=i.unit_id WHERE i.is_active=1 ORDER BY i.item_name")->fetchAll();
    foreach($items as &$item){$item['id']=(string)$item['id'];$item['current']=inventory_decimal(max(0,inventory_quantity($item['current'],true)));$item['reorder']=inventory_decimal(inventory_quantity($item['reorder']));$item['linkedMenu']='';}unset($item);
    $recipes=$db->query('SELECT r.recipe_id id,r.menu_item_id menuId,r.version_number version,m.item_name menu FROM dbo.menu_recipes r JOIN dbo.menu_items m ON m.menu_item_id=r.menu_item_id WHERE r.is_active=1 AND '.menu_active_condition().' ORDER BY m.item_name')->fetchAll();
    foreach($recipes as &$recipe){$recipe['id']=(string)$recipe['id'];$q=$db->prepare('SELECT i.inventory_item_id item_id,i.item_name item,ri.quantity_required qty,u.unit_code unit FROM dbo.recipe_ingredients ri JOIN dbo.inventory_items i ON i.inventory_item_id=ri.inventory_item_id JOIN dbo.inventory_units u ON u.unit_id=i.unit_id WHERE ri.recipe_id=? ORDER BY i.item_name');$q->execute([$recipe['id']]);$recipe['ingredients']=$q->fetchAll();$q->closeCursor();foreach($recipe['ingredients'] as $line)foreach($items as &$item)if($item['id']===(string)$line['item_id'])$item['linkedMenu'].=($item['linkedMenu']?', ':'').$recipe['menu'];unset($item);}unset($recipe);
    $impact=$db->query('SELECT m.menu_item_id id,m.item_name name FROM dbo.menu_items m WHERE '.menu_active_condition().' AND NOT ('.inventory_stock_condition().') ORDER BY m.item_name')->fetchAll();
    $q=$db->prepare("SELECT im.movement_id id,im.movement_type type,im.quantity_delta quantity,im.recorded_at time,im.reason note,ii.item_name item,u.unit_code unit,staff.full_name recordedBy,o.order_number orderNumber FROM dbo.inventory_movements im JOIN dbo.inventory_items ii ON ii.inventory_item_id=im.inventory_item_id JOIN dbo.inventory_units u ON u.unit_id=ii.unit_id LEFT JOIN dbo.staff_users staff ON staff.staff_id=im.recorded_by_staff_id LEFT JOIN dbo.order_items oi ON oi.order_item_id=im.order_item_id LEFT JOIN dbo.orders o ON o.order_id=oi.order_id ORDER BY im.movement_id DESC OFFSET ? ROWS FETCH NEXT 51 ROWS ONLY");$q->bindValue(1,$offset,PDO::PARAM_INT);$q->execute();$movements=$q->fetchAll();$q->closeCursor();$more=count($movements)>50;
    $menus=$db->query('SELECT m.menu_item_id id,m.item_name name FROM dbo.menu_items m WHERE '.menu_active_condition().' ORDER BY m.item_name')->fetchAll();
    return ['items'=>$items,'recipes'=>$recipes,'menus'=>$menus,'impact'=>$impact,'movements'=>array_slice($movements,0,50),'nextOffset'=>$more?$offset+50:null];
}
