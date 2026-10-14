# Dine-in tables

Ten real dine-in tables are registered in `QuvoCafeDB`. Each ordering link selects
its own SQL table and uses the existing cashier approval and inactivity timer.
Adding a table does not create a customer session; the customer enters their name
and requests approval from that table's link.

| Table | Ordering link on the server PC |
| --- | --- |
| Table 1 | [Open Table 1](http://localhost:8080/customer/?table=1) |
| Table 2 | [Open Table 2](http://localhost:8080/customer/?table=2) |
| Table 3 | [Open Table 3](http://localhost:8080/customer/?table=3) |
| Table 4 | [Open Table 4](http://localhost:8080/customer/?table=4) |
| Table 5 | [Open Table 5](http://localhost:8080/customer/?table=5) |
| Table 6 | [Open Table 6](http://localhost:8080/customer/?table=6) |
| Table 7 | [Open Table 7](http://localhost:8080/customer/?table=7) |
| Table 8 | [Open Table 8](http://localhost:8080/customer/?table=8) |
| Table 9 | [Open Table 9](http://localhost:8080/customer/?table=9) |
| Table 10 | [Open Table 10](http://localhost:8080/customer/?table=10) |

For phones/tablets or printed table QR codes, replace `localhost` with the server
PC's current Wi-Fi IPv4 address. Keep the table parameter, for example
`http://YOUR-PC-IP:8080/customer/?table=2`. Start the PHP server on `0.0.0.0:8080`
and connect the devices to the same network.

For another installation, apply `database/17_dining_tables.sql` after the existing
database migrations. It inserts missing codes 2–10 and can be rerun without duplicates.
