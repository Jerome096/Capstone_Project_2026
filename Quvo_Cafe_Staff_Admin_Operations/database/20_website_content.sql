SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.website_content','U') IS NULL
BEGIN
    CREATE TABLE dbo.website_content (
        content_id tinyint NOT NULL CONSTRAINT PK_website_content PRIMARY KEY,
        content_json nvarchar(max) NOT NULL,
        content_version uniqueidentifier NOT NULL CONSTRAINT DF_website_content_version DEFAULT NEWID(),
        updated_by_staff_id int NULL,
        updated_at datetime2(0) NOT NULL CONSTRAINT DF_website_content_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_website_content_singleton CHECK(content_id=1),
        CONSTRAINT CK_website_content_json CHECK(ISJSON(content_json)=1 AND DATALENGTH(content_json)<=65536),
        CONSTRAINT FK_website_content_staff FOREIGN KEY(updated_by_staff_id) REFERENCES dbo.staff_users(staff_id)
    );
END;
IF NOT EXISTS (SELECT 1 FROM dbo.website_content WHERE content_id=1)
    INSERT dbo.website_content(content_id,content_json) VALUES(1,N'{}');
COMMIT TRANSACTION;
