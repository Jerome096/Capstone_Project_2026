-- Run after 27_blind_cash_eod.sql in the selected site database. Additive/rerunnable.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.cashier_action_approvals','U') IS NULL
BEGIN
 CREATE TABLE dbo.cashier_action_approvals (
  approval_id bigint IDENTITY PRIMARY KEY,
  request_key uniqueidentifier NOT NULL UNIQUE,
  request_hash binary(32) NOT NULL,
  action varchar(12) NOT NULL CHECK(action IN ('payout','void')),
  entity_key nvarchar(100) NOT NULL,
  requested_by_staff_id int NOT NULL REFERENCES dbo.staff_users(staff_id),
  approved_by_staff_id int NOT NULL REFERENCES dbo.staff_users(staff_id),
  requested_by_name nvarchar(200) NOT NULL,
  approved_by_name nvarchar(200) NOT NULL,
  approved_at datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
  details_json nvarchar(max) NOT NULL CHECK(ISJSON(details_json)=1),
  result_json nvarchar(max) NOT NULL CHECK(ISJSON(result_json)=1)
 );
 CREATE INDEX IX_cashier_approvals_time ON dbo.cashier_action_approvals(approved_at,approval_id);
 CREATE INDEX IX_cashier_approvals_entity ON dbo.cashier_action_approvals(action,entity_key);
END;
IF OBJECT_ID('dbo.cashier_approval_throttle','U') IS NULL
BEGIN
 CREATE TABLE dbo.cashier_approval_throttle (
  staff_id int PRIMARY KEY REFERENCES dbo.staff_users(staff_id),
  failures tinyint NOT NULL CHECK(failures BETWEEN 0 AND 5),
  window_started datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME()
 );
END;
COMMIT;
