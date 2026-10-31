<?php
declare(strict_types=1);
require_once __DIR__.'/../../includes/auth.php';
require_once __DIR__.'/../../includes/online.php';
header('Cache-Control: no-store');
try {
    if($_SERVER['REQUEST_METHOD']!=='GET')throw new OrderError('Use GET.',405);
    ordering_assert_backend(true);
    // The sign-in page needs only public availability and the logout countdown.
    quvo_json(['ok'=>true,'ordering'=>ordering_status(quvo_db())]);
}catch(Throwable $error){orders_error(null,$error);}
