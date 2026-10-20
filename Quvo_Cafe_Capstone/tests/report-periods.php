<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/../includes/reports.php';
$checks=0;
function verify_range(string $period,string $date,array $expected):void {
    global $checks;
    $actual=reports_range($period,$date)['params'];
    if($actual!==$expected)throw new RuntimeException('Incorrect Philippine range: '.$period.' '.$date.' '.json_encode($actual));
    $checks++;
}
verify_range('daily','2026-10-20',['2026-10-19 16:00:00','2026-10-20 16:00:00']);
verify_range('daily','2024-02-29',['2024-02-28 16:00:00','2024-02-29 16:00:00']);
verify_range('monthly','2024-02',['2024-01-31 16:00:00','2024-02-29 16:00:00']);
verify_range('monthly','2025-02',['2025-01-31 16:00:00','2025-02-28 16:00:00']);
verify_range('monthly','2026-12',['2026-11-30 16:00:00','2026-12-31 16:00:00']);
verify_range('yearly','2026',['2025-12-31 16:00:00','2026-12-31 16:00:00']);
foreach([['overall','all'],['daily','all'],['daily','2026-02-29'],['monthly','2026-13'],['yearly','2026-10'],['yearly','0000'],['yearly','10000'],['monthly',[]],[[],'2026'],['daily',"2026-10-20'"]] as [$period,$date]){
    try{reports_range($period,$date);}catch(OrderError $error){if($error->status!==422)throw $error;$checks++;continue;}
    throw new RuntimeException('Invalid report period accepted.');
}
echo "$checks report calendar checks passed without database access.\n";
