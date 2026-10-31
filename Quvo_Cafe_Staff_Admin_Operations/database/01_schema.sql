-- Exported application schema; existing tables are never dropped or overwritten.
USE [QuvoCafeDB];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.roles',N'U') IS NOT NULL OR OBJECT_ID(N'dbo.cafe_tables',N'U') IS NOT NULL OR OBJECT_ID(N'dbo.staff_users',N'U') IS NOT NULL OR OBJECT_ID(N'dbo.menu_items',N'U') IS NOT NULL OR OBJECT_ID(N'dbo.customer_sessions',N'U') IS NOT NULL
    THROW 50001, 'Import into an empty database; application tables already exist.', 1;
CREATE TABLE [dbo].[roles] (
    [role_id] int IDENTITY(1,1) NOT NULL,
    [role_name] varchar(30) NOT NULL
);

ALTER TABLE [dbo].[roles] ADD CONSTRAINT [PK__roles__760965CC7AA3EEDF] PRIMARY KEY CLUSTERED ([role_id] ASC);

ALTER TABLE [dbo].[roles] ADD CONSTRAINT [UQ__roles__783254B1624AB6CD] UNIQUE NONCLUSTERED ([role_name] ASC);

CREATE TABLE [dbo].[cafe_tables] (
    [table_id] int IDENTITY(1,1) NOT NULL,
    [table_code] varchar(20) NOT NULL,
    [table_name] nvarchar(50) NOT NULL,
    [area] varchar(10) NOT NULL CONSTRAINT [DF_cafe_tables_area] DEFAULT ('indoor'),
    [is_active] bit NOT NULL CONSTRAINT [DF_cafe_tables_active] DEFAULT ((1)),
    [created_at] datetime2(0) NOT NULL CONSTRAINT [DF_cafe_tables_created] DEFAULT (sysutcdatetime())
);

ALTER TABLE [dbo].[cafe_tables] ADD CONSTRAINT [PK_cafe_tables] PRIMARY KEY CLUSTERED ([table_id] ASC);

ALTER TABLE [dbo].[cafe_tables] ADD CONSTRAINT [UQ_cafe_tables_code] UNIQUE NONCLUSTERED ([table_code] ASC);

ALTER TABLE [dbo].[cafe_tables] WITH CHECK ADD CONSTRAINT [CK_cafe_tables_area] CHECK ([area]='outdoor' OR [area]='indoor');

ALTER TABLE [dbo].[cafe_tables] WITH CHECK ADD CONSTRAINT [CK_cafe_tables_code] CHECK (len(ltrim(rtrim([table_code])))>(0));

ALTER TABLE [dbo].[cafe_tables] WITH CHECK ADD CONSTRAINT [CK_cafe_tables_name] CHECK (len(ltrim(rtrim([table_name])))>(0));

CREATE TABLE [dbo].[staff_users] (
    [staff_id] int IDENTITY(1,1) NOT NULL,
    [role_id] int NOT NULL,
    [full_name] nvarchar(100) NOT NULL,
    [username] varchar(50) NOT NULL,
    [password_hash] varchar(255) NOT NULL,
    [is_active] bit NOT NULL CONSTRAINT [DF__staff_use__is_ac__4D94879B] DEFAULT ((1)),
    [created_at] datetime2(0) NOT NULL CONSTRAINT [DF__staff_use__creat__4E88ABD4] DEFAULT (sysutcdatetime()),
    [updated_at] datetime2(0) NOT NULL CONSTRAINT [DF__staff_use__updat__4F7CD00D] DEFAULT (sysutcdatetime())
);

ALTER TABLE [dbo].[staff_users] ADD CONSTRAINT [PK__staff_us__1963DD9C762226C8] PRIMARY KEY CLUSTERED ([staff_id] ASC);

ALTER TABLE [dbo].[staff_users] ADD CONSTRAINT [UQ__staff_us__F3DBC572A6E0916A] UNIQUE NONCLUSTERED ([username] ASC);

