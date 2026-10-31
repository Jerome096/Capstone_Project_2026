-- Run before deploying the expanded category UI. Safe to run again.
-- Current menu items are reclassified as requested. Historical order snapshots stay unchanged.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.menu_items','U') IS NULL OR OBJECT_ID('dbo.order_items','U') IS NULL
    THROW 50001, 'Install the menu and ordering tables before updating categories.', 1;

IF OBJECT_ID('dbo.CK_menu_items_category','C') IS NOT NULL
    ALTER TABLE dbo.menu_items DROP CONSTRAINT CK_menu_items_category;
ALTER TABLE dbo.menu_items WITH CHECK ADD CONSTRAINT CK_menu_items_category CHECK (
    category IN ('hot-coffee','cold-coffee','ice-blend','frappe','tea','non-coffee',
        'meal-sets','pasta','refresher','appetizer','sandwiches','pizza','coffee','food','pastry')
);
IF OBJECT_ID('dbo.CK_order_items_category','C') IS NOT NULL
    ALTER TABLE dbo.order_items DROP CONSTRAINT CK_order_items_category;
ALTER TABLE dbo.order_items WITH CHECK ADD CONSTRAINT CK_order_items_category CHECK (
    category IN ('hot-coffee','cold-coffee','ice-blend','frappe','tea','non-coffee',
        'meal-sets','pasta','refresher','appetizer','sandwiches','pizza','coffee','food','pastry')
);

UPDATE dbo.menu_items SET category=CASE category
    WHEN 'coffee' THEN 'cold-coffee'
    WHEN 'food' THEN 'appetizer'
    WHEN 'pastry' THEN 'appetizer'
    END, updated_at=SYSUTCDATETIME()
WHERE category IN ('coffee','food','pastry');

COMMIT TRANSACTION;
