$root = Split-Path -Parent $PSScriptRoot
$noBom = New-Object System.Text.UTF8Encoding $false
$UTF8 = [System.Text.Encoding]::UTF8
$cfgPath = "$root\tools\fbconfig.js"
if(!(Test-Path $cfgPath)){ Write-Host "НЕТ tools\fbconfig.js"; exit }
$h = [System.IO.File]::ReadAllText("$root\index.html", $UTF8)
if($h -match 'FIREBASE-ACCESS'){ Write-Host "Уже подключено — переподключаем чисто"; $h = [regex]::Replace($h,'(?s)<!-- FIREBASE-ACCESS -->.*?</script>\s*',''); }
$block = "<!-- FIREBASE-ACCESS -->`r`n" +
 "<script src=`"tools/firebase-app-compat.js`"></script>`r`n" +
 "<script src=`"tools/firebase-firestore-compat.js`"></script>`r`n" +
 "<script src=`"tools/firebase-auth-compat.js`"></script>`r`n" +
 "<script src=`"tools/fbconfig.js`"></script>`r`n" +
 "<script>firebase.initializeApp(firebaseConfig);</script>`r`n" +
 "<script src=`"tools/firebase-access.js`"></script>`r`n"
$m = $h.IndexOf('<!-- CRM-UPDATER -->')
if($m -lt 0){ $m = $h.IndexOf('</body>') }
if($m -ge 0){ $h = $h.Substring(0,$m) + $block + "`r`n" + $h.Substring($m) }
else { Write-Host "НЕТ маркера CRM-UPDATER или </body> — файл не изменён"; exit 1 }
[System.IO.File]::WriteAllText("$root\index.html", $h, $noBom)
Write-Host "Firebase подключен к index.html"