<?php
declare(strict_types=1);
require_once __DIR__.'/orders.php';

function menu_metadata(array $row,string $imagePath):array {
    return ['optionGroups'=>menu_groups($row),'optionVersion'=>menu_options_version($row),'customOptionsConfigured'=>($row['option_groups_json']??null)!==null,
        'imageUrl'=>empty($row['image_version'])?null:$imagePath.'id='.(int)($row['menu_item_id']??$row['id']).'&version='.rawurlencode($row['image_version'])];
}
function menu_image_input(mixed $value):?array {
    if($value===null)return null;
    if(!is_string($value)||strlen($value)>2796230||!preg_match('~\Adata:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)\z~',$value,$match))throw new OrderError('Choose a valid menu photo.');
    $bytes=base64_decode($match[2],true);$info=$bytes!==false?@getimagesizefromstring($bytes):false;
    if(!$info||strlen($bytes)>2097152||$info['mime']!=='image/'.$match[1]||$info[0]>8000||$info[1]>8000||$info[0]*$info[1]>16000000)throw new OrderError('The menu photo is invalid or too large. Choose a different image.');
    return ['mime'=>$info['mime'],'bytes'=>$bytes];
}
function menu_image_send(PDO $db,mixed $id,mixed $version):never {
    $id=orders_id($id);
    if(!is_string($version)||!preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i',$version))throw new OrderError('Menu photo not found.',404);
    $q=$db->prepare('SELECT image_mime,CONVERT(varchar(max),image_bytes,2) image_hex FROM dbo.menu_item_images WHERE menu_item_id=? AND image_version=CONVERT(uniqueidentifier,?)');
    $q->execute([$id,$version]);$image=$q->fetch();$q->closeCursor();
    if(!$image)throw new OrderError('Menu photo not found.',404);
    if(session_status()===PHP_SESSION_ACTIVE)session_write_close();
    header('Content-Type: '.$image['image_mime']);header('X-Content-Type-Options: nosniff');
    header('Content-Security-Policy: default-src \'none\'; sandbox');
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Disposition: inline; filename="menu-'.$id.($image['image_mime']==='image/png'?'.png':'.jpg').'"');
    echo hex2bin($image['image_hex']);exit;
}
function menu_rows(PDO $db,?int $id=null):array {
    $sql='SELECT m.menu_item_id,m.item_name,m.category,m.price,m.is_available,m.option_groups_json,CONVERT(varchar(36),i.image_version) image_version,CASE WHEN '.inventory_menu_condition().' THEN 1 ELSE 0 END effective_available,CASE WHEN '.inventory_stock_condition().' THEN 1 ELSE 0 END stock_available FROM dbo.menu_items m LEFT JOIN dbo.menu_item_images i ON i.menu_item_id=m.menu_item_id';
    $q=$db->prepare($sql.' WHERE '.menu_active_condition().($id===null?' ORDER BY m.menu_item_id DESC':' AND m.menu_item_id=?'));$q->execute($id===null?[]:[$id]);$rows=$q->fetchAll();$q->closeCursor();
    return array_map(fn($row)=>['id'=>(int)$row['menu_item_id'],'name'=>$row['item_name'],'category'=>$row['category'],'price'=>(float)$row['price'],
        'manualAvailable'=>(bool)$row['is_available'],'inventoryBlocked'=>false,'stockWarning'=>!(bool)$row['stock_available'],'available'=>(bool)$row['effective_available']]+menu_metadata($row,'../api/menu-image/index.php?'),$rows);
}
// The caller owns the transaction. Retain snapshots, recipes and photos needed
// by past orders and orders still awaiting payment; retrying removal is safe.
function menu_remove(PDO $db,int $id,int $actor):void {
    inventory_lock($db);
    $q=$db->prepare('SELECT m.item_name,CASE WHEN '.menu_active_condition().' THEN 1 ELSE 0 END active FROM dbo.menu_items m WITH(UPDLOCK,HOLDLOCK) WHERE m.menu_item_id=?');
    $q->execute([$id]);$item=$q->fetch();$q->closeCursor();
    if(!$item)throw new OrderError('This item no longer exists. Refresh the menu.',404);
    $db->prepare('UPDATE dbo.menu_items SET is_available=0,updated_at=SYSUTCDATETIME() WHERE menu_item_id=?')->execute([$id]);
    if(!(bool)$item['active'])return;
    $db->prepare("INSERT dbo.system_audit_log(actor_staff_id,action,entity_type,entity_key,details_json) VALUES(?,'menu_item_removed','menu_item',?,?)")
        ->execute([$actor,(string)$id,json_encode(['name'=>$item['item_name']],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
}
// The caller owns the transaction; menu settings and its image change together.
function menu_save(PDO $db,array $input):array {
    $id=isset($input['id'])?orders_id($input['id']):null;
    $name=orders_text($input['name']??null,100,true);$category=$input['category']??null;$price=$input['price']??null;$available=$input['available']??null;
    if(!in_array($category,array_merge(QUVO_MENU_CATEGORIES,QUVO_LEGACY_MENU_CATEGORIES),true)||!is_string($price)||!preg_match('/\A\d{1,8}(\.\d{1,2})?\z/',$price)||!is_bool($available))throw new OrderError('Enter a valid category, price and availability.');
    $hasGroups=array_key_exists('optionGroups',$input);$groups=$hasGroups?menu_validate_groups($input['optionGroups']):null;
    $hasImage=array_key_exists('image',$input);$image=$hasImage?menu_image_input($input['image']):null;
    inventory_lock($db);
    if($id!==null){
        $q=$db->prepare('SELECT m.option_groups_json,m.category FROM dbo.menu_items m WITH(UPDLOCK,HOLDLOCK) WHERE m.menu_item_id=? AND '.menu_active_condition());$q->execute([$id]);$old=$q->fetch();$q->closeCursor();
        if(!$old)throw new OrderError('This menu item was removed. Refresh the menu.',404);
        $oldGroups=menu_groups($old);$hasCheckbox=in_array('checkbox',array_column($oldGroups,'type'),true);
        if($hasGroups&&(array_key_exists('optionVersion',$input)||menu_has_pricing($oldGroups)||$hasCheckbox)){
            if(!is_string($input['optionVersion']??null)||!hash_equals(menu_options_version($old),$input['optionVersion']))throw new OrderError('Menu options or prices changed. Reload this item before saving; your draft has not been published.',409,'options_changed');
        }
        if($hasGroups&&$hasCheckbox&&($input['checkboxOptionsSupported']??false)!==true){
            foreach($oldGroups as $oldGroup)if($oldGroup['type']==='checkbox'){
                $matching=array_values(array_filter($groups,fn($group)=>$group['id']===$oldGroup['id']&&$group['type']==='checkbox'));
                if($matching===[])throw new OrderError('Reload the admin page before changing checkbox add-ons. Your draft has not been published.',409,'options_changed');
            }
        }
    }
    // inventory_lock serializes menu saves/removals, including two admins adding
    // the same name at once. Explicit CI collation also covers case-sensitive DBs.
    $q=$db->prepare('SELECT TOP (1) m.menu_item_id FROM dbo.menu_items m WITH(UPDLOCK,HOLDLOCK) WHERE m.category=? AND m.menu_item_id<>? AND LTRIM(RTRIM(m.item_name)) COLLATE Latin1_General_100_CI_AS=CONVERT(nvarchar(100),?) COLLATE Latin1_General_100_CI_AS AND '.menu_active_condition());
    $q->execute([$category,$id??0,$name]);$duplicate=$q->fetchColumn();$q->closeCursor();
    if($duplicate!==false)throw new OrderError('An item with this name already exists in this category. Choose a different name or category.',409,'duplicate_menu_name');
    $json=$hasGroups?json_encode($groups,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR):($old['option_groups_json']??null);
    if($id===null){
        $q=$db->prepare('INSERT dbo.menu_items(item_name,category,price,is_available,option_groups_json) OUTPUT INSERTED.menu_item_id VALUES(?,?,?,?,?)');
        $q->execute([$name,$category,$price,$available?1:0,$json]);$id=(int)$q->fetchColumn();$q->closeCursor();
    }else{
        $db->prepare('UPDATE dbo.menu_items SET item_name=?,category=?,price=?,is_available=?,option_groups_json=?,updated_at=SYSUTCDATETIME() WHERE menu_item_id=?')->execute([$name,$category,$price,$available?1:0,$json,$id]);
    }
    if($hasImage){
        if($image===null)$db->prepare('DELETE dbo.menu_item_images WHERE menu_item_id=?')->execute([$id]);
        else{
            $q=$db->prepare('SELECT menu_item_id FROM dbo.menu_item_images WITH(UPDLOCK,HOLDLOCK) WHERE menu_item_id=?');$q->execute([$id]);$exists=$q->fetchColumn();$q->closeCursor();
            if($exists)$db->prepare('UPDATE dbo.menu_item_images SET image_mime=?,image_bytes=CONVERT(varbinary(max),?,2),image_version=NEWID(),updated_at=SYSUTCDATETIME() WHERE menu_item_id=?')->execute([$image['mime'],bin2hex($image['bytes']),$id]);
            else $db->prepare('INSERT dbo.menu_item_images(menu_item_id,image_mime,image_bytes) VALUES(?,?,CONVERT(varbinary(max),?,2))')->execute([$id,$image['mime'],bin2hex($image['bytes'])]);
        }
    }
    return menu_rows($db,$id)[0];
}
