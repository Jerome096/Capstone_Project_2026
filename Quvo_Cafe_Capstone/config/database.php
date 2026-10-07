<?php
declare(strict_types=1);

// Local development uses the Windows identity running PHP. No password is stored here.
function quvo_db(): PDO
{
    static $db = null;
    if ($db === null) {
        $db = new PDO(
            "sqlsrv:Server=localhost\\SQLEXPRESS;Database=QuvoCafeDB;Encrypt=yes;TrustServerCertificate=yes",
            null,
            null,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ],
        );
    }
    return $db;
}
