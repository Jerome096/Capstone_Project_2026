param([string]$PhpPath = 'C:\php85\php.exe')
$ErrorActionPreference = 'Stop'
$workerPath = Join-Path $PSScriptRoot 'expire-dining-sessions.php'
if (!(Test-Path -LiteralPath $PhpPath) -or !(Test-Path -LiteralPath $workerPath)) {
    throw 'PHP or the session expiry worker could not be found.'
}
$silentPhpPath = Join-Path (Split-Path -Parent $PhpPath) 'php-win.exe'
if (!(Test-Path -LiteralPath $silentPhpPath)) {
    throw 'php-win.exe is required to run session expiry without flashing a console window.'
}
$taskName = 'QuvoCafe-ExpireDiningSessions'
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    throw "Task $taskName already exists. Review it before replacing it."
}
$arguments = '"' + $workerPath + '"'
$action = New-ScheduledTaskAction -Execute $silentPhpPath -Argument $arguments -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -Hidden -ExecutionTimeLimit (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Close inactive Quvo dine-in sessions, protecting outstanding orders.' | Out-Null
Write-Output "Installed $taskName. Runs every minute while this Windows user is logged in."
