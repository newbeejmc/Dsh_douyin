@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem 以整屏无边框方式打开直播画面，适合 OBS「显示器采集」或抖音直播伴侣窗口采集。
rem 直播伴侣仍负责最终推流；本程序负责内容、弹幕和定时场景。

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo 没找到 Chrome，请先装 Chrome，或修改本文件里的 CHROME 路径。
  pause
  exit /b 1
)

start "" "%CHROME%" ^
  --autoplay-policy=no-user-gesture-required ^
  --start-fullscreen ^
  --app=http://127.0.0.1:8787/?auto=1 ^
  --window-size=1920,1080 ^
  --window-position=0,0 ^
  --user-data-dir="%~dp0data\chrome-live-fullscreen" ^
  --no-first-run ^
  --no-default-browser-check

