USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
ALTER TABLE dbo.eod_closures ADD request_key uniqueidentifier NULL,request_hash binary(32) NULL;
GO
CREATE UNIQUE INDEX UX_eod_request ON dbo.eod_closures(closed_by_staff_id,request_key) WHERE request_key IS NOT NULL;
CREATE TABLE dbo.eod_sales_orders (
    order_id bigint NOT NULL CONSTRAINT PK_eod_sales_orders PRIMARY KEY REFERENCES dbo.orders(order_id),
    closure_id bigint NOT NULL REFERENCES dbo.eod_closures(closure_id),
    amount decimal(12,2) NOT NULL,
    payment_method varchar(10) NULL,
    order_status varchar(12) NOT NULL,
    entry_type varchar(7) NOT NULL,
    CONSTRAINT CK_eod_sales_entry CHECK ((entry_type='payment' AND amount>0 AND payment_method IS NOT NULL) OR (entry_type='void' AND amount=0 AND payment_method IS NULL))
);
CREATE INDEX IX_eod_sales_closure ON dbo.eod_sales_orders(closure_id);
-- Reconstruct only verifiable payments linked to existing EOD closures.
INSERT dbo.eod_sales_orders(order_id,closure_id,amount,payment_method,order_status,entry_type)
SELECT c.order_id,c.closure_id,p.amount_applied,p.payment_method,'served','payment'
FROM dbo.eod_completed_orders c JOIN dbo.payments p ON p.order_id=c.order_id;
COMMIT;
GO
