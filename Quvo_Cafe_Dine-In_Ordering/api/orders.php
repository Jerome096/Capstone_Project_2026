<?php
declare(strict_types=1);
require_once __DIR__ . "/../../Quvo_Cafe_Staff_Admin_Operations/includes/guest.php";
require_once __DIR__ . "/../../Quvo_Cafe_Staff_Admin_Operations/includes/orders.php";
require_once __DIR__ . "/../../Quvo_Cafe_Staff_Admin_Operations/includes/payment-images.php";
$csrf = quvo_start_guest_session();
$db = null;
try {
    $method = $_SERVER["REQUEST_METHOD"];
    if (!in_array($method, ["GET", "POST"], true)) {
        header("Allow: GET, POST");
        throw new OrderError("Unsupported request.", 405);
    }
    if ($method === "POST" && !hash_equals($csrf, $_SERVER["HTTP_X_CSRF_TOKEN"] ?? "")) {
        throw new OrderError("Refresh this page and try again.", 403);
    }
    $code = $_GET["table"] ?? "";
    if (!is_string($code) || !preg_match('/\A[A-Za-z0-9-]{1,20}\z/', $code)) {
        throw new OrderError("Please scan a valid table QR code.");
    }
    $db = quvo_db();
    $query = $db->prepare("SELECT table_id FROM dbo.cafe_tables WHERE table_code=?");
    $query->execute([$code]);
    $tableId = $query->fetchColumn();
    if ($tableId === false) {
        throw new OrderError("This table is not registered.", 404);
    }
    $tableId = (int) $tableId;
    $token = quvo_guest_table_token($db,$tableId);
    dining_expire_sessions($db, $tableId);
    if ($method === "POST") {
        $input = orders_input(6291456);
        if (($input["action"] ?? "") !== "submit") {
            throw new OrderError("Unknown order action.");
        }
        $db->beginTransaction();
        $result = orders_submit($db, $tableId, $token, $input);
        $db->commit();
        unset($result["order"]["received_by_staff_id"]);
        quvo_json(["ok" => true, "csrf" => $csrf] + $result, $result["replayed"] ? 200 : 201);
    }
    // History remains available to the owning browser after its visit is closed.
    $session = dining_guest_session($db, $tableId, $token);
    if (!$session) {
        throw new OrderError("Your customer session was not found.", 403);
    }
    $sessionId = (int) $session["session_id"];
    $view=$_GET['view']??'';
    if($view==='receipt')payment_send_image(payment_receipt_image($db,orders_id($_GET['id']??null),null,$sessionId),'dine-in-payment-receipt');
    if(in_array($view,['payments','payment-qr'],true)){
        $q=$db->prepare('SELECT is_active FROM dbo.cafe_tables WHERE table_id=?');$q->execute([$tableId]);$active=(bool)$q->fetchColumn();$q->closeCursor();
        if(!$active||$session['status']!=='active')throw new OrderError('An active, approved table session is required for QR payments.',403);
        if($view==='payment-qr')payment_send_image(payment_qr_image($db,$_GET['method']??null,$_GET['version']??null,false),'dine-in-payment-qr',isset($_GET['download']));
        $methods=array_filter(payment_qr_methods($db,false),fn($entry)=>$entry['available']);
        quvo_json(['ok'=>true,'csrf'=>$csrf,'methods'=>(object)$methods]);
    }
    if (isset($_GET["id"])) {
        $order = orders_get($db, orders_id($_GET["id"]), $sessionId);
        unset($order["received_by_staff_id"]);
        quvo_json(["ok" => true, "csrf" => $csrf, "order" => $order]);
    }
    $result = orders_list($db, $sessionId, $_GET["status"] ?? "all", $_GET["offset"] ?? "0");
    foreach ($result["orders"] as &$order) {
        unset($order["received_by_staff_id"]);
    }
    unset($order);
    quvo_json(["ok" => true, "csrf" => $csrf] + $result);
} catch (Throwable $error) {
    orders_error($db, $error);
}
