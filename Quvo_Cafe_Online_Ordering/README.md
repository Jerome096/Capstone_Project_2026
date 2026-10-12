# Quvo Café Online Ordering

Separate online customer UI copied from the existing customer app. The original dine-in app is retained.

## Folders

- account: customer profile and logout
- assets: branding images
- cart: cart screen and controls
- checkout: pickup, delivery request, and payment preferences
- login: online account login
- menu: menu screen and item customization
- orders: online order history
- register: online account registration
- shared: styles, navigation, browser storage, and startup
- tracking: online order tracking

## Open locally

Run your existing PHP server from Quvo_Cafe_Capstone with router.php, then open http://localhost:8080/online/. The folder can also be served directly by a static HTTP server. Opening index.html directly as a file will not load its fragments.

## Current status

Connected to QuvoCafeDB through api/index.php and the shared PHP backend. Accounts use hashed passwords and a separate HttpOnly session cookie. Profiles, default addresses, menu, order lines, fulfillment, payment preferences, and history are stored in SQL. Status polls show cashier updates; there are no simulated timers or seeded records.

Apply database/09_online_ordering.sql after migrations 00-08. Existing browser-only prototype accounts are not imported; register an account in SQL. Payment preferences do not charge a customer; cashier confirmation records the actual full payment. Delivery remains staff-coordinated. Session storage keeps only an unconfirmed order for idempotent retry.
