@echo off
chcp 65001 >nul
echo ========================================
echo   鹿児島県市町村職員共済組合
echo   データ変換スクリプト
echo ========================================
echo.

cd /d "%~dp0"
python convert_kagoshima.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Pythonの実行に失敗しました。
    echo Pythonがインストールされているか確認してください。
    pause
)