CREATE TABLE [dbo].[menu_items] (
    [menu_item_id] int IDENTITY(1,1) NOT NULL,
    [item_name] nvarchar(100) NOT NULL,
    [category] varchar(20) NOT NULL,
    [price] decimal(10,2) NOT NULL,
    [is_available] bit NOT NULL CONSTRAINT [DF__menu_item__is_av__6FE99F9F] DEFAULT ((0)),
    [created_at] datetime2(0) NOT NULL CONSTRAINT [DF__menu_item__creat__70DDC3D8] DEFAULT (sysutcdatetime()),
    [updated_at] datetime2(0) NOT NULL CONSTRAINT [DF__menu_item__updat__71D1E811] DEFAULT (sysutcdatetime())
);

ALTER TABLE [dbo].[menu_items] ADD CONSTRAINT [PK__menu_ite__973431D5F5F36C77] PRIMARY KEY CLUSTERED ([menu_item_id] ASC);

ALTER TABLE [dbo].[menu_items] WITH CHECK ADD CONSTRAINT [CK_menu_items_name] CHECK (len(ltrim(rtrim([item_name])))>(0));

ALTER TABLE [dbo].[menu_items] WITH CHECK ADD CONSTRAINT [CK_menu_items_category] CHECK ([category]='pastry' OR [category]='food' OR [category]='non-coffee' OR [category]='coffee');

ALTER TABLE [dbo].[menu_items] WITH CHECK ADD CONSTRAINT [CK_menu_items_price] CHECK ([price]>=(0));

CREATE TABLE [dbo].[customer_sessions] (
    [session_id] bigint IDENTITY(1,1) NOT NULL,
    [table_id] int NOT NULL,
    [guest_name] nvarchar(100) NOT NULL,
    [guest_token_hash] binary(32) NOT NULL,
    [status] varchar(10) NOT NULL CONSTRAINT [DF_customer_sessions_status] DEFAULT ('pending'),
    [requested_at] datetime2(0) NOT NULL CONSTRAINT [DF_customer_sessions_requested] DEFAULT (sysutcdatetime()),
    [reviewed_by_staff_id] int NULL,
    [reviewed_at] datetime2(0) NULL,
    [ended_by_staff_id] int NULL,
    [ended_at] datetime2(0) NULL
);

ALTER TABLE [dbo].[customer_sessions] ADD CONSTRAINT [PK_customer_sessions] PRIMARY KEY CLUSTERED ([session_id] ASC);

ALTER TABLE [dbo].[customer_sessions] ADD CONSTRAINT [UQ_customer_sessions_token] UNIQUE NONCLUSTERED ([guest_token_hash] ASC);

CREATE UNIQUE NONCLUSTERED INDEX [UX_customer_sessions_active_table] ON [dbo].[customer_sessions] ([table_id] ASC) WHERE ([status]='active');

CREATE NONCLUSTERED INDEX [IX_customer_sessions_status_requested] ON [dbo].[customer_sessions] ([status] ASC, [requested_at] ASC);

ALTER TABLE [dbo].[customer_sessions] WITH CHECK ADD CONSTRAINT [CK_customer_sessions_status] CHECK ([status]='cancelled' OR [status]='closed' OR [status]='rejected' OR [status]='active' OR [status]='pending');

ALTER TABLE [dbo].[customer_sessions] WITH CHECK ADD CONSTRAINT [CK_customer_sessions_guest] CHECK (len(ltrim(rtrim([guest_name])))>(0));

ALTER TABLE [dbo].[staff_users] WITH CHECK ADD CONSTRAINT [FK_staff_users_roles] FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles] ([role_id]);

ALTER TABLE [dbo].[customer_sessions] WITH CHECK ADD CONSTRAINT [FK_customer_sessions_table] FOREIGN KEY ([table_id]) REFERENCES [dbo].[cafe_tables] ([table_id]);

ALTER TABLE [dbo].[customer_sessions] WITH CHECK ADD CONSTRAINT [FK_customer_sessions_reviewer] FOREIGN KEY ([reviewed_by_staff_id]) REFERENCES [dbo].[staff_users] ([staff_id]);

ALTER TABLE [dbo].[customer_sessions] WITH CHECK ADD CONSTRAINT [FK_customer_sessions_ended_by] FOREIGN KEY ([ended_by_staff_id]) REFERENCES [dbo].[staff_users] ([staff_id]);
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
