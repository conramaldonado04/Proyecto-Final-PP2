@echo off
setlocal
REM Evitar otra instancia si ya hay una ventana de Blender abierta.
tasklist /FI "IMAGENAME eq blender.exe" /NH 2>nul | find /I "blender.exe" >nul
if not errorlevel 1 (
  echo Blender ya esta abierto. Cerra las ventanas anteriores y ejecuta este archivo otra vez.
  echo No se abrira otra instancia para evitar consumo adicional.
  pause
  exit /b 0
)
set "NARANPOL_BLENDER_EXE="
for /f "delims=" %%B in ('where blender.exe 2^>nul') do if not defined NARANPOL_BLENDER_EXE set "NARANPOL_BLENDER_EXE=%%B"
if not defined NARANPOL_BLENDER_EXE for /f "delims=" %%D in ('dir /b /ad /o-n "%ProgramFiles%\Blender Foundation\Blender*" 2^>nul') do if not defined NARANPOL_BLENDER_EXE if exist "%ProgramFiles%\Blender Foundation\%%D\blender.exe" set "NARANPOL_BLENDER_EXE=%ProgramFiles%\Blender Foundation\%%D\blender.exe"
if not defined NARANPOL_BLENDER_EXE (
  echo No encontre Blender en su carpeta habitual.
  echo Abri Blender, entra a Scripting, Open y elegi blender\crear_saborizadas.py.
  echo Despues presiona Run Script. No hace falta instalar Python.
  pause
  exit /b 1
)
start "" "%NARANPOL_BLENDER_EXE%" --python "%~dp0blender\crear_saborizadas.py"
endlocal
