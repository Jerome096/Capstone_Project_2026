# Quvo Café customer ordering prototype

> Dine-in session approvals now use PHP and SQL Server. Start the staff project with `php -S 0.0.0.0:8080 -t . router.php`, then open `http://localhost:8080/customer/index.html?table=YOUR-TABLE-CODE`. See the staff project's SESSION_APPROVALS.md. The Live Server instructions below apply only to the remaining online prototype.

## Start in VS Code

1. Open this customer project folder in VS Code.
2. Right-click **index.html → Open with Live Server**.
3. The normal address opens online login (or the menu for an existing signed-in customer). A table QR link such as **index.html?table=1** opens dine-in directly.

There is one main index.html. The other HTML files are screen fragments assembled by the loader. Keep all module folders together. Double-clicking index.html uses file:// and cannot load the fragments; use a local web server.

## Where to edit

| Folder        | Purpose                                                       |
| ------------- | ------------------------------------------------------------- |
| login         | Sign-in and login/register tabs                               |
| register      | Customer registration                                         |
| dine-in       | Table QR request and real SQL-backed staff approval           |
| menu          | Menu data, search, categories, and item customization         |
| cart          | Cart contents, quantities, and floating cart button           |
| checkout      | Pickup/delivery details, payment choice, and order submission |
| tracking      | Current order and simulated status updates                    |
| orders        | Online order history                                          |
| account       | Profile, password, and logout                                 |
| shared        | App state, storage, navigation, helpers, loader, and startup  |
| shared/css    | Common controls, layout, and branding                         |
| assets/images | Shared logo, cover, and favicon                               |

Each module has working HTML, CSS, and JavaScript. HTML defines its controls; CSS styles them; JavaScript handles their behavior.
Common styles load first, followed by module styles and the existing brand overrides.

## How the files connect

The main page links the styles and marks where each HTML fragment belongs. **shared/loader.js** loads these fragments, then loads the classic JavaScript files in order. **shared/bootstrap.js** initializes screens and attaches event handlers once their controls exist.
Module functions share the existing state in **shared/state.js**. Persistence helpers are in **shared/storage.js**. The empty menu data container and workflow labels are in **menu/menu-data.js**.
When adding a module, update the main page’s placeholders/styles and the script list in the loader.

## Empty starting data

There are no built-in customer accounts, menu items, add-on prices, or sample orders. The menu displays an empty state until real records are connected.

The app uses a fresh browser-storage namespace, so earlier prototype accounts, sessions, and orders are not loaded. Old browser keys are left untouched. Accounts manually registered after this cleanup can still be used locally; no default account is created.

Dine-in requires a table QR URL instead of assuming Table 1.

## Prototype boundary

The customer app remains a frontend prototype. Accounts manually registered in this frontend, including their passwords, active login, and history still use browser localStorage. Use invented test details until backend authentication is integrated.
Cashier approval now uses real SQL sessions and staff decisions. Dine-in checkout is disabled until order storage is connected; online order progress still uses simulated timers.
Future PHP/SQL Server integration must replace browser authentication with server-side password hashing, authorization, sessions, and real order storage.

## Formatting and backup

Use two-space indentation. The Prettier configuration is in .prettierrc.json.
New session code includes short explanatory comments.

## Phones and tablets

The layout fills phone and tablet screens in portrait or landscape. Larger screens use wider content and two menu columns. Forms and item details scroll inside the visible screen; bottom navigation includes safe-area spacing. Shared responsive rules are in shared/css/responsive.css. The viewport helper in shared/viewport.js adjusts the app height for browser-bar and keyboard resizing while preserving pinch zoom.

For a physical-device check, run Live Server on the computer and connect the device to the same Wi-Fi. Open the computer’s local network address and Live Server port on the device (localhost on a phone refers to the phone itself).

## Table 1 QR

One customer system has two entry modes; there is no welcome chooser.

- Table QR: http://192.168.1.2:8080/customer/index.html?table=1
- Online prototype entry: http://192.168.1.2:8080/customer/index.html
- Scannable image: [Table 1 QR](assets/qr/table-1.png)

The QR points to the PHP server and the registered Table 1 code. Connect the phone to the same local network. Regenerate the QR if the PC's address or port changes.

A table link opens the request screen. Staff must approve the request in the operations Sessions module before that browser receives menu access.
