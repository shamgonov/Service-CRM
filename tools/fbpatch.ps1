param([string]$Version)
$root = Split-Path -Parent $PSScriptRoot
$noBom = New-Object System.Text.UTF8Encoding $false
$cfgPath = "$root\tools\fbconfig.js"
if(!(Test-Path $cfgPath)){ Write-Host "НЕТ tools\fbconfig.js"; exit }
if(!(Test-Path "$root\tools\firebase-access.js")){ Write-Host "НЕТ tools\firebase-access.js"; exit }
$h = [System.IO.File]::ReadAllText("$root\index.html", [System.Text.Encoding]::UTF8)
if($h -match 'FIREBASE-ACCESS'){ Write-Host "Уже подключено"; exit }
$scripts = "<!-- FIREBASE-ACCESS -->`n" +
 "<script src=`"https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js`"></script>`n" +
 "<script src=`"https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js`"></script>`n" +
 "<script src=`"https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js`"></script>`n" +
 "<script>`n" + [System.IO.File]::ReadAllText($cfgPath, [System.Text.Encoding]::UTF8) + "`nfirebase.initializeApp(firebaseConfig);`n</script>`n" +
 "<script src=`"tools/firebase-access.js`"></script>`n"
$j = $h.IndexOf('</body>')
if($j -ge 0){ $h = $h.Substring(0,$j) + $scripts + "`n" + $h.Substring($j) }
[System.IO.File]::WriteAllText("$root\index.html", $h, $noBom)
Write-Host "Firebase подключен"