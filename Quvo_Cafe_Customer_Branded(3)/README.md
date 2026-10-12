# Quvo Café Dine-in Ordering

This folder now contains only the dine-in UI and its existing SQL-connected APIs.

Open http://localhost:8080/customer/?table=1 through the existing PHP router. Use the table's actual QR code for other tables. Opening without a table displays the QR prompt.

Folders retained: api, assets, cart, checkout, dine-in, menu, orders, shared, tracking. The orders folder retains dine-in-orders.js, which submits and tracks SQL-backed orders. Online accounts, login, registration, and browser order history are in the separate Quvo_Cafe_Online_Ordering folder, available at /online/.

The existing SQL session approval, inactivity timer, assistance requests, order submission, order tracking, and cashier payment popup are preserved. No database or PHP API changes were made by this folder cleanup.
