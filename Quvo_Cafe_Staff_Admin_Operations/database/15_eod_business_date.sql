USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
ALTER TABLE dbo.eod_closures ADD business_date date NULL;
GO
UPDATE dbo.eod_closures SET business_date=CAST(DATEADD(hour,8,closed_at) AS date) WHERE business_date IS NULL;
COMMIT;
GO
