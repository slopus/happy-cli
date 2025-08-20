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
echo === DEBUG INFORMATION ===
echo Script dir: %SCRIPT_DIR%
echo Current working directory: %CD%
echo.

:: Check if node is available
echo Checking node availability:
node --version 2>nul && echo Node found: SUCCESS || echo Node found: FAILED
echo.

:: Check paths
echo Path 1 (dev): %SCRIPT_DIR%..\dist\index.mjs
if exist "%SCRIPT_DIR%..\dist\index.mjs" (
    echo   EXISTS: YES
) else (
    echo   EXISTS: NO
)

echo Path 2 (npm): %SCRIPT_DIR%node_modules\happy-coder\dist\index.mjs
if exist "%SCRIPT_DIR%node_modules\happy-coder\dist\index.mjs" (
    echo   EXISTS: YES
) else (
    echo   EXISTS: NO
)
echo.

echo Script directory contents:
dir "%SCRIPT_DIR%" /b 2>nul || echo Failed to list script directory

if exist "%SCRIPT_DIR%node_modules" (
    echo.
    echo node_modules contents:
    dir "%SCRIPT_DIR%node_modules" /b 2>nul || echo Failed to list node_modules
    
    if exist "%SCRIPT_DIR%node_modules\happy-coder" (
        echo.
        echo happy-coder package contents:
        dir "%SCRIPT_DIR%node_modules\happy-coder" /b 2>nul || echo Failed to list happy-coder
        
        if exist "%SCRIPT_DIR%node_modules\happy-coder\dist" (
            echo.
            echo happy-coder dist contents:
            dir "%SCRIPT_DIR%node_modules\happy-coder\dist" /b 2>nul || echo Failed to list dist
        ) else (
            echo.
            echo happy-coder dist directory: NOT FOUND
        )
    ) else (
        echo.
        echo happy-coder package: NOT FOUND
    )
) else (
    echo.
    echo node_modules directory: NOT FOUND
)

echo.
echo === END DEBUG ===
echo Error: Could not locate JavaScript file
exit /b 1