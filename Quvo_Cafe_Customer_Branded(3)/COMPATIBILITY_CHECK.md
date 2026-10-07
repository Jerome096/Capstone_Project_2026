# Customer module refactor checks

- One active entry page assembles all fragments before initializing JavaScript.
- Existing module structure retained. Sample data removed; fresh storage keys isolate earlier prototype records.
- Existing controls and unique HTML IDs retained.
- Shared and module CSS compared against the original at mobile and desktop widths.
- Login, registration, menu filtering, customization, delivery validation, pickup/delivery checkout, tracking, history, profile/password updates, persistent login, and table QR flows checked in a browser.
- Cashier approval and order progress checked using accelerated browser timers.
- No backend dependency added. This is still a frontend demonstration.

Future integration uses PHP/SQL Server. Demo browser-stored passwords must be replaced by server-side password hashing and session management.

## Empty-data checks

Sample login must fail; old cached prototype sessions must not restore. Menu, cart, and order history start empty. Missing or malformed browser records load as empty arrays. Registration remains a local frontend feature until SQL Server integration.
