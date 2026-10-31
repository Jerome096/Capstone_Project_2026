SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.ordering_settings','U') IS NULL
BEGIN
    CREATE TABLE dbo.ordering_settings (
        settings_id tinyint NOT NULL CONSTRAINT PK_ordering_settings PRIMARY KEY,
        accepting_orders bit NOT NULL CONSTRAINT DF_ordering_accepting DEFAULT 0,
        service_version uniqueidentifier NOT NULL CONSTRAINT DF_ordering_version DEFAULT NEWID(),
        change_reason varchar(16) NOT NULL CONSTRAINT DF_ordering_reason DEFAULT 'initial',
        changed_by_staff_id int NULL,
        changed_at datetime2(0) NOT NULL CONSTRAINT DF_ordering_changed DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_ordering_singleton CHECK (settings_id=1),
        CONSTRAINT CK_ordering_reason CHECK (change_reason IN ('initial','manual','offline','eod')),
        CONSTRAINT FK_ordering_changed_by FOREIGN KEY (changed_by_staff_id) REFERENCES dbo.staff_users(staff_id)
    );
END;
IF NOT EXISTS (SELECT 1 FROM dbo.ordering_settings WHERE settings_id=1)
    INSERT dbo.ordering_settings(settings_id) VALUES(1);

IF OBJECT_ID('dbo.ordering_workspaces','U') IS NULL
BEGIN
    CREATE TABLE dbo.ordering_workspaces (
        workspace_id uniqueidentifier NOT NULL CONSTRAINT PK_ordering_workspaces PRIMARY KEY,
        staff_id int NOT NULL,
        staff_session_hash binary(32) NOT NULL,
        credential_stamp char(64) NOT NULL,
        service_version uniqueidentifier NOT NULL,
        lease_expires_at datetime2(0) NOT NULL,
        CONSTRAINT FK_ordering_workspace_staff FOREIGN KEY (staff_id) REFERENCES dbo.staff_users(staff_id)
    );
    CREATE INDEX IX_ordering_workspace_session ON dbo.ordering_workspaces(staff_session_hash);
END;

COMMIT TRANSACTION;
