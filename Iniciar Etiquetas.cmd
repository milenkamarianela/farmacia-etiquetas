@echo off
rem Inicia la aplicacion de etiquetas y abre el navegador cuando esta lista.
rem Doble clic sobre este archivo (se puede crear un acceso directo en el Escritorio).
chcp 65001 >nul
title Etiquetas de gondola
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y volve a intentar.
  pause
  exit /b 1
)

if not exist "apps\server\.env" (
  echo Falta el archivo de configuracion apps\server\.env
  echo Copia apps\server\.env.example como apps\server\.env y revisa la ubicacion de la base de datos.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando componentes por primera vez. Puede tardar unos minutos...
  call npm install || goto :error
)

if not exist "apps\web\dist\index.html" (
  echo Preparando la aplicacion...
  call npm run build || goto :error
)

echo.
echo  La aplicacion se abre en el navegador: http://localhost:3000
echo  NO cierres esta ventana mientras la uses. Para salir, cerrala o presiona Ctrl+C.
echo.

rem Abre el navegador recien cuando el servidor responde (como maximo espera 90 segundos).
start "" powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 90;$i++){try{Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health -TimeoutSec 2 | Out-Null; Start-Process 'http://localhost:3000'; break}catch{Start-Sleep 1}}"

call npm start
echo.
echo La aplicacion se detuvo.
pause
exit /b 0

:error
echo.
echo Ocurrio un error. Revisa los mensajes de arriba.
pause
exit /b 1
