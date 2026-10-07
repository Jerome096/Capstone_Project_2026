<?php
declare(strict_types=1);

require_once __DIR__ . "/../../includes/auth.php";

function formatMenuItem(array $row): array
{
    return [
        "id" => (int) $row["menu_item_id"],
        "name" => $row["item_name"],
        "category" => $row["category"],
        "price" => (float) $row["price"],
        "available" => (bool) $row["is_available"],
    ];
}

try {
    $user = quvo_current_user();

    if (!$user) {
        quvo_json(
            [
                "ok" => false,
                "error" => "Please sign in first.",
            ],
            401,
        );
    }

    $method = $_SERVER["REQUEST_METHOD"];

    // Load menu items.
    if ($method === "GET") {
        $query = quvo_db()->query(
            'SELECT menu_item_id, item_name, category, price, is_available
             FROM dbo.menu_items
             ORDER BY menu_item_id DESC',
        );

        quvo_json([
            "ok" => true,
            "items" => array_map("formatMenuItem", $query->fetchAll()),
        ]);
    }

    // Check the request method and session CSRF token.
    quvo_require_post();

    if ($user["role"] !== "admin") {
        quvo_json(
            [
                "ok" => false,
                "error" => "Only admins can edit the menu.",
            ],
            403,
        );
    }

    try {
        $input = json_decode(
            file_get_contents("php://input"),
            true,
            32,
            JSON_THROW_ON_ERROR,
        );
    } catch (JsonException $error) {
        quvo_json(["ok" => false, "error" => "Invalid request."], 400);
    }

    if (!is_array($input)) {
        quvo_json(["ok" => false, "error" => "Invalid menu item."], 422);
    }

    $id = $input["id"] ?? null;
    $action = $input["action"] ?? "save";
    if (!in_array($action, ["save", "delete"], true)) {
        quvo_json(["ok" => false, "error" => "Invalid menu action."], 422);
    }

    if ($action === "delete") {
        if (!is_int($id) || $id < 1) {
            quvo_json(["ok" => false, "error" => "Invalid menu item ID."], 422);
        }
        $query = quvo_db()->prepare(
            "DELETE FROM dbo.menu_items OUTPUT DELETED.menu_item_id WHERE menu_item_id = ?",
        );
        $query->execute([$id]);
        if ($query->fetchColumn() === false) {
            quvo_json(
                [
                    "ok" => false,
                    "error" => "This item no longer exists. Refresh the page.",
                ],
                404,
            );
        }
        quvo_json(["ok" => true, "id" => $id]);
    }

    $name = is_string($input["name"] ?? null) ? trim($input["name"]) : "";
    $category = $input["category"] ?? null;
    $price = $input["price"] ?? null;
    $available = $input["available"] ?? null;

    // SQL Server counts supplementary Unicode characters as two units.
    $nameUnits = preg_replace("/[\x{10000}-\x{10FFFF}]/u", "xx", $name);

    if (
        $nameUnits === null ||
        !preg_match('/^.{1,100}$/usD', $nameUnits) ||
        !in_array($category, ["coffee", "non-coffee", "food", "pastry"], true) ||
        !is_string($price) ||
        !preg_match('/^\d{1,8}(\.\d{1,2})?$/D', $price) ||
        !is_bool($available) ||
        ($id !== null && (!is_int($id) || $id < 1))
    ) {
        quvo_json(
            [
                "ok" => false,
                "error" =>
                    "Enter a name of up to 100 characters, a valid category, and a price from 0 to 99999999.99 with at most two decimals.",
            ],
            422,
        );
    }

    $values = [$name, $category, $price, $available ? 1 : 0];

    if ($id === null) {
        $sql = '
            INSERT INTO dbo.menu_items
                (item_name, category, price, is_available)
            OUTPUT
                INSERTED.menu_item_id,
                INSERTED.item_name,
                INSERTED.category,
                INSERTED.price,
                INSERTED.is_available
            VALUES (?, ?, ?, ?)
        ';
    } else {
        $sql = '
            UPDATE dbo.menu_items
            SET item_name = ?,
                category = ?,
                price = ?,
                is_available = ?,
                updated_at = SYSUTCDATETIME()
            OUTPUT
                INSERTED.menu_item_id,
                INSERTED.item_name,
                INSERTED.category,
                INSERTED.price,
                INSERTED.is_available
            WHERE menu_item_id = ?
        ';

        $values[] = $id;
    }

    $query = quvo_db()->prepare($sql);
    $query->execute($values);
    $item = $query->fetch();

    if (!$item) {
        quvo_json(
            [
                "ok" => false,
                "error" => "This item no longer exists. Refresh the page.",
            ],
            404,
        );
    }

    quvo_json(
        [
            "ok" => true,
            "item" => formatMenuItem($item),
        ],
        $id === null ? 201 : 200,
    );
} catch (Throwable $error) {
    error_log("Menu request failed: " . $error->getMessage());

    quvo_json(
        [
            "ok" => false,
            "error" => "Unable to access the menu database.",
        ],
        503,
    );
}
