# Quvo Café Kitchen

The kitchen UI is organized into login, dashboard, orders, alerts, shared, and assets folders. Each screen has its own HTML fragment, CSS, and JavaScript. Root index.html assembles the modules.

The kitchen is connected to QuvoCafeDB through the protected api/index.php endpoint. Sign in with an existing active Staff or Admin account; a Kitchen role is also accepted if configured. There are no demo accounts or seeded tickets. Old kitchen sample-cache data is cleared without touching other app storage.

Run the existing PHP server from Quvo_Cafe_Capstone using router.php and open /kitchen/. VS Code Live Server and direct file:// access cannot run the PHP API. Apply database/13_kitchen_tickets.sql once after the earlier migrations.

The queue refreshes every five seconds and includes only paid Preparing/Ready orders with food items, from dine-in, online and walk-in POS. It shows SQL item snapshots, quantities and notes. Delayed tickets and special food notes appear in preparation alerts. Search and category filtering work on the live queue.

Mark as Ready saves the food ticket's readiness, time and staff member in SQL. Food-only orders also advance to Ready in cashier order management. For mixed orders, food readiness is separate: the full order stays Preparing until the existing cashier/barista action marks it Ready. Existing cashier payment and serving behavior is preserved. Served/cancelled orders disappear from this queue. Repeating Ready does not duplicate the record.

Sign-in and changes use CSRF protection and server-checked roles. The kitchen sees no receipt images or private payment/contact details. When disconnected it retains the last queue and disables Ready until refreshed. Staff sessions are shared with the other staff workspaces, so signing out also signs out those tabs.

Verify with `C:\php85\php.exe tests/kitchen.php` from Quvo_Cafe_Capstone. All SQL fixture rows roll back. The old kitchen-ui-v3/index.html link redirects here.
