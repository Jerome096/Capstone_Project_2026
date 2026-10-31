$ErrorActionPreference = 'Stop'
$taskName = 'QuvoCafe-ExpireDiningSessions'
$task = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction Stop
$actions = @($task.Actions)
if ($actions.Count -ne 1) {
    throw 'The task has unexpected actions. No changes were made.'
}
$currentAction = $actions[0]
$runnerPath = Join-Path $PSScriptRoot 'run-session-expiry.ps1'
$workerPath = Join-Path $PSScriptRoot 'expire-dining-sessions.php'
if ([IO.Path]::GetFileName($currentAction.Execute) -ieq 'php-win.exe' -and
    $currentAction.Arguments -eq ('"' + $workerPath + '"')) {
    Write-Output 'The task already uses console-free PHP.'
    exit 0
}
if ([IO.Path]::GetFileName($currentAction.Execute) -ine 'powershell.exe' -or
    $currentAction.Arguments.IndexOf($runnerPath, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw 'The task does not match this project runner. No changes were made.'
}
$phpMatch = [regex]::Match($currentAction.Arguments, '(?i)-PhpPath\s+(?:"([^"]+)"|(\S+))')
if (!$phpMatch.Success) {
    throw 'Cannot determine the existing PHP path. No changes were made.'
}
$phpPath = $phpMatch.Groups[1].Value
if (!$phpPath) { $phpPath = $phpMatch.Groups[2].Value }
$silentPhpPath = Join-Path (Split-Path -Parent $phpPath) 'php-win.exe'
if (!(Test-Path -LiteralPath $silentPhpPath) -or !(Test-Path -LiteralPath $workerPath)) {
    throw 'Console-free PHP or the expiry worker is missing. No changes were made.'
}
$backupPath = Join-Path $PSScriptRoot ($taskName + '-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.xml')
Export-ScheduledTask -TaskName $taskName -TaskPath '\' | Set-Content -LiteralPath $backupPath -Encoding Unicode
$action = New-ScheduledTaskAction -Execute $silentPhpPath -Argument ('"' + $workerPath + '"') -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
Set-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action | Out-Null
$updatedTask = Get-ScheduledTask -TaskName $taskName -TaskPath '\'
if ($updatedTask.Actions.Execute -ine $silentPhpPath -or $updatedTask.Actions.Arguments -ne ('"' + $workerPath + '"')) {
    throw "Task verification failed. Original task backup: $backupPath"
}
Write-Output "Fixed $taskName. The existing schedule and session expiry worker are preserved."
Write-Output "Original task backup: $backupPath"
