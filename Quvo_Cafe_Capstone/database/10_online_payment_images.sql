-- Payment QR configuration and customer payment proof. No sample QR codes or receipts.
USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.payment_qr_codes','U') IS NULL
CREATE TABLE dbo.payment_qr_codes (
    payment_method varchar(10) NOT NULL CONSTRAINT PK_payment_qr_codes PRIMARY KEY,
    image_mime varchar(20) NOT NULL,
    image_bytes varbinary(max) NOT NULL,
    qr_version uniqueidentifier NOT NULL CONSTRAINT DF_payment_qr_version DEFAULT NEWID(),
    updated_by_staff_id int NOT NULL REFERENCES dbo.staff_users(staff_id),
    updated_at datetime2 NOT NULL CONSTRAINT DF_payment_qr_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_payment_qr_method CHECK(payment_method IN ('GCash','PayMaya')),
    CONSTRAINT CK_payment_qr_image CHECK(image_mime IN ('image/png','image/jpeg') AND DATALENGTH(image_bytes) BETWEEN 1 AND 2097152)
);
IF OBJECT_ID('dbo.online_payment_receipts','U') IS NULL
CREATE TABLE dbo.online_payment_receipts (
    order_id bigint NOT NULL CONSTRAINT PK_online_payment_receipts PRIMARY KEY REFERENCES dbo.orders(order_id),
    payment_method varchar(10) NOT NULL,
    qr_version uniqueidentifier NOT NULL,
    image_mime varchar(20) NOT NULL,
    image_bytes varbinary(max) NOT NULL,
    image_hash binary(32) NOT NULL,
    uploaded_at datetime2 NOT NULL CONSTRAINT DF_online_payment_receipt_uploaded DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_online_receipt_method CHECK(payment_method IN ('GCash','PayMaya')),
    CONSTRAINT CK_online_receipt_image CHECK(image_mime IN ('image/png','image/jpeg') AND DATALENGTH(image_bytes) BETWEEN 1 AND 2097152)
);
COMMIT;
GO
