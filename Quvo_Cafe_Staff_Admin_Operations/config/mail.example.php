<?php
// Copy as config/mail.local.php on the server. Never commit the filled file.
// Google App Password only; do not use your normal Gmail password.
return [
    'host' => 'smtp.gmail.com',
    'port' => 587,
    'encryption' => 'tls',
    'username' => 'jeromepatol20@gmail.com',
    'password' => '', // Paste the 16-character App Password here, without spaces.
    'from_email' => 'jeromepatol20@gmail.com',
    'from_name' => 'Quvo Cafe',
];
