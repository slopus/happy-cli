@echo off
set NODE_NO_WARNINGS=1

:: Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"

:: Try the relative path first (for local development)
if exist "%SCRIPT_DIR%..\dist\index.mjs" (
    node --no-warnings --no-deprecation "%SCRIPT_DIR%..\dist\index.mjs" %*
    exit /b %errorlevel%
)

:: Try npm global installation path
if exist "%SCRIPT_DIR%node_modules\happy-coder\dist\index.mjs" (
    node --no-warnings --no-deprecation "%SCRIPT_DIR%node_modules\happy-coder\dist\index.mjs" %*
    exit /b %errorlevel%
)

:: Debug: show where we're looking and what's actually there
echo Script dir: %SCRIPT_DIR%
echo Looking for: %SCRIPT_DIR%..\dist\index.mjs (NOT FOUND)
echo Looking for: %SCRIPT_DIR%node_modules\happy-coder\dist\index.mjs (NOT FOUND)
echo What's actually here:
dir "%SCRIPT_DIR%" /b
if exist "%SCRIPT_DIR%node_modules" (
    echo node_modules contents:
    dir "%SCRIPT_DIR%node_modules" /b
)
echo Error: Could not locate JavaScript file
exit /b 1