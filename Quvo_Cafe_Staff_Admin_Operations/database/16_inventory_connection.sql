USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
ALTER TABLE dbo.inventory_items ADD category nvarchar(40) NOT NULL CONSTRAINT DF_inventory_category DEFAULT N'Other',record_version rowversion;
GO
CREATE UNIQUE INDEX UX_inventory_active_name ON dbo.inventory_items(item_name) WHERE is_active=1;
CREATE TABLE dbo.inventory_requests (
    staff_id int NOT NULL REFERENCES dbo.staff_users(staff_id),
    request_key uniqueidentifier NOT NULL,
    request_hash binary(32) NOT NULL,
    result_json nvarchar(max) NOT NULL CHECK (ISJSON(result_json)=1),
    created_at datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_inventory_requests PRIMARY KEY(staff_id,request_key)
);
COMMIT;
GO
