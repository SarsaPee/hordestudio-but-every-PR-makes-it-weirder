@echo off
cd /d "%~dp0"

REM Prefer a local .venv if it exists
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" horde_mcp_bridge.py --open
    goto :eof
)

REM Prefer uv if installed
where uv >nul 2>nul
if %errorlevel%==0 (
    uv run horde_mcp_bridge.py --open
    goto :eof
)

REM Fallback: system Python
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

echo Python 3 is required. Install it from python.org or use uv.
pause
