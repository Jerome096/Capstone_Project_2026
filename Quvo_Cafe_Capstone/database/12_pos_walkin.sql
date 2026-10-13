-- Persist walk-in orders without creating customer accounts or dining sessions.
USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
ALTER TABLE dbo.orders DROP CONSTRAINT CK_orders_owner;
ALTER TABLE dbo.orders ADD pos_staff_id int NULL;
GO
ALTER TABLE dbo.orders ADD CONSTRAINT FK_orders_pos_staff FOREIGN KEY(pos_staff_id) REFERENCES dbo.staff_users(staff_id);
ALTER TABLE dbo.orders ADD CONSTRAINT CK_orders_owner CHECK (
    (order_source='dine_in' AND session_id IS NOT NULL AND customer_account_id IS NULL AND pos_staff_id IS NULL)
    OR (order_source='online' AND session_id IS NULL AND customer_account_id IS NOT NULL AND pos_staff_id IS NULL)
    OR (order_source='walk_in' AND session_id IS NULL AND customer_account_id IS NULL AND pos_staff_id IS NOT NULL)
);
CREATE UNIQUE INDEX UX_orders_pos_submission ON dbo.orders(pos_staff_id,submission_key) WHERE pos_staff_id IS NOT NULL;
COMMIT;
GO
