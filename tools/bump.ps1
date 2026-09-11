$root = Split-Path -Parent $PSScriptRoot
$j = Get-Content "$root\version.json" -Raw | ConvertFrom-Json
$j.z++; if($j.z -ge 10){$j.z=0; $j.y++; if($j.y -ge 10){$j.y=0; $j.x++}}
$j.version = "$($j.x).$($j.y).$($j.z)"
[System.IO.File]::WriteAllText("$root\version.json", ($j | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding $false))
Write-Host "ÐÐ¾Ð²Ð°Ñ Ð²ÐµÑ€ÑÐ¸Ñ: $($j.version)"