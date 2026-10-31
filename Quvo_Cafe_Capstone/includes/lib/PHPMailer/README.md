PHPMailer 7.1.1, downloaded unmodified from the official v7.1.1 release.

Source: https://github.com/PHPMailer/PHPMailer/tree/v7.1.1
License: LGPL 2.1, see LICENSE in this directory.

Only PHPMailer.php, SMTP.php and Exception.php are bundled. Quvo uses SMTP
authentication over verified TLS; debug output is disabled. OAuth and other
optional transports are not included. SMTP credentials belong in private
config/mail.local.php, which must never be committed or packaged.
