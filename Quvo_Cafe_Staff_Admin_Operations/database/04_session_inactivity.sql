-- Preserve visit history and give existing approved visits a fresh ten minutes.
USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.customer_sessions', 'last_activity_at') IS NULL
    ALTER TABLE dbo.customer_sessions ADD last_activity_at datetime2(0) NULL;
IF COL_LENGTH('dbo.customer_sessions', 'idle_expired_at') IS NULL
    ALTER TABLE dbo.customer_sessions ADD idle_expired_at datetime2(0) NULL;
GO
UPDATE dbo.customer_sessions SET last_activity_at=SYSUTCDATETIME()
WHERE status='active' AND last_activity_at IS NULL;
COMMIT;
GO
