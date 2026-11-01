-- Additive/rerunnable. Run in the selected site database after migration 11.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.online_payment_methods','online_enabled') IS NULL
 ALTER TABLE dbo.online_payment_methods ADD online_enabled bit NOT NULL
 CONSTRAINT DF_payment_method_online_enabled DEFAULT(1) WITH VALUES;
COMMIT;
