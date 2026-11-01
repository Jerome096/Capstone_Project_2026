-- Additive and rerunnable. Run against the application's database; no USE statement.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.sales_audit_payment_snapshots','U') IS NULL
CREATE TABLE dbo.sales_audit_payment_snapshots (
 payment_id bigint NOT NULL PRIMARY KEY REFERENCES dbo.payments(payment_id),
 method_code varchar(10) NOT NULL, method_label nvarchar(50) NOT NULL,
 label_basis varchar(20) NOT NULL CHECK(label_basis IN ('captured','backfilled')),
 qr_version uniqueidentifier NULL,
 captured_at datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.sales_audit_method_events','U') IS NULL
CREATE TABLE dbo.sales_audit_method_events (
 event_id bigint IDENTITY PRIMARY KEY, method_code varchar(10) NOT NULL,
 method_label nvarchar(50) NOT NULL, action varchar(30) NOT NULL,
 qr_version uniqueidentifier NULL, actor_staff_id int NOT NULL REFERENCES dbo.staff_users(staff_id),
 occurred_at datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.sales_audit_entries','U') IS NULL
BEGIN
 CREATE TABLE dbo.sales_audit_entries (
  entry_id bigint IDENTITY PRIMARY KEY, entry_type varchar(12) NOT NULL CHECK(entry_type IN ('cash','provider','review')),
  record_key varchar(64) NOT NULL, business_date date NOT NULL,
  revision int NOT NULL CHECK(revision>0), payload_json nvarchar(max) NOT NULL CHECK(ISJSON(payload_json)=1),
  actor_staff_id int NOT NULL REFERENCES dbo.staff_users(staff_id), created_at datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  request_key uniqueidentifier NOT NULL UNIQUE, request_hash binary(32) NOT NULL,
  CONSTRAINT UQ_sales_audit_entry_revision UNIQUE(entry_type,record_key,revision)
 );
 CREATE INDEX IX_sales_audit_entry_date ON dbo.sales_audit_entries(business_date,entry_type,record_key,revision);
END;
IF OBJECT_ID('dbo.sales_audit_exports','U') IS NULL
CREATE TABLE dbo.sales_audit_exports (
 export_id uniqueidentifier NOT NULL PRIMARY KEY, actor_staff_id int NOT NULL REFERENCES dbo.staff_users(staff_id),
 created_at datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(), filters_json nvarchar(2000) NOT NULL CHECK(ISJSON(filters_json)=1),
 metadata_json nvarchar(max) NOT NULL CHECK(ISJSON(metadata_json)=1), file_hash char(64) NOT NULL,
 file_bytes varbinary(max) NOT NULL
);
-- Historical labels cannot be reconstructed reliably; mark this baseline explicitly.
INSERT dbo.sales_audit_payment_snapshots(payment_id,method_code,method_label,label_basis,qr_version)
SELECT p.payment_id,p.payment_method,COALESCE(m.display_name,p.payment_method),'backfilled',r.qr_version
FROM dbo.payments p LEFT JOIN dbo.online_payment_methods m ON m.payment_method=p.payment_method
LEFT JOIN dbo.online_payment_receipts r ON r.order_id=p.order_id
WHERE NOT EXISTS(SELECT 1 FROM dbo.sales_audit_payment_snapshots s WHERE s.payment_id=p.payment_id);
COMMIT;
