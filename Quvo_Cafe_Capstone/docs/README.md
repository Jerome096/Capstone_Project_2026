# Quvo Café Frontend Clean Version

This version contains the modular frontend only. All seeded/demo business records have been removed so the next phase can connect each module to the SQL database.

## Removed from the frontend

- Default username and password
- Browser-stored credentials
- Sample customer sessions
- Sample orders and receipts
- Sample menu items and prices
- Sample reports and sales history
- Sample inventory items, movements, and Bill of Materials records
- Sample alerts and activity logs
- Sample table records
- Legacy combined backup folder

## Frontend behavior before backend integration

The root `index.html` still opens the Login interface. Login verification is intentionally inactive because no user account should be hardcoded in the frontend. During frontend development, open the workspaces directly through a local web server:

- `admin/index.html`
- `cashier/index.html`
- `barista/index.html`

These direct workspace routes run in **Frontend Preview** mode until PHP/MySQL authentication is implemented. Data entered while testing exists only in page memory and is not persisted after refresh.

## Running the project

Use VS Code Live Server or another local web server. Do not open module fragments with `file://`.

## Next phase

Create the SQL database and connect modules one by one. Suggested starting order: accounts/roles, tables, menu/categories, inventory/BOM, customer sessions, orders/order items, payments/receipts, alerts, audit records, and reporting queries.
