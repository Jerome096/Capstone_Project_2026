<?php
declare(strict_types=1);
require_once __DIR__ . "/../../includes/auth.php";
require_once __DIR__ . "/../../includes/accounts.php";
quvo_start_session();
if (!in_array($_SERVER["REQUEST_METHOD"], ["GET", "POST"], true)) {
    header("Allow: GET, POST");
    quvo_json(["ok" => false, "error" => "Unsupported request."], 405);
}
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    quvo_require_post();
}
$db = null;
try {
    $actor = quvo_current_user();
    if (!$actor) {
        quvo_json(
            ["ok" => false, "error" => "Your session has ended. Please sign in again."],
            401,
        );
    }
    if ($actor["role"] !== "admin" || empty($_SESSION["admin_confirmed"])) {
        quvo_json(
            [
                "ok" => false,
                "error" => "Open the Admin workspace and confirm your access first.",
            ],
            403,
        );
    }
    $db = quvo_db();
    if ($_SERVER["REQUEST_METHOD"] === "GET") {
        quvo_json(["ok" => true, "staff" => account_list($db), "user" => $actor]);
    }
    $input = json_decode(file_get_contents("php://input"), true);
    if (!is_array($input)) {
        throw new AccountInputError("Invalid account request.");
    }
    $db->beginTransaction();
    $result = account_change($db, $actor, $input);
    $db->commit();
    if (isset($result["credential_stamp"])) {
        $_SESSION["credential_stamp"] = $result["credential_stamp"];
        unset($result["credential_stamp"]);
    }
    quvo_json(["ok" => true] + $result);
} catch (Throwable $error) {
    if ($db && $db->inTransaction()) {
        $db->rollBack();
    }
    if ($error instanceof AccountInputError) {
        quvo_json(["ok" => false, "error" => $error->getMessage()], 422);
    }
    if (
        $error instanceof PDOException &&
        in_array((int) ($error->errorInfo[1] ?? 0), [2601, 2627], true)
    ) {
        quvo_json(["ok" => false, "error" => "That username is already in use."], 409);
    }
    error_log("Quvo accounts failed: " . $error->getMessage());
    quvo_json(
        [
            "ok" => false,
            "error" =>
                "Account request could not be completed. Please refresh and try again.",
        ],
        503,
    );
}
