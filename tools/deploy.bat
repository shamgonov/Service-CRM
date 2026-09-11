@echo off
chcp 866 >nul
cd /d "%~dp0.."
if "%1"=="github" (
 powershell -NoP -ExecutionPolicy Bypass -File tools\bump.ps1
 powershell -NoP -ExecutionPolicy Bypass -File tools\patch.ps1
 git --version >nul 2>&1 || (echo ???????? Git: git-scm.com & pause & exit /b)
 if not exist .git ( git init & git branch -M main & git remote add origin https://github.com/shamgonov/Service-CRM.git )
 for /f "usebackq delims=" %%i in (`powershell -NoP -c "(Get-Content version.json|ConvertFrom-Json).version"`) do set VER=%%i
 git add -A
 git commit -m "deploy v%VER%"
 git pull origin main --allow-unrelated-histories --no-edit >nul 2>&1
 git push -u origin main
 echo ?????? ?????: v%VER%
 pause & exit /b
)
if "%1"=="firebase" (
 where firebase >nul 2>&1 || (echo ?????: npm i -g firebase-tools, ????? firebase init hosting & pause & exit /b)
 firebase deploy --only hosting
 pause & exit /b
)
