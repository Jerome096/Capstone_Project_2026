USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
CREATE TABLE dbo.kitchen_ticket_readiness (
    order_id bigint NOT NULL CONSTRAINT PK_kitchen_ticket_readiness PRIMARY KEY,
    ready_at datetime2(0) NOT NULL CONSTRAINT DF_kitchen_ticket_ready_at DEFAULT SYSUTCDATETIME(),
    ready_by_staff_id int NOT NULL,
    CONSTRAINT FK_kitchen_ticket_order FOREIGN KEY(order_id) REFERENCES dbo.orders(order_id),
    CONSTRAINT FK_kitchen_ticket_staff FOREIGN KEY(ready_by_staff_id) REFERENCES dbo.staff_users(staff_id)
);
COMMIT;
GO
