# Adviser Presentation Notes

## Recommended demonstration sequence

1. Sign in as staff.
2. Show Dashboard and current shift overview.
3. Approve a dine-in session.
4. Open Counter POS and create a manual order.
5. Demonstrate payment review.
6. Show the order in Order Management.
7. Show beverage data in Barista Data.
8. Show Receipts and transaction records.
9. Unlock Admin access.
10. Show Reports, Menu Management, Inventory/BOM, Sales History, and System Records.
11. Return to a cashier module and point out that Admin access locks again.
12. Demonstrate Logout separately from End of Day.

## What is real in this front-end build

- Navigation and screen states
- POS cart and customization interactions
- Cash / GCash / PayMaya selection flows
- Session approval/rejection behavior
- Order status simulation
- Receipt generation/display
- Admin authorization simulation
- Menu editing
- Inventory and BOM calculations
- EOD record simulation
- Browser session persistence for staff sign-in

## What will be replaced by PHP/MySQL

- Real staff accounts and password hashing
- Server-side sessions and role authorization
- Shared customer/cashier/kitchen orders
- Persistent payments and receipts
- Persistent inventory/BOM transactions
- Real-time Kitchen/Barista synchronization
- Audit logs stored in the database
- Production EOD/report data
