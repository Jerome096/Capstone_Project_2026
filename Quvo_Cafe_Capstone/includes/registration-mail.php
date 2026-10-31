<?php
declare(strict_types=1);

function registration_mail_config(): array
{
    $path = getenv('QUVO_MAIL_CONFIG_PATH') ?: __DIR__.'/../config/mail.local.php';
    $config = is_file($path) ? require $path : [];
    if (!is_array($config) || !filter_var($config['username'] ?? '', FILTER_VALIDATE_EMAIL)
        || !filter_var($config['from_email'] ?? '', FILTER_VALIDATE_EMAIL)
        || !is_string($config['password'] ?? null) || trim($config['password']) === ''
        || !is_string($config['host'] ?? null) || !preg_match('/\A[a-z0-9.-]+\z/i', $config['host'])
        || !in_array($config['encryption'] ?? '', ['tls','ssl'], true)
        || !in_array((int)($config['port'] ?? 0), [465,587], true)) {
        throw new OrderError('Email verification is not configured yet. Please contact Quvo or try again later.',503,'email_setup_required');
    }
    return $config;
}

function registration_send_code(string $email, string $code, ?callable $testSender = null): void
{
    if ($testSender !== null) {
        if (PHP_SAPI !== 'cli') throw new LogicException('Test mail transport is CLI-only.');
        $testSender($email, $code); return;
    }
    $config = registration_mail_config();
    require_once __DIR__.'/lib/PHPMailer/Exception.php';
    require_once __DIR__.'/lib/PHPMailer/SMTP.php';
    require_once __DIR__.'/lib/PHPMailer/PHPMailer.php';
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host = $config['host'];
        $mail->Port = (int)$config['port'];
        $mail->SMTPSecure = $config['encryption'];
        $mail->SMTPAuth = true;
        $mail->Username = $config['username'];
        $mail->Password = preg_replace('/\s+/', '', $config['password']);
        $mail->Timeout = 8;
        $mail->Timelimit = 10;
        $mail->SMTPDebug = 0;
        $mail->CharSet = 'UTF-8';
        $mail->setFrom($config['from_email'], $config['from_name'] ?? 'Quvo Cafe');
        $mail->addAddress($email);
        $mail->Subject = 'Your Quvo Cafe verification code';
        $mail->Body = "Your Quvo Cafe verification code is: $code\n\nThis code expires in 10 minutes. Enter it on the registration page to create your account.\n\nIf you did not request this code, you can ignore this email. Do not share the code with anyone.";
        $mail->send();
    } catch (Throwable) {
        // Never expose SMTP responses, credentials, or verification codes.
        throw new OrderError('We could not send the verification email. Please wait a minute and try again, or contact Quvo.',503,'email_send_failed');
    }
}
