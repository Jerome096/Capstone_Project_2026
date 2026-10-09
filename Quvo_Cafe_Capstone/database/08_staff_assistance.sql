USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.staff_assistance_requests','U') IS NOT NULL
    THROW 50800, 'Assistance table already exists. Nothing was replaced.', 1;
CREATE TABLE dbo.staff_assistance_requests (
    request_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_staff_assistance_requests PRIMARY KEY,
    session_id bigint NOT NULL CONSTRAINT FK_staff_assistance_session REFERENCES dbo.customer_sessions(session_id),
    concern nvarchar(500) NOT NULL,
    status varchar(10) NOT NULL CONSTRAINT DF_staff_assistance_status DEFAULT 'pending',
    requested_at datetime2(7) NOT NULL CONSTRAINT DF_staff_assistance_requested DEFAULT SYSUTCDATETIME(),
    expires_at AS DATEADD(second,60,requested_at) PERSISTED,
    resolved_by_staff_id int NULL CONSTRAINT FK_staff_assistance_actor REFERENCES dbo.staff_users(staff_id),
    resolved_at datetime2(7) NULL,
    CONSTRAINT CK_staff_assistance_concern CHECK (LEN(LTRIM(RTRIM(concern)))>0),
    CONSTRAINT CK_staff_assistance_status CHECK (
        (status='pending' AND resolved_at IS NULL AND resolved_by_staff_id IS NULL) OR
        (status='expired' AND resolved_at IS NULL AND resolved_by_staff_id IS NULL) OR
        (status='resolved' AND resolved_at IS NOT NULL AND resolved_at>=requested_at AND resolved_by_staff_id IS NOT NULL)
    )
);
CREATE UNIQUE INDEX UX_staff_assistance_pending ON dbo.staff_assistance_requests(session_id) WHERE status='pending';
CREATE INDEX IX_staff_assistance_session_time ON dbo.staff_assistance_requests(session_id,requested_at DESC,request_id DESC);
COMMIT;
GO
