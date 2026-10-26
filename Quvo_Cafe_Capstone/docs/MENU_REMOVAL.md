# Menu removal

Menu management previously issued a physical DELETE. SQL Server correctly rejected
deletion when an item was referenced by order lines or a Bill of Materials. The
generic database error appeared as "Order service is unavailable."

Removal now sets the item unavailable and records a permanent `menu_item_removed`
lifecycle entry in the existing `system_audit_log` table. Active menu queries exclude
these IDs. This requires no schema migration. Retain these lifecycle entries with
their menu records; deleting them would remove the archive marker.

Admin and cashier menus, online and dine-in menus, and active BOM choices exclude
removed items. Shared server catalog validation rejects removed items in stale
carts. Stale menu/BOM editors cannot restore them. A replacement with the same name
receives a different ID. Repeated removal is safe and records only one lifecycle
entry. The existing admin and CSRF requirements still protect the removal API.

Orders, payments, receipts, menu photos and ingredient records remain intact.
Accepted submission retries still return the original order. Existing unpaid
orders can still receive payment and consume their retained recipe. Stock warnings
remain advisory. Removal does not cancel orders or remove sales history.

Run `C:\php85\php.exe tests/menu-removal.php` from the staff project for rollback-only
SQL regression checks. This suite requires the local QuvoCafeDB and never commits
its fixtures. The browser checks cover confirmation/cancel, duplicate clicks,
failure/retry, successful removal, reload, and cashier visibility on phone, tablet
and desktop layouts.
