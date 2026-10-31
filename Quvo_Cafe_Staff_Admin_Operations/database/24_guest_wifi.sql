-- Guest Wi-Fi details are private settings, separate from public website content.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.guest_wifi_settings','U') IS NULL
    CREATE TABLE dbo.guest_wifi_settings (
        settings_id tinyint NOT NULL CONSTRAINT PK_guest_wifi_settings PRIMARY KEY,
        network_name nvarchar(100) NOT NULL,
        network_password nvarchar(128) NOT NULL,
        settings_version uniqueidentifier NOT NULL CONSTRAINT DF_guest_wifi_version DEFAULT NEWID(),
        updated_by_staff_id int NULL CONSTRAINT FK_guest_wifi_staff REFERENCES dbo.staff_users(staff_id),
        updated_at datetime2(0) NOT NULL CONSTRAINT DF_guest_wifi_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_guest_wifi_singleton CHECK(settings_id=1)
    );
IF NOT EXISTS(SELECT 1 FROM dbo.guest_wifi_settings WHERE settings_id=1)
    INSERT dbo.guest_wifi_settings(settings_id,network_name,network_password) VALUES(1,N'',N'');
COMMIT TRANSACTION;
