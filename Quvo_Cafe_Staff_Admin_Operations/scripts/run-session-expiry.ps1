param([string]$PhpPath = 'C:\php85\php.exe')
$ErrorActionPreference = 'Stop'
$workerPath = Join-Path $PSScriptRoot 'expire-dining-sessions.php'
& $PhpPath $workerPath
exit $LASTEXITCODE
