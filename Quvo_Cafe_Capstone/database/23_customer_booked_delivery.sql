-- Customer-booked Lalamove pickups; existing orders and delivery addresses are retained.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.order_fulfillments','U') IS NULL
    THROW 50001, 'Install online ordering before customer-booked delivery.', 1;
IF COL_LENGTH('dbo.order_fulfillments','delivery_provider') IS NULL
    ALTER TABLE dbo.order_fulfillments ADD delivery_provider varchar(20) NULL;
IF COL_LENGTH('dbo.order_fulfillments','pickup_address_snapshot') IS NULL
    ALTER TABLE dbo.order_fulfillments ADD pickup_address_snapshot nvarchar(500) NULL;
IF COL_LENGTH('dbo.order_fulfillments','cafe_phone_snapshot') IS NULL
    ALTER TABLE dbo.order_fulfillments ADD cafe_phone_snapshot nvarchar(50) NULL;
IF COL_LENGTH('dbo.order_fulfillments','cafe_facebook_snapshot') IS NULL
    ALTER TABLE dbo.order_fulfillments ADD cafe_facebook_snapshot nvarchar(500) NULL;
IF OBJECT_ID('dbo.CK_order_fulfillments_3','C') IS NOT NULL
    ALTER TABLE dbo.order_fulfillments DROP CONSTRAINT CK_order_fulfillments_3;
-- Dynamic SQL compiles after the newly added columns exist.
EXEC(N'ALTER TABLE dbo.order_fulfillments WITH CHECK ADD CONSTRAINT CK_order_fulfillments_3 CHECK (
    (fulfillment_type=''pickup'' AND address_id IS NULL AND address_snapshot IS NULL AND delivery_provider IS NULL AND pickup_address_snapshot IS NULL)
    OR (fulfillment_type=''delivery'' AND contact_snapshot IS NOT NULL AND LEN(LTRIM(RTRIM(contact_snapshot)))>0 AND (
        (delivery_provider IS NULL AND address_snapshot IS NOT NULL AND LEN(LTRIM(RTRIM(address_snapshot)))>0)
        OR (delivery_provider=''lalamove'' AND address_id IS NULL AND address_snapshot IS NULL AND pickup_address_snapshot IS NOT NULL AND LEN(LTRIM(RTRIM(pickup_address_snapshot)))>0)
    ))
)');
IF OBJECT_ID('dbo.online_delivery_bookings','U') IS NULL
    CREATE TABLE dbo.online_delivery_bookings (
        order_id bigint NOT NULL CONSTRAINT PK_online_delivery_bookings PRIMARY KEY,
        image_mime varchar(20) NOT NULL,
        image_bytes varbinary(max) NOT NULL,
        image_hash binary(32) NOT NULL,
        uploaded_at datetime2(0) NOT NULL CONSTRAINT DF_online_delivery_bookings_uploaded DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_online_delivery_bookings_order FOREIGN KEY(order_id) REFERENCES dbo.orders(order_id),
        CONSTRAINT CK_online_delivery_bookings_mime CHECK(image_mime IN ('image/png','image/jpeg')),
        CONSTRAINT CK_online_delivery_bookings_size CHECK(DATALENGTH(image_bytes) BETWEEN 1 AND 2097152)
    );
COMMIT TRANSACTION;
