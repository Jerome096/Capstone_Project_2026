<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/delivery.php';
function delivery_test_settings(PDO $db,array $changes=[]):array {
    if(!$db->inTransaction())throw new LogicException('Delivery fixtures require a rollback transaction.');
    $saved=website_content_read($db);$content=array_replace($saved['content'],['address'=>'Quvo test pickup address','phone'=>'09778010771','social'=>'https://www.facebook.com/QuvoCafe'],$changes);
    $actor=(int)$db->query("SELECT TOP 1 staff_id FROM dbo.staff_users WHERE is_active=1 ORDER BY staff_id")->fetchColumn();
    website_content_save($db,['role'=>'admin','staff_id'=>$actor],$content,$saved['version']);
    return delivery_settings($db);
}
function delivery_test_payload(PDO $db,string $png):array {
    return ['delivery_flow'=>'lalamove-v1','delivery_config_version'=>delivery_settings($db)['version'],'booking_image'=>'data:image/png;base64,'.base64_encode($png)];
}
