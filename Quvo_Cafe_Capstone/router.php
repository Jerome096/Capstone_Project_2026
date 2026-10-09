<?php
declare(strict_types=1);
// The PHP development router serves both apps on one origin and hides private project files.
$path = rawurldecode(parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH) ?: "/");
if (
    str_contains($path, "\0") ||
    preg_match('~(?:^|/)\.[^/]*|(?:^|/)(?:config|includes|node_modules|vendor)(?:/|$)~i', $path)
) {
    http_response_code(404);
    exit("Not found");
}
if (str_starts_with($path, "/customer/")) {
    $root = realpath(__DIR__ . "/../Quvo_Cafe_Customer_Branded(3)");
    $relative = substr($path, 10) ?: "index.html";
    $file = realpath($root . "/" . $relative);
    if (
        !$file ||
        !str_starts_with(str_replace("\\", "/", $file), str_replace("\\", "/", $root) . "/") ||
        !is_file($file)
    ) {
        http_response_code(404);
        exit("Not found");
    }
    if (in_array($relative, ["api/session.php", "api/orders.php", "api/assistance.php"], true)) {
        require $file;
        return true;
    }
    $types = [
        "html" => "text/html; charset=utf-8",
        "css" => "text/css",
        "js" => "text/javascript",
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "svg" => "image/svg+xml",
    ];
    $type = $types[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? null;
    if (!$type) {
        http_response_code(404);
        exit("Not found");
    }
    header("Content-Type: " . $type);
    readfile($file);
    return true;
}
if ($path === "/customer") {
    header("Location: /customer/");
    return true;
}
if (preg_match('~\.(?:sql|md|json|txt|log|bak|zip)$~i', $path)) {
    http_response_code(404);
    exit("Not found");
}
return false;
