SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.menu_items','option_groups_json') IS NULL
BEGIN
    ALTER TABLE dbo.menu_items ADD option_groups_json nvarchar(max) NULL;
    EXEC(N'ALTER TABLE dbo.menu_items ADD CONSTRAINT CK_menu_options_json CHECK (option_groups_json IS NULL OR ISJSON(option_groups_json)=1)');
END;
IF OBJECT_ID('dbo.menu_item_images','U') IS NULL
BEGIN
    CREATE TABLE dbo.menu_item_images (
        menu_item_id int NOT NULL CONSTRAINT PK_menu_item_images PRIMARY KEY,
        image_mime varchar(30) NOT NULL,
        image_bytes varbinary(max) NOT NULL,
        image_version uniqueidentifier NOT NULL CONSTRAINT DF_menu_image_version DEFAULT NEWID(),
        updated_at datetime2(0) NOT NULL CONSTRAINT DF_menu_image_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_menu_images_item FOREIGN KEY(menu_item_id) REFERENCES dbo.menu_items(menu_item_id) ON DELETE CASCADE,
        CONSTRAINT CK_menu_image_mime CHECK(image_mime IN ('image/jpeg','image/png')),
        CONSTRAINT CK_menu_image_size CHECK(DATALENGTH(image_bytes) BETWEEN 1 AND 2097152)
    );
END;
COMMIT TRANSACTION;
