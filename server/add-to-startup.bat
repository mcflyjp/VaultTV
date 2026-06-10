@echo off
REM Adds VaultTV Server to Windows startup so it runs automatically on login.
REM To remove: open Task Manager > Startup apps > disable VaultTV Server

set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set TARGET=%~dp0start.bat
set SHORTCUT=%STARTUP%\VaultTV Server.lnk

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$s = $ws.CreateShortcut('%SHORTCUT%');" ^
  "$s.TargetPath = '%TARGET%';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.WindowStyle = 7;" ^
  "$s.Description = 'VaultTV Media Server';" ^
  "$s.Save()"

if exist "%SHORTCUT%" (
  echo.
  echo  VaultTV Server added to Windows startup.
  echo  It will start automatically every time you log in.
  echo  To remove: Task Manager ^> Startup apps ^> VaultTV Server ^> Disable
  echo.
) else (
  echo.
  echo  Failed to create startup shortcut. Try running as Administrator.
  echo.
)
pause
