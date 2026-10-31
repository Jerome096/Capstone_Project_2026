-- Additive and safe to rerun. Existing customer accounts remain usable.
-- Run in the selected Quvo database; this script does not change databases.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.customer_accounts','email_verified_at') IS NULL
    ALTER TABLE dbo.customer_accounts ADD email_verified_at datetime2(0) NULL;
IF OBJECT_ID('dbo.customer_registration_codes','U') IS NULL
BEGIN
    CREATE TABLE dbo.customer_registration_codes (
        token_hash char(64) NOT NULL CONSTRAINT PK_customer_registration_codes PRIMARY KEY,
        email nvarchar(254) NOT NULL,
        full_name nvarchar(100) NOT NULL,
        contact_number nvarchar(30) NOT NULL,
        password_hash nvarchar(255) NOT NULL,
        code_hash char(64) NOT NULL,
        attempts tinyint NOT NULL CONSTRAINT DF_registration_attempts DEFAULT 0,
        created_at datetime2(0) NOT NULL CONSTRAINT DF_registration_created DEFAULT SYSUTCDATETIME(),
        last_sent_at datetime2(0) NOT NULL,
        expires_at datetime2(0) NOT NULL,
        CONSTRAINT CK_registration_attempts CHECK(attempts BETWEEN 0 AND 5)
    );
    CREATE INDEX IX_registration_expiry ON dbo.customer_registration_codes(expires_at);
END;
IF OBJECT_ID('dbo.customer_registration_limits','U') IS NULL
    CREATE TABLE dbo.customer_registration_limits (
        rate_key char(64) NOT NULL CONSTRAINT PK_customer_registration_limits PRIMARY KEY,
        window_started_at datetime2(0) NOT NULL,
        last_sent_at datetime2(0) NOT NULL,
        send_count smallint NOT NULL
    );
COMMIT TRANSACTION;
