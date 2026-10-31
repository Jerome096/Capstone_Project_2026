-- Public development data only; accounts, guest history and secrets are excluded.
USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF EXISTS(SELECT 1 FROM [dbo].[roles]) THROW 50002, 'Data import requires empty target tables.', 1;
IF EXISTS(SELECT 1 FROM [dbo].[cafe_tables]) THROW 50002, 'Data import requires empty target tables.', 1;
IF EXISTS(SELECT 1 FROM [dbo].[menu_items]) THROW 50002, 'Data import requires empty target tables.', 1;

SET IDENTITY_INSERT [dbo].[roles] ON;
INSERT INTO [dbo].[roles] ([role_id], [role_name]) VALUES (N'1', N'Admin');
INSERT INTO [dbo].[roles] ([role_id], [role_name]) VALUES (N'5', N'Staff');
SET IDENTITY_INSERT [dbo].[roles] OFF;

SET IDENTITY_INSERT [dbo].[cafe_tables] ON;
INSERT INTO [dbo].[cafe_tables] ([table_id], [table_code], [table_name], [area], [is_active], [created_at]) VALUES (N'2', N'1', N'Table 1', N'indoor', N'1', N'2026-10-07 11:44:01');
SET IDENTITY_INSERT [dbo].[cafe_tables] OFF;

SET IDENTITY_INSERT [dbo].[menu_items] ON;
INSERT INTO [dbo].[menu_items] ([menu_item_id], [item_name], [category], [price], [is_available], [created_at], [updated_at]) VALUES (N'2', N'Brand X', N'coffee', N'150.00', N'1', N'2026-09-19 22:49:31', N'2026-09-19 22:49:31');
INSERT INTO [dbo].[menu_items] ([menu_item_id], [item_name], [category], [price], [is_available], [created_at], [updated_at]) VALUES (N'3', N'Brand Z', N'food', N'300.00', N'1', N'2026-09-19 22:49:45', N'2026-09-19 23:16:38');
SET IDENTITY_INSERT [dbo].[menu_items] OFF;

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
