-- Connect online accounts to the existing order/payment workflow. No seed data.
USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.orders','customer_account_id') IS NOT NULL
    THROW 50900, 'Online ordering migration is already installed.', 1;
ALTER TABLE dbo.orders DROP CONSTRAINT UQ_orders_submission;
DROP INDEX IX_orders_status_created ON dbo.orders;
ALTER TABLE dbo.orders ALTER COLUMN session_id bigint NULL;
ALTER TABLE dbo.orders ADD
    customer_account_id bigint NULL,
    order_source varchar(10) NOT NULL CONSTRAINT DF_orders_source DEFAULT ('dine_in') WITH VALUES,
    preferred_payment_method varchar(10) NULL;
GO
ALTER TABLE dbo.orders WITH CHECK ADD
    CONSTRAINT FK_orders_customer_account FOREIGN KEY(customer_account_id) REFERENCES dbo.customer_accounts(customer_account_id),
    CONSTRAINT CK_orders_owner CHECK (
      (order_source='dine_in' AND session_id IS NOT NULL AND customer_account_id IS NULL)
      OR (order_source='online' AND session_id IS NULL AND customer_account_id IS NOT NULL)),
    CONSTRAINT CK_orders_preferred_payment CHECK (preferred_payment_method IS NULL OR preferred_payment_method IN ('Cash','GCash','PayMaya'));
CREATE UNIQUE INDEX UQ_orders_submission ON dbo.orders(session_id,submission_key) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX UX_orders_online_submission ON dbo.orders(customer_account_id,submission_key) WHERE customer_account_id IS NOT NULL;
CREATE INDEX IX_orders_status_created ON dbo.orders(order_status,created_at,order_id)
    INCLUDE(session_id,customer_name,total_amount,order_source);
COMMIT;
GO
