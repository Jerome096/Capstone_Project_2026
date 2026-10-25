<?php
declare(strict_types=1);
// Calendar-day regression suites explicitly exercise the preserved legacy schedule.
// Every caller must roll back its enclosing transaction.
function operating_test_calendar(PDO $db):void {
    if(!$db->inTransaction())throw new LogicException('A rollback transaction is required.');
    if($db->query("SELECT OBJECT_ID('dbo.operating_hours_schedule','U')")->fetchColumn())
        $db->exec('DELETE dbo.operating_hours_schedule WHERE legacy_calendar=0');
}
