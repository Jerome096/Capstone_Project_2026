-- Adds dine-in ordering to an existing QuvoCafeDB without replacing existing data.
-- Review this script before executing it in SSMS; it does not enable checkout by itself.
-- One confirmed full payment per order; split payments and refunds are excluded.
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

    IF OBJECT_ID(N'dbo.customer_sessions', N'U') IS NULL
       OR OBJECT_ID(N'dbo.menu_items', N'U') IS NULL
       OR OBJECT_ID(N'dbo.staff_users', N'U') IS NULL
        THROW 50100, 'Required application tables are missing. Review the existing schema first.', 1;

    IF OBJECT_ID(N'dbo.orders') IS NOT NULL
       OR OBJECT_ID(N'dbo.order_items') IS NOT NULL
       OR OBJECT_ID(N'dbo.payments') IS NOT NULL
        THROW 50101, 'Order or payment objects already exist. Nothing will be replaced.', 1;

    -- Each submission belongs to a customer visit; names are preserved for historical reports.
    CREATE TABLE dbo.orders (
        order_id bigint IDENTITY(1,1) NOT NULL,
        order_number AS ('QVO-' + CONVERT(varchar(20), order_id)) PERSISTED,
        session_id bigint NOT NULL,
        customer_name nvarchar(100) NOT NULL,
        submission_key uniqueidentifier NOT NULL,
        submission_hash binary(32) NOT NULL,
        total_amount decimal(12,2) NOT NULL,
        order_status varchar(12) NOT NULL
            CONSTRAINT DF_orders_status DEFAULT ('received'),
        created_at datetime2(0) NOT NULL
            CONSTRAINT DF_orders_created DEFAULT (SYSUTCDATETIME()),
        updated_at datetime2(0) NOT NULL
            CONSTRAINT DF_orders_updated DEFAULT (SYSUTCDATETIME()),
        updated_by_staff_id int NULL,
        cancelled_at datetime2(0) NULL,
        cancelled_by_staff_id int NULL,
        cancellation_reason nvarchar(500) NULL,

        CONSTRAINT PK_orders PRIMARY KEY CLUSTERED (order_id),
        CONSTRAINT UQ_orders_number UNIQUE (order_number),
        CONSTRAINT UQ_orders_submission UNIQUE (session_id, submission_key),
        -- This candidate key lets the payment foreign key enforce the exact full order amount.
        CONSTRAINT UQ_orders_id_total UNIQUE (order_id, total_amount),
        CONSTRAINT FK_orders_session FOREIGN KEY (session_id)
            REFERENCES dbo.customer_sessions (session_id),
        CONSTRAINT FK_orders_updated_by FOREIGN KEY (updated_by_staff_id)
            REFERENCES dbo.staff_users (staff_id),
        CONSTRAINT FK_orders_cancelled_by FOREIGN KEY (cancelled_by_staff_id)
            REFERENCES dbo.staff_users (staff_id),
        CONSTRAINT CK_orders_customer CHECK (LEN(LTRIM(RTRIM(customer_name))) > 0),
        CONSTRAINT CK_orders_total CHECK (total_amount >= 0),
        CONSTRAINT CK_orders_status CHECK (
            order_status IN ('received', 'preparing', 'ready', 'served', 'cancelled')
        ),
        CONSTRAINT CK_orders_times CHECK (updated_at >= created_at),
        CONSTRAINT CK_orders_cancellation CHECK (
            (
                order_status = 'cancelled'
                AND cancelled_at IS NOT NULL
                AND cancelled_at >= created_at
                AND cancelled_by_staff_id IS NOT NULL
                AND cancellation_reason IS NOT NULL
                AND LEN(LTRIM(RTRIM(cancellation_reason))) > 0
            )
            OR
            (
                order_status <> 'cancelled'
                AND cancelled_at IS NULL
                AND cancelled_by_staff_id IS NULL
                AND cancellation_reason IS NULL
            )
        )
    );

    -- Item snapshots keep old receipts accurate when the current menu is edited.
    CREATE TABLE dbo.order_items (
        order_item_id bigint IDENTITY(1,1) NOT NULL,
        order_id bigint NOT NULL,
        line_number smallint NOT NULL,
        menu_item_id int NOT NULL,
        item_name nvarchar(100) NOT NULL,
        category varchar(20) NOT NULL,
        unit_price decimal(10,2) NOT NULL,
        quantity smallint NOT NULL,
        line_total AS CONVERT(decimal(12,2), unit_price * quantity) PERSISTED,
        customization_json nvarchar(max) NOT NULL
            CONSTRAINT DF_order_items_customization DEFAULT (N'{}'),
        notes nvarchar(1000) NOT NULL
            CONSTRAINT DF_order_items_notes DEFAULT (N''),

        CONSTRAINT PK_order_items PRIMARY KEY CLUSTERED (order_item_id),
        CONSTRAINT UQ_order_items_line UNIQUE (order_id, line_number),
        CONSTRAINT FK_order_items_order FOREIGN KEY (order_id)
            REFERENCES dbo.orders (order_id),
        CONSTRAINT FK_order_items_menu FOREIGN KEY (menu_item_id)
            REFERENCES dbo.menu_items (menu_item_id),
        CONSTRAINT CK_order_items_line CHECK (line_number > 0),
        CONSTRAINT CK_order_items_name CHECK (LEN(LTRIM(RTRIM(item_name))) > 0),
        CONSTRAINT CK_order_items_category CHECK (
            category IN ('coffee', 'non-coffee', 'food', 'pastry')
        ),
        CONSTRAINT CK_order_items_price CHECK (unit_price >= 0),
        CONSTRAINT CK_order_items_quantity CHECK (quantity BETWEEN 1 AND 999),
        CONSTRAINT CK_order_items_customization CHECK (
            ISJSON(customization_json) = 1 AND DATALENGTH(customization_json) <= 8000
        )
    );

    -- A row exists only after the cashier confirms receipt of the entire payment.
    CREATE TABLE dbo.payments (
        payment_id bigint IDENTITY(1,1) NOT NULL,
        order_id bigint NOT NULL,
        payment_method varchar(10) NOT NULL,
        amount_applied decimal(12,2) NOT NULL,
        amount_received decimal(12,2) NOT NULL,
        change_amount decimal(12,2) NOT NULL,
        payment_reference nvarchar(100) NULL,
        received_by_staff_id int NOT NULL,
        paid_at datetime2(0) NOT NULL
            CONSTRAINT DF_payments_paid DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_payments PRIMARY KEY CLUSTERED (payment_id),
        CONSTRAINT UQ_payments_order UNIQUE (order_id),
        -- The amount applied must equal the order total, including for digital payments.
        CONSTRAINT FK_payments_order_total FOREIGN KEY (order_id, amount_applied)
            REFERENCES dbo.orders (order_id, total_amount),
        CONSTRAINT FK_payments_staff FOREIGN KEY (received_by_staff_id)
            REFERENCES dbo.staff_users (staff_id),
        CONSTRAINT CK_payments_method CHECK (
            payment_method IN ('Cash', 'GCash', 'PayMaya')
        ),
        CONSTRAINT CK_payments_amounts CHECK (
            amount_applied >= 0
            AND amount_received >= amount_applied
            AND change_amount >= 0
            AND change_amount = amount_received - amount_applied
        ),
        CONSTRAINT CK_payments_digital_amount CHECK (
            payment_method = 'Cash'
            OR (amount_received = amount_applied AND change_amount = 0)
        ),
        CONSTRAINT CK_payments_reference CHECK (
            payment_reference IS NULL
            OR (payment_method <> 'Cash' AND LEN(LTRIM(RTRIM(payment_reference))) > 0)
        )
    );

    CREATE INDEX IX_orders_status_created
        ON dbo.orders (order_status, created_at, order_id)
        INCLUDE (session_id, customer_name, total_amount);

    CREATE INDEX IX_order_items_menu
        ON dbo.order_items (menu_item_id);

    CREATE INDEX IX_payments_paid
        ON dbo.payments (paid_at, payment_id)
        INCLUDE (order_id, payment_method, amount_applied, received_by_staff_id);

    COMMIT TRANSACTION;
    PRINT 'Created orders, order_items and payments. Existing records were preserved.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

-- PHP integration still needs to enforce these rules in transactions:
-- 1. Verify the guest token, active session and active table before accepting an order.
-- 2. Read current available menu prices from SQL; never accept customer-supplied totals.
-- 3. Save the order and all its items together; their line totals must equal total_amount.
-- 4. Reuse a submission key on retries and compare submission_hash before returning an old order.
-- 5. Lock the order before payment/cancellation; never pay a cancelled order or cancel a paid one.
-- 6. Keep confirmed payments and submitted item snapshots immutable; no delete/refund endpoint.
-- 7. Require payment before preparation, and prevent session closure with unfinished/unpaid orders.
-- 8. Derive unpaid/paid from the absence/presence of a payments row; cancelled orders are not payable.
-- 9. Use the same table/session lock order as includes/dining.php to serialize closure and submission.
