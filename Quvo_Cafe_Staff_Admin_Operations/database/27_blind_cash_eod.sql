-- Run after migration 26, against the site's selected database. Additive/rerunnable.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.cash_operations','U') IS NULL
BEGIN
 CREATE TABLE dbo.cash_operations (
  operation_id bigint IDENTITY PRIMARY KEY, drawer_id tinyint NOT NULL DEFAULT 1 CHECK(drawer_id=1),
  business_date date NOT NULL, opened_at datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
  coverage_start datetime2(7) NOT NULL, opened_by_staff_id int NOT NULL REFERENCES dbo.staff_users(staff_id),
  opening_cash decimal(12,2) NOT NULL CHECK(opening_cash>=0), opening_key uniqueidentifier NOT NULL UNIQUE,
  opening_hash binary(32) NOT NULL, closed_at datetime2(7) NULL,
  closed_by_staff_id int NULL REFERENCES dbo.staff_users(staff_id), counted_cash decimal(12,2) NULL CHECK(counted_cash>=0),
  closure_id bigint NULL REFERENCES dbo.eod_closures(closure_id), closing_key uniqueidentifier NULL,
  closing_hash binary(32) NULL, report_json nvarchar(max) NULL CHECK(report_json IS NULL OR ISJSON(report_json)=1),
  CONSTRAINT CK_cash_operation_state CHECK (
   (closed_at IS NULL AND closed_by_staff_id IS NULL AND counted_cash IS NULL AND closure_id IS NULL AND closing_key IS NULL AND report_json IS NULL)
   OR (closed_at IS NOT NULL AND closed_at>=opened_at AND closed_by_staff_id IS NOT NULL AND counted_cash IS NOT NULL AND closure_id IS NOT NULL AND closing_key IS NOT NULL AND closing_hash IS NOT NULL AND report_json IS NOT NULL))
 );
 CREATE UNIQUE INDEX UX_one_open_cash_drawer ON dbo.cash_operations(drawer_id) WHERE closed_at IS NULL;
 CREATE UNIQUE INDEX UX_cash_operation_closure ON dbo.cash_operations(closure_id) WHERE closure_id IS NOT NULL;
 CREATE UNIQUE INDEX UX_cash_operation_closing_key ON dbo.cash_operations(closing_key) WHERE closing_key IS NOT NULL;
 CREATE INDEX IX_cash_operations_business_date ON dbo.cash_operations(business_date,operation_id);
END;
IF OBJECT_ID('dbo.cash_operation_payments','U') IS NULL
BEGIN
 CREATE TABLE dbo.cash_operation_payments (
  payment_id bigint NOT NULL PRIMARY KEY REFERENCES dbo.payments(payment_id),
  operation_id bigint NOT NULL REFERENCES dbo.cash_operations(operation_id)
 );
 CREATE INDEX IX_cash_operation_membership ON dbo.cash_operation_payments(operation_id,payment_id);
END;
IF OBJECT_ID('dbo.cash_operation_movements','U') IS NULL
CREATE TABLE dbo.cash_operation_movements (
 movement_id bigint IDENTITY PRIMARY KEY, operation_id bigint NOT NULL REFERENCES dbo.cash_operations(operation_id),
 movement_type varchar(8) NOT NULL CHECK(movement_type IN ('cash_in','payout','drop')),
 amount decimal(12,2) NOT NULL CHECK(amount>0), evidence nvarchar(300) NOT NULL,
 note nvarchar(1000) NOT NULL, recorded_by_staff_id int NOT NULL REFERENCES dbo.staff_users(staff_id),
 recorded_at datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME(), request_key uniqueidentifier NOT NULL UNIQUE,
 request_hash binary(32) NOT NULL
);
-- Free orders are still paid records and must be represented in the EOD snapshot.
IF OBJECT_ID('dbo.CK_eod_sales_entry','C') IS NOT NULL
 ALTER TABLE dbo.eod_sales_orders DROP CONSTRAINT CK_eod_sales_entry;
ALTER TABLE dbo.eod_sales_orders WITH CHECK ADD CONSTRAINT CK_eod_sales_entry CHECK (
 (entry_type='payment' AND amount>=0 AND payment_method IS NOT NULL)
 OR(entry_type='void' AND amount=0 AND payment_method IS NULL));
COMMIT;
