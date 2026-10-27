<?php
declare(strict_types=1);
require_once __DIR__.'/website-content.php';
require_once __DIR__.'/payment-images.php';

function delivery_settings(PDO $db): array
{
    $content=website_content_read($db)['content'];
    $address=trim($content['address']??'');$phone=trim($content['phone']??'');$social=trim($content['social']??'');
    $parts=parse_url($social);$host=strtolower($parts['host']??'');
    $facebook=is_array($parts)&&($parts['scheme']??'')==='https'&&!isset($parts['user'])&&!isset($parts['pass'])&&
        ($host==='facebook.com'||str_ends_with($host,'.facebook.com')||in_array($host,['m.me','fb.me'],true))?$social:'';
    $dial=preg_replace('/[^+0-9]/','',$phone);
    $phoneLink=preg_match('/\A\+?[0-9]{5,15}\z/',$dial)?'tel:'.$dial:'';
    return ['address'=>$address,'phone'=>$phone,'phoneLink'=>$phoneLink,'facebook'=>$facebook,
        'available'=>$address!==''&&($phoneLink!==''||$facebook!==''),
        'version'=>hash('sha256',json_encode([$address,$phone,$facebook],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)),
        'bookingUrl'=>'https://www.lalamove.com/en-ph/'];
}

function delivery_booking_input(mixed $value): array
{
    try {return payment_receipt_input($value);} catch(OrderError $error) {
        throw new OrderError('Upload a valid PNG or JPG screenshot of your Lalamove booking, up to 2 MB.',422,'delivery_booking_required');
    }
}

function delivery_booking_image(PDO $db,int $orderId,?int $customerId=null): array
{
    $q=$db->prepare("SELECT b.image_mime,CONVERT(varchar(max),b.image_bytes,2) image_hex
        FROM dbo.online_delivery_bookings b JOIN dbo.orders o ON o.order_id=b.order_id
        JOIN dbo.order_fulfillments f ON f.order_id=o.order_id
        WHERE o.order_source='online' AND f.fulfillment_type='delivery' AND o.order_id=?".
        ($customerId!==null?' AND o.customer_account_id=?':''));
    $q->execute($customerId!==null?[$orderId,$customerId]:[$orderId]);
    return $q->fetch()?:throw new OrderError('Lalamove booking image not found.',404);
}
