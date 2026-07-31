@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 horde_mcp_bridge.py --open
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  python horde_mcp_bridge.py --open
  goto :eof
)
echo Python 3 is required. Install it from python.org, then run this launcher again.
pause
