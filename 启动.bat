@echo off
rem 双击本文件即可启动 DeepSeek Monitor（常驻系统托盘）
rem %~dp0 = 本文件所在目录，因此把整个文件夹移动到别处也能用
cd /d "%~dp0"
start "" "%~dp0node_modules\electron\dist\electron.exe" .
