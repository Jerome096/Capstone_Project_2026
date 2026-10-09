-- Allow the timeout worker to identify automatic cancellations without inventing a staff actor.
USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.orders', 'cancellation_source') IS NULL
    ALTER TABLE dbo.orders ADD cancellation_source varchar(10) NOT NULL
        CONSTRAINT DF_orders_cancellation_source DEFAULT ('staff') WITH VALUES;
GO
ALTER TABLE dbo.orders DROP CONSTRAINT CK_orders_cancellation;
ALTER TABLE dbo.orders WITH CHECK ADD CONSTRAINT CK_orders_cancellation CHECK (
    cancellation_source IN ('staff','session') AND (
        (order_status='cancelled' AND cancelled_at IS NOT NULL AND cancelled_at>=created_at
         AND (cancelled_by_staff_id IS NOT NULL OR cancellation_source='session')
         AND cancellation_reason IS NOT NULL AND LEN(LTRIM(RTRIM(cancellation_reason)))>0)
        OR
        (order_status<>'cancelled' AND cancelled_at IS NULL AND cancelled_by_staff_id IS NULL
         AND cancellation_reason IS NULL AND cancellation_source='staff')
    )
);
COMMIT;
GO
