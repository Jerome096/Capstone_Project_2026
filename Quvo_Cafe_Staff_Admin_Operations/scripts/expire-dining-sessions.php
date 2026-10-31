<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/dining.php';
require_once __DIR__ . '/../includes/assistance.php';
try {
    echo 'Expired sessions: ' . dining_expire_sessions(quvo_db()) . PHP_EOL;
    assistance_expire(quvo_db());
} catch (Throwable $error) {
    fwrite(STDERR, 'Session expiry failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
