<?php
declare(strict_types=1);
require_once __DIR__.'/../../config/database.php';
require_once __DIR__.'/../../includes/menu.php';
require_once __DIR__.'/../../includes/auth.php';
try{
    if($_SERVER['REQUEST_METHOD']!=='GET')throw new OrderError('Use GET for menu photos.',405);
    menu_image_send(quvo_db(),$_GET['id']??null,$_GET['version']??null);
}catch(Throwable $error){orders_error(null,$error);}
