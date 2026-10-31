-- Keep removed methods for historical orders; only active methods appear at checkout.
USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
CREATE TABLE dbo.online_payment_methods (
    payment_method varchar(10) NOT NULL CONSTRAINT PK_online_payment_methods PRIMARY KEY,
    display_name nvarchar(50) NOT NULL CONSTRAINT UQ_online_payment_method_name UNIQUE,
    is_active bit NOT NULL CONSTRAINT DF_online_payment_method_active DEFAULT 1,
    updated_by_staff_id int NULL REFERENCES dbo.staff_users(staff_id),
    updated_at datetime2 NOT NULL CONSTRAINT DF_online_payment_method_updated DEFAULT SYSUTCDATETIME()
);
INSERT dbo.online_payment_methods(payment_method,display_name) VALUES('GCash',N'GCash'),('PayMaya',N'PayMaya');
ALTER TABLE dbo.payment_qr_codes DROP CONSTRAINT CK_payment_qr_method;
ALTER TABLE dbo.payment_qr_codes ADD CONSTRAINT FK_qr_online_method FOREIGN KEY(payment_method) REFERENCES dbo.online_payment_methods(payment_method);
ALTER TABLE dbo.online_payment_receipts DROP CONSTRAINT CK_online_receipt_method;
ALTER TABLE dbo.online_payment_receipts ADD CONSTRAINT FK_receipt_online_method FOREIGN KEY(payment_method) REFERENCES dbo.online_payment_methods(payment_method);
ALTER TABLE dbo.orders DROP CONSTRAINT CK_orders_preferred_payment;
ALTER TABLE dbo.orders ADD CONSTRAINT CK_orders_preferred_payment CHECK(preferred_payment_method IS NULL OR LEN(LTRIM(RTRIM(preferred_payment_method)))>0);
ALTER TABLE dbo.payments DROP CONSTRAINT CK_payments_method;
ALTER TABLE dbo.payments ADD CONSTRAINT CK_payments_method CHECK(LEN(LTRIM(RTRIM(payment_method)))>0);
COMMIT;
GO
