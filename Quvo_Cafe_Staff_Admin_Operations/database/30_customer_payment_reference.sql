-- Additive/rerunnable. Run in the selected site database after migration 10.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.online_payment_receipts','customer_reference') IS NULL
 ALTER TABLE dbo.online_payment_receipts ADD customer_reference nvarchar(100) NULL;
COMMIT;
