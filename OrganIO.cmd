@echo off
rem OrganIO - instala lo necesario y arranca la app.
rem   OrganIO.cmd          arrancar
rem   OrganIO.cmd -Lan     arrancar accesible desde el iPhone (misma wifi)
rem   OrganIO.cmd -Stop    detener Supabase
rem   OrganIO.cmd -Reset   borrar la base de datos local y crearla de nuevo
title OrganIO
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\organio.ps1" %*
if errorlevel 1 pause
