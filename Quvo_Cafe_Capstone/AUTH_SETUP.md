# Local PHP authentication

From PowerShell in this project directory, run:

```powershell
& "C:\php\php-8.5.10-nts-Win32-vs17-x64\php.exe" -S localhost:8080 -t .
```

Open http://localhost:8080/login/login.php and use your existing staff account.
Keep the terminal running; Ctrl+C stops the development server. VS Code Live
Server cannot execute PHP. This command serves only the local computer.

## How it works

- `config/database.php` connects to QuvoCafeDB using the Windows identity running PHP.
- `api/auth/login.php` uses a prepared query and `password_verify()` against the stored hash. Passwords are not stored in browser storage.
- `includes/auth.php` manages the server session, CSRF tokens, and role checks. The session ID is renewed at login. Sessions expire after 30 minutes without a protected PHP page request; activity inside a JavaScript screen does not extend this timer.
- Workspace PHP entry pages recheck active status and role in SQL Server. There are two account roles: Admin and Staff. Staff login opens Cashier Operations and Staff can also use the Barista workspace. Only Admin can open the Admin workspace. Kitchen UI is not yet integrated.
- Logout requires POST and destroys the session. Old HTML entry points redirect to PHP.
- Admin actions check the signed-in account through `api/auth/admin.php`, which rechecks the active account and role in SQL Server. There is no separate manager password. Customize Menu opens the protected Admin workspace. This check covers the current frontend flow; future order-write endpoints must also enforce permissions when saving changes.
- Moving from Cashier or Barista Operations into Admin prompts the signed-in Admin to re-enter their own password. `api/auth/admin-confirm.php` verifies the stored hash and sets a server-session confirmation. Opening Operations clears that confirmation. Direct Admin URLs also require it. The initial password login counts as confirmation; navigating within Admin does not repeatedly prompt. Staff accounts cannot use this popup to become Admin. Five incorrect confirmation attempts cause a one-minute session cooldown.
- The approved Staff-role migration converted the former Cashier, Barista and Kitchen account roles to Staff. Login itself performs database reads only.

## Scope and next checks

Authentication and account management are connected. Other business modules have their own integration status. Static fragments contain UI templates, not database records; every future business API must enforce its own server-side permissions.

Test your actual password privately, then sign out and try opening `/admin/index.php` directly. It must return to login. Also test an inactive account and Staff access when those accounts are available.

Before deployment, use HTTPS with a trusted SQL Server certificate, a dedicated least-privileged database identity, and server-side login rate limiting. The current trusted-server-certificate setting and personal Windows identity are for local development. PHP's built-in server is for development only.

## Account management

Admin → Accounts supports updating your own username/password (current password required), creating/editing Staff accounts, password resets, and deactivation/reactivation. Each mutation has a confirmation dialog. Staff actions cannot modify Admin accounts. Usernames are unique; new passwords are hashed and are never returned by the staff-list API. Leave new-password fields blank to keep an existing password.

The accounts API requires an active Admin session, confirmed Admin workspace access, and a CSRF token for writes. Writes use a transaction; failures are rolled back. Password changes invalidate other sessions on their next protected PHP request. The current Admin session remains signed in after a successful self-update. Sessions created before the credential-stamp update must sign in again once. Deactivation also blocks the next protected request; already-rendered static screens are not remotely cleared.

The Accounts UI was checked in desktop and mobile browser layouts using simulated API responses. Account operations were tested against SQL Server with temporary records inside a rolled-back transaction; no real staff accounts were created by those tests.