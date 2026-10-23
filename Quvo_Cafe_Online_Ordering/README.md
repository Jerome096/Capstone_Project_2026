# Quvo Café Online Ordering

Separate online customer UI copied from the existing customer app. The original dine-in app is retained.

## Folders

- account: customer profile and logout
- assets: branding images
- cart: cart screen and controls
- checkout: pickup, delivery request, payment QR download, and required receipt upload
- login: online account login
- menu: menu screen and item customization
- orders: online order history
- register: online account registration
- shared: styles, navigation, browser storage, and startup
- tracking: online order tracking

## Open locally

Run your existing PHP server from Quvo_Cafe_Capstone with router.php, then open http://localhost:8080/online/. PHP and SQL Server are required; static hosting cannot run the account and order APIs.

## Current status

The approved public storefront includes Home, a searchable/filterable menu, and About Quvo. Guests can inspect menu photos and item options without an account. Adding an item or opening cart/history/account features requires login or registration. Authentication restores the intended item, quantity, notes and choices; changed prices/options require another review. Checkout, payment proof, saved retries and ready alerts remain connected to the existing backend.

Apply `Quvo_Cafe_Capstone/database/20_website_content.sql` after the existing migrations. Admin → Website content edits the About headline, introduction, story, address, opening hours, phone, email and social link. Admin confirmation and CSRF protection are required. Content is stored as plain text in SQL and shared across customer devices; empty contact fields remain hidden. A version check prevents concurrent admins from overwriting one another. Draft preview does not publish until Save website content is pressed.

Connected to QuvoCafeDB through api/index.php and the shared PHP backend. Accounts use hashed passwords and a separate HttpOnly session cookie. Profiles, default addresses, menu, order lines, fulfillment, payment preferences, and history are stored in SQL. Status polls show cashier updates; there are no simulated timers or seeded records.

Apply database/09_online_ordering.sql after migrations 00-08, then database/10_online_payment_images.sql and database/11_manage_online_payment_methods.sql. Existing browser-only prototype accounts are not imported; register an account in SQL. Delivery remains staff-coordinated.

Admins manage methods and images through Admin → Payment QR codes. They can add a named online payment method, upload/replace/remove its QR, or remove the method from new checkouts. Cash cannot be added to online ordering. Removed methods keep their historical identity and receipts; re-adding the same name requires a new QR. Checkout loads the active methods dynamically. An unconfigured method cannot accept new orders. Checkout displays and downloads the chosen QR, shows the total and manual payment instructions, and requires a PNG/JPG receipt up to 2 MB. The backend checks receipt format and the current QR version before saving the order and proof together in SQL. Receipt images are private to the customer and authorized cashier/admin staff.

Receipt submission does not confirm a transfer. Cashiers must check the receiving account before confirming the full payment. The cashier customer-details popup displays the saved image; an admin receipt collection is deferred. Historical orders without images remain readable. Session storage temporarily keeps the receipt and unconfirmed order for idempotent retry; it is cleared after a confirmed submission or recovered retry. QR/receipt bytes and live customer data must not be exported into public seed scripts.

QR and receipt pickers accept tablet images. JPG/PNG stay in their original format;
browser-readable WebP, GIF, BMP, AVIF, and HEIC/HEIF are converted locally to PNG.
HEIC/HEIF requires native browser decoding support; otherwise export as JPG/PNG or
use a screenshot. No external image-conversion service is used. Original and saved
images must fit the 2 MB limit and 16-million-pixel limit. Animated images become
a single still image. The backend continues to validate stored PNG/JPG bytes.
