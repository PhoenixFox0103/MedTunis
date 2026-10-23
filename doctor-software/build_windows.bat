@echo off
setlocal
cd /d "%~dp0"
py -m pip install -r requirements.txt
if errorlevel 1 goto :error
py -m PyInstaller --noconfirm --clean --windowed --onefile --name "MediLink-Medecin" --add-data "web;web" main.py
if errorlevel 1 goto :error
echo.
echo EXE cree dans: %CD%\dist\MediLink-Medecin.exe
pause
exit /b 0
:error
echo ERREUR: verifiez que Python 3.11 ou 3.12 est installe et ajoute au PATH.
pause
exit /b 1
