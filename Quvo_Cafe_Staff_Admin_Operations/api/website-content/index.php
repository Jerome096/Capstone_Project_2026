<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/website-content.php';
$db=null;
try {
    $actor=quvo_current_user();
    if (!$actor) throw new OrderError('Please sign in first.',401);
    website_content_actor($actor);
    if(empty($_SESSION['admin_confirmed'])) throw new OrderError('Confirm admin access before editing website content.',403);
    $db=quvo_db();
    if ($_SERVER['REQUEST_METHOD']==='GET') quvo_json(['ok'=>true]+website_content_read($db));
    quvo_require_post();
    $input=orders_input(65536);
    if (($input['action']??'')!=='save') throw new OrderError('Choose a valid website content action.');
    if (website_content_read($db)['setupRequired']) throw new OrderError('Website content storage is not ready. Complete the website update and try again.',503,'content_setup_required');
    $db->beginTransaction();
    $result=website_content_save($db,$actor,$input['content']??null,$input['version']??null);
    $db->commit();quvo_json(['ok'=>true]+$result);
} catch (Throwable $error) {orders_error($db,$error);}
