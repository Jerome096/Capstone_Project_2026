# Registration email verification

New online registrations send a six-digit code before creating the customer
account. Existing accounts can sign in without verification. This change only
verifies the email used at registration; it does not add login MFA or password
recovery. Profile email changes retain the existing profile workflow.

## Installation

1. Run `database/25_registration_email_otp.sql` in the selected Quvo SQL Server
   database. It is additive and safe to rerun. It adds two pending/rate tables and
   a nullable `customer_accounts.email_verified_at` column, without modifying
   existing customer, order, inventory, menu, or staff records.
2. Deploy the matching runtime files, including the bundled PHPMailer library.
3. Copy `config/mail.example.php` to `config/mail.local.php` on the server. The
   sender is `jeromepatol20@gmail.com`. Enter its Google App Password in the blank
   `password` field, without spaces. Do not use the ordinary Google password.
   Never commit this filled file or include it in an upload ZIP or screenshot.
   A `QUVO_MAIL_CONFIG_PATH` environment variable may instead point to a private
   PHP config outside the web root. The file returns an array and produces no
   page output. Protect the config directory from HTTP access on the host.
4. SMTP defaults to `smtp.gmail.com`, port 587, STARTTLS (`tls`). If the host
   requires implicit TLS, change port to 465 and encryption to `ssl`. Certificate
   and hostname verification stay enabled. PHP needs OpenSSL and outbound SMTP.
5. Refresh the online page. Register a new test email, check Inbox/Spam, enter the
   code, and confirm that the account opens. Test an existing account's login.
   Email configuration must be present on each server environment separately.

Do not upload the SQL script, filled config templates, or setup instructions
into a publicly downloadable website directory. SQL changes should precede
runtime changes. Missing configuration disables new registration with a clear
message; existing login and ordering continue to work.

## Behavior and storage

- Codes expire after ten minutes. Pending registration can be resumed from the
  same PHP session after refreshing, for up to an hour. No password or OTP is
  saved in browser storage. Other browsers cannot access that challenge.
- A server-side, HttpOnly cookie session holds a random 256-bit binding token.
  SQL stores its SHA-256 digest, a token-keyed HMAC of the code, and a password
  hash. A verification code alone cannot recover the pending signup.
- Five incorrect code attempts lock the challenge. A successful resend resets
  attempts, replaces the code, and gives another ten minutes. A successful
  verification atomically creates one verified account and deletes its challenge.
- SQL limits sends to one per email per minute, five per email per hour, and
  twenty per client IP per hour, across browser sessions. `REMOTE_ADDR` is used;
  untrusted forwarded headers are ignored. The existing login limits remain.
- Failed SMTP sends consume quota. The initial challenge is removed on failure;
  a failed resend expires the replacement code. An uncertain SMTP outcome may
  still deliver an email; request a fresh code after the cooldown if it fails.
- Pending records and rate buckets older than a day are purged opportunistically
  on new registration requests. No permanent customer account exists until code
  verification succeeds. Historical addresses are not used or changed here.
- SMTP debug is disabled; responses and errors never include passwords, tokens,
  codes, or raw SMTP responses. TLS certificate checking is not bypassed.
- PHPMailer 7.1.1 is bundled under `includes/lib/PHPMailer`, including its LGPL
  license. Upstream: https://github.com/PHPMailer/PHPMailer/tree/v7.1.1

## Validation

`php tests/registration-otp.php` runs local-only SQL checks with a CLI-only mail
capture callback. It rolls back schema additions and fixture rows and sends no
real emails. The HTTP API never accepts a test transport or exposes test codes.
The browser fixture checks both registration steps, mismatched passwords,
incorrect codes, resend cooldown, same-session reload recovery, sign-in after
verification, and responsive layouts. Actual Gmail delivery and the production
host's SMTP connectivity require a live test after private configuration.

Google setup: https://support.google.com/accounts/answer/185833
PHPMailer Gmail example: https://github.com/PHPMailer/PHPMailer/blob/v7.1.1/examples/gmail.phps
