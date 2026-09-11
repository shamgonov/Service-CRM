@echo off
chcp 866 >nul
cd /d "%~dp0.."
if "%1"=="create" (
 for /f %%d in ('powershell -NoP -c "Get-Date -f yyyyMMdd_HHmmss"') do set ST=%%d
 for /f "usebackq delims=" %%i in (`powershell -NoP -c "(Get-Content version.json|ConvertFrom-Json).version"`) do set VER=%%i
 robocopy . "backups\v%VER%_%ST%" /E /XD .git backups >nul
 echo ????? ??????: backups\v%VER%_%ST%
 exit /b
)
if "%1"=="restore" (
 robocopy "backups\%~2" . /E /XD .git backups >nul
 echo ????????????? ??: %~2
 exit /b
)
