$root = Split-Path -Parent $PSScriptRoot
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$j = Get-Content "$root\version.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$j.z++; if($j.z -ge 10){$j.z=0; $j.y++; if($j.y -ge 10){$j.y=0; $j.x++}}
$j.version = "$($j.x).$($j.y).$($j.z)"
[System.IO.File]::WriteAllText("$root\version.json", ($j | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding $false))
Write-Host "Новая версия: $($j.version)"