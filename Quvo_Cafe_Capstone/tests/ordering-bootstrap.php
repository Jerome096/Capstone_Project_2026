<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/orders.php';
ordering_assert_backend();
try {
    ordering_assert_backend(true);
    throw new RuntimeException('Incomplete online backend was accepted.');
} catch(OrderError $error) {
    if($error->status!==503 || $error->errorCode!=='ordering_files_required')throw $error;
    echo "PASS: incomplete online backend is identified without opening ordering.\n";
}
require_once __DIR__.'/../includes/online.php';
ordering_assert_backend(true);
echo "PASS: complete dine-in and online backend is ready.\n";
