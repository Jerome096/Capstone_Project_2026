# QuvoCafeDB SQL export

This folder contains the application database schema and a public-safe data snapshot exported on October 8, 2026 (Asia/Manila).

## Included

- All five application tables: roles, staff_users, menu_items, cafe_tables, and customer_sessions.
- Primary keys, foreign keys, unique constraints, defaults, checks, and indexes.
- Data: 2 roles, Table 1, and 2 menu items, preserving their existing IDs.

Staff account rows, password hashes, customer session rows, and guest token hashes are excluded from the data export. Their table definitions are included. SSMS diagram metadata is excluded.

This is a development snapshot, not a full database backup. A fresh import will have no login accounts; an admin account must be created separately with a PHP password_hash-generated password hash before login can work.

## Import with SSMS

Use SQL Server 2022 or newer. Connect to the intended instance and run these files in order:

1. 00_create_database.sql — creates QuvoCafeDB only if absent.
2. 01_schema.sql — creates the application tables and constraints.
3. 02_public_data.sql — inserts the exported roles, table, and menu records.

The schema script requires that the application tables do not already exist. The data script requires empty roles, cafe_tables, and menu_items tables. Both refuse to overwrite existing application data. Do not rerun them against the working database on your current PC.

For another database name, change QuvoCafeDB consistently in all three scripts before running them.

The export-manifest.json file records which tables and row counts were exported.

## Dine-in ordering migration

After the base schema and public data have been imported, run
`03_dine_in_orders.sql` once to add `orders`, `order_items`, and `payments`.
It preserves the existing tables and stops if any of these new objects already
exist. Do not rerun scripts 00-02 against an existing working database.

The PHP order backend and session closure checks require this migration.
See `../ORDER_BACKEND.md` for the API contract and local rollback checks.
The export manifest describes the original five-table snapshot, not this migration.

## GitHub hosting

These files let you download and recreate the database. Uploading SQL files does not host or run SQL Server, and this export does not change the application or demo configuration.
