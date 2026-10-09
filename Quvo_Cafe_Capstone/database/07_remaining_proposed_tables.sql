-- Creates only the 12 unimplemented tables from the proposed overall diagram.
-- Apply after migrations 00-06 to QuvoCafeDB. Existing tables and data are preserved.
-- No sample data, order-table changes, triggers, automatic stock deductions or app connections.
-- Run once in SSMS. Refuses to overwrite any proposed table already present.
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
SET NOCOUNT ON;
GO
BEGIN TRY
    BEGIN TRANSACTION;
    IF OBJECT_ID('dbo.orders','U') IS NULL OR OBJECT_ID('dbo.order_items','U') IS NULL
       OR OBJECT_ID('dbo.menu_items','U') IS NULL OR OBJECT_ID('dbo.staff_users','U') IS NULL
        THROW 50700, 'Required existing tables are missing. Apply the earlier migrations first.', 1;
    IF EXISTS (SELECT 1 FROM sys.objects WHERE schema_id=SCHEMA_ID('dbo') AND name IN (
        'customer_accounts','customer_addresses','order_fulfillments','order_status_history','inventory_units','inventory_items','menu_recipes','recipe_ingredients','inventory_movements','business_days','eod_reports','system_audit_log'
    )) THROW 50701, 'A proposed table name already exists. Nothing has been replaced; review the current schema.', 1;

    CREATE TABLE [dbo].[customer_accounts] (
        [customer_account_id] bigint IDENTITY(1,1) NOT NULL,
        [full_name] nvarchar(100) NOT NULL,
        [email] nvarchar(254) COLLATE Latin1_General_100_CI_AS NOT NULL,
        [contact_number] varchar(30) NOT NULL,
        [password_hash] varchar(255) NOT NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF_customer_accounts_is_active] DEFAULT (1),
        [created_at] datetime2(0) NOT NULL CONSTRAINT [DF_customer_accounts_created_at] DEFAULT (SYSUTCDATETIME()),
        [updated_at] datetime2(0) NOT NULL CONSTRAINT [DF_customer_accounts_updated_at] DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_customer_accounts] PRIMARY KEY ([customer_account_id]),
        CONSTRAINT [UQ_customer_accounts_1] UNIQUE ([email]),
        CONSTRAINT [CK_customer_accounts_1] CHECK (LEN(LTRIM(RTRIM(full_name)))>0 AND LEN(LTRIM(RTRIM(email)))>0 AND LEN(LTRIM(RTRIM(contact_number)))>0 AND LEN(password_hash)>0),
        CONSTRAINT [CK_customer_accounts_2] CHECK (updated_at>=created_at)
    );

    CREATE TABLE [dbo].[customer_addresses] (
        [address_id] bigint IDENTITY(1,1) NOT NULL,
        [customer_account_id] bigint NOT NULL,
        [label] nvarchar(50) NOT NULL,
        [address_text] nvarchar(500) NOT NULL,
        [contact_number] varchar(30) NOT NULL,
        [is_default] bit NOT NULL CONSTRAINT [DF_customer_addresses_is_default] DEFAULT (0),
        [is_active] bit NOT NULL CONSTRAINT [DF_customer_addresses_is_active] DEFAULT (1),
        [created_at] datetime2(0) NOT NULL CONSTRAINT [DF_customer_addresses_created_at] DEFAULT (SYSUTCDATETIME()),
        [updated_at] datetime2(0) NOT NULL CONSTRAINT [DF_customer_addresses_updated_at] DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_customer_addresses] PRIMARY KEY ([address_id]),
        CONSTRAINT [CK_customer_addresses_1] CHECK (LEN(LTRIM(RTRIM(label)))>0 AND LEN(LTRIM(RTRIM(address_text)))>0 AND LEN(LTRIM(RTRIM(contact_number)))>0),
        CONSTRAINT [CK_customer_addresses_2] CHECK (updated_at>=created_at),
        CONSTRAINT [CK_customer_addresses_3] CHECK (is_default=0 OR is_active=1)
    );

    CREATE TABLE [dbo].[order_fulfillments] (
        [fulfillment_id] bigint IDENTITY(1,1) NOT NULL,
        [order_id] bigint NOT NULL,
        [fulfillment_type] varchar(20) NOT NULL,
        [address_id] bigint NULL,
        [recipient_name] nvarchar(100) NOT NULL,
        [contact_snapshot] varchar(30) NULL,
        [address_snapshot] nvarchar(500) NULL,
        [requested_at] datetime2(0) NOT NULL CONSTRAINT [DF_order_fulfillments_requested_at] DEFAULT (SYSUTCDATETIME()),
        [completed_at] datetime2(0) NULL,
        [fulfilled_by_staff_id] int NULL,
        CONSTRAINT [PK_order_fulfillments] PRIMARY KEY ([fulfillment_id]),
        CONSTRAINT [UQ_order_fulfillments_1] UNIQUE ([order_id]),
        CONSTRAINT [CK_order_fulfillments_1] CHECK (fulfillment_type IN ('pickup','delivery')),
        CONSTRAINT [CK_order_fulfillments_2] CHECK (LEN(LTRIM(RTRIM(recipient_name)))>0),
        CONSTRAINT [CK_order_fulfillments_3] CHECK ((fulfillment_type='pickup' AND address_id IS NULL AND address_snapshot IS NULL) OR (fulfillment_type='delivery' AND address_snapshot IS NOT NULL AND LEN(LTRIM(RTRIM(address_snapshot)))>0 AND contact_snapshot IS NOT NULL AND LEN(LTRIM(RTRIM(contact_snapshot)))>0)),
        CONSTRAINT [CK_order_fulfillments_4] CHECK (completed_at IS NULL OR completed_at>=requested_at)
    );

    CREATE TABLE [dbo].[order_status_history] (
        [status_history_id] bigint IDENTITY(1,1) NOT NULL,
        [order_id] bigint NOT NULL,
        [from_status] varchar(12) NULL,
        [to_status] varchar(12) NOT NULL,
        [changed_by_staff_id] int NULL,
        [changed_at] datetime2(0) NOT NULL CONSTRAINT [DF_order_status_history_changed_at] DEFAULT (SYSUTCDATETIME()),
        [reason] nvarchar(500) NULL,
        CONSTRAINT [PK_order_status_history] PRIMARY KEY ([status_history_id]),
        CONSTRAINT [CK_order_status_history_1] CHECK (to_status IN ('received','preparing','ready','served','cancelled')),
        CONSTRAINT [CK_order_status_history_2] CHECK ((from_status IS NULL AND to_status='received') OR (from_status IS NOT NULL AND from_status IN ('received','preparing','ready','served','cancelled') AND from_status<>to_status))
    );

    CREATE TABLE [dbo].[inventory_units] (
        [unit_id] bigint IDENTITY(1,1) NOT NULL,
        [unit_code] varchar(20) NOT NULL,
        [unit_name] nvarchar(50) NOT NULL,
        CONSTRAINT [PK_inventory_units] PRIMARY KEY ([unit_id]),
        CONSTRAINT [UQ_inventory_units_1] UNIQUE ([unit_code]),
        CONSTRAINT [CK_inventory_units_1] CHECK (LEN(LTRIM(RTRIM(unit_code)))>0 AND LEN(LTRIM(RTRIM(unit_name)))>0)
    );

    CREATE TABLE [dbo].[inventory_items] (
        [inventory_item_id] bigint IDENTITY(1,1) NOT NULL,
        [unit_id] bigint NOT NULL,
        [item_name] nvarchar(100) NOT NULL,
        [reorder_level] decimal(12,3) NOT NULL CONSTRAINT [DF_inventory_items_reorder_level] DEFAULT (0),
        [is_active] bit NOT NULL CONSTRAINT [DF_inventory_items_is_active] DEFAULT (1),
        [created_at] datetime2(0) NOT NULL CONSTRAINT [DF_inventory_items_created_at] DEFAULT (SYSUTCDATETIME()),
        [updated_at] datetime2(0) NOT NULL CONSTRAINT [DF_inventory_items_updated_at] DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_inventory_items] PRIMARY KEY ([inventory_item_id]),
        CONSTRAINT [CK_inventory_items_1] CHECK (LEN(LTRIM(RTRIM(item_name)))>0),
        CONSTRAINT [CK_inventory_items_2] CHECK (reorder_level>=0),
        CONSTRAINT [CK_inventory_items_3] CHECK (updated_at>=created_at)
    );

    CREATE TABLE [dbo].[menu_recipes] (
        [recipe_id] bigint IDENTITY(1,1) NOT NULL,
        [menu_item_id] int NOT NULL,
        [version_number] int NOT NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF_menu_recipes_is_active] DEFAULT (1),
        [created_by_staff_id] int NOT NULL,
        [created_at] datetime2(0) NOT NULL CONSTRAINT [DF_menu_recipes_created_at] DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_menu_recipes] PRIMARY KEY ([recipe_id]),
        CONSTRAINT [UQ_menu_recipes_1] UNIQUE ([menu_item_id],[version_number]),
        CONSTRAINT [CK_menu_recipes_1] CHECK (version_number>0)
    );

    CREATE TABLE [dbo].[recipe_ingredients] (
        [recipe_ingredient_id] bigint IDENTITY(1,1) NOT NULL,
        [recipe_id] bigint NOT NULL,
        [inventory_item_id] bigint NOT NULL,
        [quantity_required] decimal(12,3) NOT NULL,
        CONSTRAINT [PK_recipe_ingredients] PRIMARY KEY ([recipe_ingredient_id]),
        CONSTRAINT [UQ_recipe_ingredients_1] UNIQUE ([recipe_id],[inventory_item_id]),
        CONSTRAINT [UQ_recipe_ingredients_stock] UNIQUE (recipe_ingredient_id,inventory_item_id),
        CONSTRAINT [CK_recipe_ingredients_1] CHECK (quantity_required>0)
    );

    CREATE TABLE [dbo].[inventory_movements] (
        [movement_id] bigint IDENTITY(1,1) NOT NULL,
        [inventory_item_id] bigint NOT NULL,
        [movement_type] varchar(20) NOT NULL,
        [quantity_delta] decimal(12,3) NOT NULL,
        [order_item_id] bigint NULL,
        [recipe_ingredient_id] bigint NULL,
        [recorded_by_staff_id] int NULL,
        [recorded_at] datetime2(0) NOT NULL CONSTRAINT [DF_inventory_movements_recorded_at] DEFAULT (SYSUTCDATETIME()),
        [reason] nvarchar(500) NULL,
        CONSTRAINT [PK_inventory_movements] PRIMARY KEY ([movement_id]),
        CONSTRAINT [CK_inventory_movements_1] CHECK (movement_type IN ('restock','consumption','waste','adjustment')),
        CONSTRAINT [CK_inventory_movements_2] CHECK ((movement_type='restock' AND quantity_delta>0) OR (movement_type IN ('consumption','waste') AND quantity_delta<0) OR (movement_type='adjustment' AND quantity_delta<>0)),
        CONSTRAINT [CK_inventory_movements_3] CHECK ((movement_type='consumption' AND order_item_id IS NOT NULL AND recipe_ingredient_id IS NOT NULL) OR (movement_type<>'consumption' AND order_item_id IS NULL AND recipe_ingredient_id IS NULL AND recorded_by_staff_id IS NOT NULL)),
        CONSTRAINT [CK_inventory_movements_4] CHECK (movement_type NOT IN ('waste','adjustment') OR (reason IS NOT NULL AND LEN(LTRIM(RTRIM(reason)))>0))
    );

    CREATE TABLE [dbo].[business_days] (
        [business_day_id] bigint IDENTITY(1,1) NOT NULL,
        [business_date] date NOT NULL,
        [opening_float] decimal(12,2) NOT NULL CONSTRAINT [DF_business_days_opening_float] DEFAULT (0),
        [opened_by_staff_id] int NOT NULL,
        [opened_at] datetime2(0) NOT NULL CONSTRAINT [DF_business_days_opened_at] DEFAULT (SYSUTCDATETIME()),
        [closed_by_staff_id] int NULL,
        [closed_at] datetime2(0) NULL,
        [status] varchar(10) NOT NULL CONSTRAINT [DF_business_days_status] DEFAULT ('open'),
        CONSTRAINT [PK_business_days] PRIMARY KEY ([business_day_id]),
        CONSTRAINT [UQ_business_days_1] UNIQUE ([business_date]),
        CONSTRAINT [CK_business_days_1] CHECK (opening_float>=0),
        CONSTRAINT [CK_business_days_2] CHECK ((status='open' AND closed_at IS NULL AND closed_by_staff_id IS NULL) OR (status='closed' AND closed_at IS NOT NULL AND closed_at>=opened_at AND closed_by_staff_id IS NOT NULL))
    );

    CREATE TABLE [dbo].[eod_reports] (
        [eod_report_id] bigint IDENTITY(1,1) NOT NULL,
        [business_day_id] bigint NOT NULL,
        [submitted_by_staff_id] int NOT NULL,
        [cash_sales_total] decimal(12,2) NOT NULL,
        [digital_sales_total] decimal(12,2) NOT NULL,
        [expected_cash] decimal(12,2) NOT NULL,
        [counted_cash] decimal(12,2) NOT NULL,
        [cash_variance] AS CONVERT(decimal(12,2),counted_cash-expected_cash) PERSISTED,
        [submitted_at] datetime2(0) NOT NULL CONSTRAINT [DF_eod_reports_submitted_at] DEFAULT (SYSUTCDATETIME()),
        [notes] nvarchar(500) NULL,
        CONSTRAINT [PK_eod_reports] PRIMARY KEY ([eod_report_id]),
        CONSTRAINT [UQ_eod_reports_1] UNIQUE ([business_day_id]),
        CONSTRAINT [CK_eod_reports_1] CHECK (cash_sales_total>=0 AND digital_sales_total>=0 AND expected_cash>=0 AND counted_cash>=0)
    );

    CREATE TABLE [dbo].[system_audit_log] (
        [audit_id] bigint IDENTITY(1,1) NOT NULL,
        [actor_staff_id] int NULL,
        [actor_customer_id] bigint NULL,
        [action] varchar(60) NOT NULL,
        [entity_type] varchar(50) NOT NULL,
        [entity_key] nvarchar(100) NULL,
        [occurred_at] datetime2(0) NOT NULL CONSTRAINT [DF_system_audit_log_occurred_at] DEFAULT (SYSUTCDATETIME()),
        [details_json] nvarchar(max) NULL,
        CONSTRAINT [PK_system_audit_log] PRIMARY KEY ([audit_id]),
        CONSTRAINT [CK_system_audit_log_1] CHECK (actor_staff_id IS NULL OR actor_customer_id IS NULL),
        CONSTRAINT [CK_system_audit_log_2] CHECK (LEN(LTRIM(RTRIM(action)))>0 AND LEN(LTRIM(RTRIM(entity_type)))>0),
        CONSTRAINT [CK_system_audit_log_3] CHECK (details_json IS NULL OR ISJSON(details_json)=1)
    );

    ALTER TABLE [dbo].[customer_addresses] WITH CHECK ADD CONSTRAINT [FK_customer_addresses_customer_account_id]
        FOREIGN KEY ([customer_account_id]) REFERENCES [dbo].[customer_accounts] ([customer_account_id]);
    ALTER TABLE [dbo].[order_fulfillments] WITH CHECK ADD CONSTRAINT [FK_order_fulfillments_order_id]
        FOREIGN KEY ([order_id]) REFERENCES [dbo].[orders] ([order_id]);
    ALTER TABLE [dbo].[order_fulfillments] WITH CHECK ADD CONSTRAINT [FK_order_fulfillments_address_id]
        FOREIGN KEY ([address_id]) REFERENCES [dbo].[customer_addresses] ([address_id]);
    ALTER TABLE [dbo].[order_fulfillments] WITH CHECK ADD CONSTRAINT [FK_order_fulfillments_fulfilled_by_staff_id]
        FOREIGN KEY ([fulfilled_by_staff_id]) REFERENCES [dbo].[staff_users] ([staff_id]);
    ALTER TABLE [dbo].[order_status_history] WITH CHECK ADD CONSTRAINT [FK_order_status_history_order_id]
        FOREIGN KEY ([order_id]) REFERENCES [dbo].[orders] ([order_id]);
    ALTER TABLE [dbo].[order_status_history] WITH CHECK ADD CONSTRAINT [FK_order_status_history_changed_by_staff_id]
        FOREIGN KEY ([changed_by_staff_id]) REFERENCES [dbo].[staff_users] ([staff_id]);
    ALTER TABLE [dbo].[inventory_items] WITH CHECK ADD CONSTRAINT [FK_inventory_items_unit_id]
        FOREIGN KEY ([unit_id]) REFERENCES [dbo].[inventory_units] ([unit_id]);
    ALTER TABLE [dbo].[menu_recipes] WITH CHECK ADD CONSTRAINT [FK_menu_recipes_menu_item_id]
        FOREIGN KEY ([menu_item_id]) REFERENCES [dbo].[menu_items] ([menu_item_id]);
    ALTER TABLE [dbo].[menu_recipes] WITH CHECK ADD CONSTRAINT [FK_menu_recipes_created_by_staff_id]
        FOREIGN KEY ([created_by_staff_id]) REFERENCES [dbo].[staff_users] ([staff_id]);
    ALTER TABLE [dbo].[recipe_ingredients] WITH CHECK ADD CONSTRAINT [FK_recipe_ingredients_recipe_id]
        FOREIGN KEY ([recipe_id]) REFERENCES [dbo].[menu_recipes] ([recipe_id]);
    ALTER TABLE [dbo].[recipe_ingredients] WITH CHECK ADD CONSTRAINT [FK_recipe_ingredients_inventory_item_id]
        FOREIGN KEY ([inventory_item_id]) REFERENCES [dbo].[inventory_items] ([inventory_item_id]);
    ALTER TABLE [dbo].[inventory_movements] WITH CHECK ADD CONSTRAINT [FK_inventory_movements_inventory_item_id]
        FOREIGN KEY ([inventory_item_id]) REFERENCES [dbo].[inventory_items] ([inventory_item_id]);
    ALTER TABLE [dbo].[inventory_movements] WITH CHECK ADD CONSTRAINT [FK_inventory_movements_order_item_id]
        FOREIGN KEY ([order_item_id]) REFERENCES [dbo].[order_items] ([order_item_id]);
    ALTER TABLE dbo.inventory_movements WITH CHECK ADD CONSTRAINT FK_inventory_movements_recipe_stock
        FOREIGN KEY (recipe_ingredient_id,inventory_item_id) REFERENCES dbo.recipe_ingredients(recipe_ingredient_id,inventory_item_id);
    ALTER TABLE [dbo].[inventory_movements] WITH CHECK ADD CONSTRAINT [FK_inventory_movements_recorded_by_staff_id]
        FOREIGN KEY ([recorded_by_staff_id]) REFERENCES [dbo].[staff_users] ([staff_id]);
    ALTER TABLE [dbo].[business_days] WITH CHECK ADD CONSTRAINT [FK_business_days_opened_by_staff_id]
        FOREIGN KEY ([opened_by_staff_id]) REFERENCES [dbo].[staff_users] ([staff_id]);
    ALTER TABLE [dbo].[business_days] WITH CHECK ADD CONSTRAINT [FK_business_days_closed_by_staff_id]
        FOREIGN KEY ([closed_by_staff_id]) REFERENCES [dbo].[staff_users] ([staff_id]);
    ALTER TABLE [dbo].[eod_reports] WITH CHECK ADD CONSTRAINT [FK_eod_reports_business_day_id]
        FOREIGN KEY ([business_day_id]) REFERENCES [dbo].[business_days] ([business_day_id]);
    ALTER TABLE [dbo].[eod_reports] WITH CHECK ADD CONSTRAINT [FK_eod_reports_submitted_by_staff_id]
        FOREIGN KEY ([submitted_by_staff_id]) REFERENCES [dbo].[staff_users] ([staff_id]);
    ALTER TABLE [dbo].[system_audit_log] WITH CHECK ADD CONSTRAINT [FK_system_audit_log_actor_staff_id]
        FOREIGN KEY ([actor_staff_id]) REFERENCES [dbo].[staff_users] ([staff_id]);
    ALTER TABLE [dbo].[system_audit_log] WITH CHECK ADD CONSTRAINT [FK_system_audit_log_actor_customer_id]
        FOREIGN KEY ([actor_customer_id]) REFERENCES [dbo].[customer_accounts] ([customer_account_id]);

    CREATE UNIQUE INDEX UX_customer_addresses_default ON dbo.customer_addresses(customer_account_id) WHERE is_default=1 AND is_active=1;
    CREATE UNIQUE INDEX UX_menu_recipes_active ON dbo.menu_recipes(menu_item_id) WHERE is_active=1;
    CREATE UNIQUE INDEX UX_inventory_movements_consumption ON dbo.inventory_movements(order_item_id,recipe_ingredient_id) WHERE movement_type='consumption';
    CREATE UNIQUE INDEX UX_business_days_open ON dbo.business_days(status) WHERE status='open';
    CREATE INDEX IX_customer_addresses_account ON dbo.customer_addresses(customer_account_id);
    CREATE INDEX IX_order_status_history_order_time ON dbo.order_status_history(order_id,changed_at,status_history_id);
    CREATE INDEX IX_inventory_items_unit ON dbo.inventory_items(unit_id);
    CREATE INDEX IX_recipe_ingredients_stock ON dbo.recipe_ingredients(inventory_item_id);
    CREATE INDEX IX_inventory_movements_stock_time ON dbo.inventory_movements(inventory_item_id,recorded_at,movement_id) INCLUDE(quantity_delta);
    CREATE INDEX IX_system_audit_entity_time ON dbo.system_audit_log(entity_type,entity_key,occurred_at);
    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    THROW;
END CATCH;
GO
