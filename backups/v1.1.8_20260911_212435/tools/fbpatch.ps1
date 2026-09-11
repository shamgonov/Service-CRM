$root = Split-Path -Parent $PSScriptRoot
$noBom = New-Object System.Text.UTF8Encoding $false
$UTF8 = [System.Text.Encoding]::UTF8
$cfgPath = "$root\tools\fbconfig.js"
if(!(Test-Path $cfgPath)){ Write-Host "НЕТ tools\fbconfig.js"; exit }
$h = [System.IO.File]::ReadAllText("$root\index.html", $UTF8)
if($h -match 'FIREBASE-ACCESS'){ Write-Host "Уже подключено — переподключаем чисто"; $h = [regex]::Replace($h,'(?s)<!-- FIREBASE-ACCESS -->.*?(?=</body>)',''); }
$block = "<!-- FIREBASE-ACCESS -->`r`n" +
 "<script src=`"tools/firebase-app-compat.js`"></script>`r`n" +
 "<script src=`"tools/firebase-auth-compat.js`"></script>`r`n" +
 "<script src=`"tools/firebase-firestore-compat.js`"></script>`r`n" +
 "<script>`r`n" + [System.IO.File]::ReadAllText($cfgPath, $UTF8) + "`r`nfirebase.initializeApp(firebaseConfig);`r`n</script>`r`n" +
 "<script src=`"tools/firebase-access.js`"></script>`r`n"
$j = $h.IndexOf('</body>')
if($j -ge 0){ $h = $h.Substring(0,$j) + $block + "`r`n" + $h.Substring($j) }
[System.IO.File]::WriteAllText("$root\index.html", $h, $noBom)
Write-Host "Firebase подключен к index.html"