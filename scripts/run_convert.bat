@echo off
chcp 65001 >nul 2>&1
title PDCA Data Converter

python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Python not found.
    echo.
    pause
    exit /b 1
)

:MENU
cls
echo ========================================
echo   PDCA Data Converter
echo ========================================
echo.
echo   Select company:
echo.
echo   [1] Kagoshima (Kagoshima Kyosai)
echo   [2] Junestory (Full: POS + PL + Metrics)
echo   [3] Junestory (Metrics only)
echo   [4] Junestory (Update store master)
echo.
echo   [0] Exit
echo.
echo ========================================
echo.
set /p choice="Enter number: "

if "%choice%"=="1" goto KAGOSHIMA
if "%choice%"=="2" goto JUNESTORY_FULL
if "%choice%"=="3" goto JUNESTORY_METRICS
if "%choice%"=="4" goto JUNESTORY_MASTER
if "%choice%"=="0" goto END

echo.
echo Invalid selection.
pause
goto MENU

:KAGOSHIMA
cls
echo.
echo ========================================
echo   Kagoshima Kyosai - Converting...
echo ========================================
echo.
cd /d "%~dp0"
python convert_kagoshima.py
echo.
echo ----------------------------------------
pause
goto MENU

:JUNESTORY_FULL
cls
echo.
echo ========================================
echo   Junestory - Full Convert
echo ========================================
echo.
cd /d "%~dp0"
echo [1/4] Converting POS data...
python convert_junestory_pos.py
echo.
echo [2/4] Converting PL data...
python convert_junestory_pl.py
echo.
echo [3/4] Creating master data...
python create_junestory_master_data.py
echo.
echo [4/4] Calculating store metrics...
python calc_store_metrics.py
echo.
echo ----------------------------------------
echo   All done!
echo ----------------------------------------
pause
goto MENU

:JUNESTORY_METRICS
cls
echo.
echo ========================================
echo   Junestory - Metrics Only
echo ========================================
echo.
cd /d "%~dp0"
python calc_store_metrics.py
echo.
echo ----------------------------------------
pause
goto MENU

:JUNESTORY_MASTER
cls
echo.
echo ========================================
echo   Junestory - Update Store Master
echo ========================================
echo.
cd /d "%~dp0"
python update_store_master.py
echo.
echo ----------------------------------------
pause
goto MENU

:END
echo.
echo Exiting...
pause
