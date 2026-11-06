@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Open the gym live room (fitness). Same idea as the story window:
rem   --autoplay-policy=no-user-gesture-required  lets audio start without a click
rem   --app=...                                   no tabs / address bar, ready for OBS
rem   --user-data-dir                            its own profile, does not touch normal Chrome

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Chrome not found. Install Chrome, or edit CHROME in this file.
  pause
  exit /b 1
)

start "" "%CHROME%" ^
  --autoplay-policy=no-user-gesture-required ^
  --app=http://127.0.0.1:8787/fitness?auto=1 ^
  --window-size=1920,1080 ^
  --window-position=0,0 ^
  --user-data-dir="%~dp0data\chrome-gym" ^
  --no-first-run ^
  --no-default-browser-check
