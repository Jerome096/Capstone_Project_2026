-- Persist EOD completion boundaries without deleting orders, payments or receipts.
USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.eod_closures','U') IS NULL
CREATE TABLE dbo.eod_closures (
    closure_id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    closed_at datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
    closed_by_staff_id int NOT NULL REFERENCES dbo.staff_users(staff_id),
    note nvarchar(1000) NOT NULL DEFAULT N''
);
IF OBJECT_ID('dbo.eod_completed_orders','U') IS NULL
CREATE TABLE dbo.eod_completed_orders (
    order_id bigint NOT NULL PRIMARY KEY REFERENCES dbo.orders(order_id),
    closure_id bigint NOT NULL REFERENCES dbo.eod_closures(closure_id)
);
COMMIT;
GO
