# Menu photos and customer options

In Admin > Menu edit, select an item or choose Add item. Choose a photo, add option
groups, and save the item. Each group has a name, a Dropdown or Radio buttons
control, choices, an optional default, and a Customer must choose setting.
Groups work for food, pastries, coffee and other drinks. An item can have up to
10 groups with up to 20 choices each. Choices use the item's listed price.

For example, add a required Milk group with No milk, Fresh milk and Oat milk.
Use Radio buttons to show the choices immediately or Dropdown to save space.
Optional groups include No preference. Remove unwanted groups to offer an item
without customization. Existing drinks initially retain their sugar/ice groups.

Photos appear in the dine-in and online menus and customization dialogs, and in
the staff POS. JPG, PNG, WebP, GIF, BMP, AVIF, SVG, HEIC/HEIF and TIFF are accepted
up to 25 MB. The browser converts the chosen image to an optimized static JPEG
of at most 1600 pixels on either side and 2 MB before uploading it. Multi-page or
animated inputs become one static photo. Invalid or unsupported files show an
error. Conversion stays in the admin browser. Remove photo and Save changes
removes an existing picture.

Selections are validated against the current menu on the server. The order saves
the chosen group and choice names as a snapshot, so later menu edits do not
rewrite preparation details. Choices appear in carts, staff orders, preparation
tickets and kitchen details. If choices change before checkout, the customer can
refresh the menu and edit the cart. Accepted order retries retain the original
snapshot and do not create another payment.

## Database and hosting

Run `database/18_menu_photos_options.sql` once before uploading the new application
files. It adds `menu_items.option_groups_json` and `menu_item_images`. Existing
menu rows are preserved. The script can be run again safely. No database restore
is needed. Images are stored in SQL and served with validated image MIME types
and versioned URLs; no writable public uploads directory is needed.

Image decoder notices and source links are in
`shared/image-decoders/licenses.html`. Unmodified heic-to 1.6.6, UTIF.js 3.1.0
and pako 1.0.11 load only when an admin chooses a format needing them.

## Verification

`C:\php85\php.exe tests/menu-configuration.php` checks photo storage, option
validation, saved snapshots and payment retries, then rolls back its fixtures.
The existing orders, POS, online, inventory and kitchen SQL suites also pass.
Cart editing, checkout retry and preparation ticket JavaScript suites pass.
An isolated browser checked the actual editor and customer apps at phone,
tablet and desktop sizes, including real HEIC/AVIF files and TIFF conversion.
