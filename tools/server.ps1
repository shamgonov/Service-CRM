$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8000/")
$listener.Start()
$root = Split-Path -Parent $PSScriptRoot
$mime = @{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.json'='application/json; charset=utf-8';'.png'='image/png';'.css'='text/css; charset=utf-8';'.md'='text/plain; charset=utf-8'}
Write-Host "LOCAL SERVER: http://localhost:8000  (Ctrl+C - stop)"
while($listener.IsListening){
 $ctx = $listener.GetContext()
 $path = $ctx.Request.Url.AbsolutePath
 if($path -eq '/'){$path = '/index.html'}
 $file = Join-Path $root ($path -replace '/','\')
 if(Test-Path $file -PathType Leaf){
  $bytes = [System.IO.File]::ReadAllBytes($file)
  $ext = [System.IO.Path]::GetExtension($file)
  $ctx.Response.ContentType = $mime[$ext]
  $ctx.Response.Headers.Add("Cache-Control","no-store")
  $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
 } else { $ctx.Response.StatusCode = 404 }
 $ctx.Response.Close()
}