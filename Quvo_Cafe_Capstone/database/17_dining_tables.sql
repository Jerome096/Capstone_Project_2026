USE [QuvoCafeDB];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Real table configuration: add Tables 2-10 without changing existing tables or visits.
-- Re-running this migration does not create duplicate table codes.
INSERT INTO dbo.cafe_tables (table_code, table_name, area, is_active)
SELECT t.table_code, t.table_name, 'indoor', 1
FROM (VALUES
    ('2', N'Table 2'),
    ('3', N'Table 3'),
    ('4', N'Table 4'),
    ('5', N'Table 5'),
    ('6', N'Table 6'),
    ('7', N'Table 7'),
    ('8', N'Table 8'),
    ('9', N'Table 9'),
    ('10', N'Table 10')
) AS t(table_code, table_name)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.cafe_tables AS existing WITH (UPDLOCK, HOLDLOCK)
    WHERE existing.table_code = t.table_code
);

COMMIT;
GO
