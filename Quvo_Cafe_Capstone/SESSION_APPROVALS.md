# SQL session approvals

The customer sends a request from a table QR link. Staff approve or reject it in Cashier → Sessions. Approval opens the customer menu; staff close the session when the group leaves. Rejected, cancelled, and closed requests stay in SQL.

## Start the project

Keep Quvo_Cafe_Capstone and Quvo_Cafe_Customer_Branded(3) beside each other.
Open the staff project folder containing router.php in VS Code, then run this in its PowerShell terminal:

```powershell
& "C:\php\php-8.5.10-nts-Win32-vs17-x64\php.exe" -S 0.0.0.0:8080 -t . router.php
```

Keep the terminal running. If an older server is using port 8080, stop that server with Ctrl+C before starting this command.

- Staff login: http://localhost:8080/login/login.php
- Customer table link: http://localhost:8080/customer/index.html?table=YOUR-TABLE-CODE

Replace YOUR-TABLE-CODE with an existing active cafe_tables.table_code. On a phone, replace localhost with the PC's Wi-Fi IPv4 address and use the same Wi-Fi. Live Server cannot run the PHP API.

Table 1 is registered with code 1. Its refreshed customer QR image is in the customer folder at assets/qr/table-1.png and encodes http://192.168.1.2:8080/customer/index.html?table=1. Regenerate it if this PC's local address or server port changes.

## Database

This update uses your existing dbo.cafe_tables and dbo.customer_sessions structures and the existing connection in config/database.php. It does not recreate tables or insert sample business data.

Check your registered table codes in SSMS:

```sql
USE QuvoCafeDB;
SELECT table_id, table_code, table_name, is_active
FROM dbo.cafe_tables;
```

An empty result means the structure exists but actual café tables still need to be registered. The customer page shows a clear message for an unknown or inactive table.

## How to test

1. Open a registered table link on a phone or another browser.
2. Enter a customer name and request approval.
3. In Cashier → Sessions, verify the customer's name and table, then approve.
4. The customer page updates within about five seconds and opens the menu.
5. Close the session when the customer leaves; menu access ends on the next status check.
6. Select All history, Rejected, Cancelled, or Closed in Sessions to see saved records.

Only one customer group can be active at a table. Each new visit requires a new request. The same browser restores its existing pending/active request on refresh. A different browser cannot access that session merely by knowing its number.

## Changed modules

- includes/dining.php validates session changes and locks the table during approval.
- api/dining/index.php checks staff identity and CSRF before saving decisions.
- cashier/sessions/ reads the live SQL queue and handles staff actions.
- Customer api/session.php stores guest proof in a separate HttpOnly cookie session and checks approval before serving menu data.
- Customer dine-in/ polls real session status; the automatic approval timer is removed.
- router.php serves both applications from the same local PHP address.

Short comments explain the new behavior in the code. Admin table management and Reports changes are deferred. Order persistence is a separate integration; dine-in checkout is disabled until a real order API is available.
