SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.operating_hours_settings','U') IS NULL
BEGIN
    CREATE TABLE dbo.operating_hours_settings (
        settings_id tinyint NOT NULL CONSTRAINT PK_operating_hours_settings PRIMARY KEY,
        settings_version uniqueidentifier NOT NULL CONSTRAINT DF_operating_hours_version DEFAULT NEWID(),
        updated_at datetime2(0) NOT NULL CONSTRAINT DF_operating_hours_updated DEFAULT SYSUTCDATETIME(),
        updated_by_staff_id int NULL CONSTRAINT FK_operating_hours_staff REFERENCES dbo.staff_users(staff_id),
        CONSTRAINT CK_operating_hours_singleton CHECK(settings_id=1)
    );
END;
IF OBJECT_ID('dbo.operating_hours_schedule','U') IS NULL
BEGIN
    CREATE TABLE dbo.operating_hours_schedule (
        effective_date date NOT NULL CONSTRAINT PK_operating_hours_schedule PRIMARY KEY,
        opening_minute smallint NOT NULL,
        closing_minute smallint NOT NULL,
        legacy_calendar bit NOT NULL CONSTRAINT DF_operating_hours_legacy DEFAULT 0,
        changed_by_staff_id int NULL CONSTRAINT FK_operating_schedule_staff REFERENCES dbo.staff_users(staff_id),
        changed_at datetime2(0) NOT NULL CONSTRAINT DF_operating_schedule_changed DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_operating_hours_minutes CHECK(opening_minute BETWEEN 0 AND 1439 AND closing_minute BETWEEN 0 AND 1439),
        CONSTRAINT CK_operating_hours_duration CHECK((legacy_calendar=1 AND effective_date='00010101' AND opening_minute=0 AND closing_minute=0) OR (legacy_calendar=0 AND opening_minute<>closing_minute))
    );
END;
IF NOT EXISTS(SELECT 1 FROM dbo.operating_hours_settings WHERE settings_id=1)
    INSERT dbo.operating_hours_settings(settings_id) VALUES(1);
IF NOT EXISTS(SELECT 1 FROM dbo.operating_hours_schedule WHERE effective_date='00010101')
    INSERT dbo.operating_hours_schedule(effective_date,opening_minute,closing_minute,legacy_calendar) VALUES('00010101',0,0,1);
-- Keep past business dates intact. The initial 3 PM–2 AM schedule begins on a future day.
IF NOT EXISTS(SELECT 1 FROM dbo.operating_hours_schedule WHERE legacy_calendar=0)
    INSERT dbo.operating_hours_schedule(effective_date,opening_minute,closing_minute)
    VALUES(CAST(DATEADD(day,1,DATEADD(hour,8,SYSUTCDATETIME())) AS date),900,120);
COMMIT TRANSACTION;
