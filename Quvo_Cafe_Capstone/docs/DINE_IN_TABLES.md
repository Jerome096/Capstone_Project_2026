# Dine-in tables

Ten real dine-in tables are registered in `QuvoCafeDB`. Each ordering link selects
its own SQL table and uses the existing cashier approval and inactivity timer.
Adding a table does not create a customer session; the customer enters their name
and requests approval from that table's link.

| Table | Hosted ordering link |
| --- | --- |
| Table 1 | [Open Table 1](https://quvocafe.opik.net/customer/?table=1) |
| Table 2 | [Open Table 2](https://quvocafe.opik.net/customer/?table=2) |
| Table 3 | [Open Table 3](https://quvocafe.opik.net/customer/?table=3) |
| Table 4 | [Open Table 4](https://quvocafe.opik.net/customer/?table=4) |
| Table 5 | [Open Table 5](https://quvocafe.opik.net/customer/?table=5) |
| Table 6 | [Open Table 6](https://quvocafe.opik.net/customer/?table=6) |
| Table 7 | [Open Table 7](https://quvocafe.opik.net/customer/?table=7) |
| Table 8 | [Open Table 8](https://quvocafe.opik.net/customer/?table=8) |
| Table 9 | [Open Table 9](https://quvocafe.opik.net/customer/?table=9) |
| Table 10 | [Open Table 10](https://quvocafe.opik.net/customer/?table=10) |

The updated [printable table cards](table-qr-cards/README.md) include PNG and SVG
artwork for all ten tables. The cards omit the printed domain label and retain
the table-specific links above. Customers can use the hosted links from any
device with internet access.

For local development, use `http://localhost:8080/customer/?table=N` on the server
PC. On another device connected to the same Wi-Fi, replace `localhost` with the
server PC's IPv4 address and start PHP on `0.0.0.0:8080`.

For another installation, apply `database/17_dining_tables.sql` after the existing
database migrations. It inserts missing codes 2–10 and can be rerun without duplicates.
