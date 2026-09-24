#Requires -Version 5.1
<#
  Revision independiente con Codex.

  Claude Code escribe el encargo concreto en .organio\revision\encargo.md y llama a este
  script. El script le pega delante las reglas no negociables de AGENTS.md y el formato de
  salida, le pega detras el diff, se lo pasa a Codex y deja la respuesta en
  .organio\revision\salida.md, que Claude Code lee.

  La salida lleva SIEMPRE una cabecera con la huella del encargo que la produjo. Si esa huella
  no coincide con el encargo actual, la revision no se ha ejecutado para ese encargo.

  Codex va en solo lectura salvo que se pida -Escribir. Nunca danger-full-access.

  Uso:
    revision.ps1                      revisa los cambios sin commit
    revision.ps1 -Base main           revisa la rama entera frente a main
    revision.ps1 -Esfuerzo medium     sube el razonamiento (seguridad, migraciones, permisos)
    revision.ps1 -Escribir            deja que Codex escriba pruebas que intenten romperlo
    revision.ps1 -SinDiff             encargo autocontenido: no adjunta ningun diff
    revision.ps1 -Fondo               lanza y devuelve el control al instante
    revision.ps1 -Estado              dice si la revision lanzada en fondo ha terminado
    revision.ps1 -Huella              imprime la huella del encargo actual y la de la salida
#>
[CmdletBinding()]
param(
  [string]$Encargo,
  [string]$Base,
  [ValidateSet('none', 'low', 'medium', 'high')][string]$Esfuerzo = 'low',
  [switch]$Escribir,
  [switch]$SinDiff,
  [switch]$Fondo,
  [switch]$Estado,
  [switch]$Huella
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

$Dir = [IO.Path]::Combine($Root, '.organio', 'revision')
$PromptFile = [IO.Path]::Combine($Dir, 'prompt.md')
$SalidaFile = [IO.Path]::Combine($Dir, 'salida.md')
$MarcaFile = [IO.Path]::Combine($Dir, 'en-curso.txt')
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Info([string]$Text) { Write-Host "    $Text" }
function Ok([string]$Text) { Write-Host "    $Text" -ForegroundColor Green }
function Fail([string]$Text) {
  Write-Host ''
  Write-Host "ERROR: $Text" -ForegroundColor Red
  exit 1
}
function HuellaDe([string]$Ruta) {
  if (-not (Test-Path $Ruta)) { return '' }
  return (Get-FileHash -Algorithm SHA256 -Path $Ruta).Hash.Substring(0, 12).ToLower()
}
function HuellaDeSalida() {
  if (-not (Test-Path $SalidaFile)) { return '' }
  $primera = (Get-Content -TotalCount 1 -Encoding UTF8 $SalidaFile)
  if ($primera -match 'encargo ([0-9a-f]{12})') { return $Matches[1] }
  return ''
}
function Sellar([string]$Sha, [string]$Esf, [string]$Sbx, [int]$Segundos) {
  $cuerpo = Get-Content -Raw -Encoding UTF8 $SalidaFile
  $sello = "<!-- revision de encargo $Sha | $(Get-Date -Format s) | esfuerzo $Esf | sandbox $Sbx | $Segundos s -->"
  [IO.File]::WriteAllText($SalidaFile, "$sello`r`n`r`n$cuerpo", $Utf8NoBom)
}

if (-not $Encargo) { $Encargo = [IO.Path]::Combine($Dir, 'encargo.md') }

# -Huella: comparar sin ejecutar nada ---------------------------------------------------------
if ($Huella) {
  $he = HuellaDe $Encargo
  $hs = HuellaDeSalida
  if (-not $he) { Fail "No hay encargo en $Encargo." }
  Info "Encargo: $he"
  if (-not $hs) { Info 'Salida:  (no hay, o es de antes de este control)'; exit 3 }
  Info "Salida:  $hs"
  if ($he -eq $hs) { Ok 'Coinciden: la salida es de este encargo.'; exit 0 }
  Write-Host '    NO coinciden: la salida es de otro encargo. Hay que lanzar la revision.' -ForegroundColor Yellow
  exit 3
}

# -Estado: informar de una revision en fondo ---------------------------------------------------
if ($Estado) {
  if (-not (Test-Path $MarcaFile)) {
    if ((HuellaDeSalida) -eq (HuellaDe $Encargo)) { Ok 'Terminada. La respuesta esta en .organio\revision\salida.md'; exit 0 }
    Fail 'No hay ninguna revision en curso y la salida no es de este encargo.'
  }
  $campos = (Get-Content -Raw $MarcaFile).Trim() -split ';'
  $procId = [int]$campos[0]
  if ($null -ne (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
    Info 'En curso. Vuelve a preguntar en un minuto.'
    exit 2
  }
  Remove-Item $MarcaFile -Force
  if (-not (Test-Path $SalidaFile)) { Fail 'Codex termino sin dejar salida.' }
  $seg = [int]((Get-Date) - [datetime]$campos[4]).TotalSeconds
  Sellar $campos[1] $campos[2] $campos[3] $seg
  Ok "Revision terminada en $seg s."
  Write-Host ''
  Get-Content -Raw -Encoding UTF8 $SalidaFile
  exit 0
}

# Preparar el prompt ---------------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
if (-not (Test-Path $Encargo)) { Fail "No encuentro el encargo en $Encargo. Lo escribe Claude Code antes de llamar aqui." }
if (Test-Path $MarcaFile) { Fail 'Ya hay una revision en curso. Usa -Estado.' }
$sha = HuellaDe $Encargo

$bloqueDiff = ''
if (-not $SinDiff) {
  if ($Base) {
    Info "Diff de la rama frente a $Base"
    $diff = & git diff "$Base...HEAD"
  } else {
    Info 'Diff de los cambios sin commit'
    $diff = & git diff
  }
  if ($LASTEXITCODE -ne 0) { Fail 'git diff ha fallado.' }
  $diff = ($diff -join "`n")
  if ([string]::IsNullOrWhiteSpace($diff)) { Fail 'No hay cambios que revisar. Si el encargo es autocontenido, usa -SinDiff.' }
  $bloqueDiff = @"

## Cambio a revisar

``````diff
$diff
``````
"@
}

# Las reglas viajan desde AGENTS.md para que no se queden desfasadas aqui.
$agents = Get-Content -Raw -Encoding UTF8 ([IO.Path]::Combine($Root, 'AGENTS.md'))
$reglas = ''
if ($agents -match '(?s)(## Reglas no negociables.*?)(?=\r?\n## )') { $reglas = $Matches[1].Trim() }

$cabecera = @"
Eres el revisor independiente del proyecto OrganIO, una app de tareas con Expo, React Native y Supabase.

Revisa UNICAMENTE lo que viene en este mensaje.

Como trabajar:
- No explores el repositorio. No abras ficheros que no se te den aqui. Todo lo que necesitas esta abajo.
- No modifiques ningun fichero.
- Responde en espanol, sin preambulo.
- Se concreto. Si de verdad no encuentras nada, dilo, pero antes busca: fallos de permisos, condiciones
  de carrera, casos limite sin cubrir, suposiciones del cliente que deberia imponer el servidor,
  y pruebas que pasan sin demostrar lo que dicen demostrar.

$reglas

## Encargo

$(Get-Content -Raw -Encoding UTF8 $Encargo)

## Formato de la respuesta

Exactamente esta estructura y nada mas:

### Bloqueantes
### Importantes
### Sugerencias

Cada hallazgo en una linea: fichero:linea - que pasa y por que importa.
Si una seccion no tiene nada, escribe: ninguno.
Cierra con una sola linea: Veredicto: aprobado   o   Veredicto: no aprobado
$bloqueDiff
"@

[IO.File]::WriteAllText($PromptFile, $cabecera, $Utf8NoBom)
if (Test-Path $SalidaFile) { Remove-Item $SalidaFile -Force }

$sandbox = 'read-only'
if ($Escribir) { $sandbox = 'workspace-write' }
$cmd = "codex exec --sandbox $sandbox -c model_reasoning_effort=$Esfuerzo -o `"$SalidaFile`" - < `"$PromptFile`""

Info "Encargo $sha   Esfuerzo: $Esfuerzo   Sandbox: $sandbox   Prompt: $([int]($cabecera.Length / 1024)) KB"

# Lanzar ---------------------------------------------------------------------------------------
if ($Fondo) {
  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmd -PassThru -WindowStyle Hidden
  [IO.File]::WriteAllText($MarcaFile, "$($p.Id);$sha;$Esfuerzo;$sandbox;$(Get-Date -Format s)", $Utf8NoBom)
  Ok "Codex lanzado en segundo plano (pid $($p.Id)). Pregunta con -Estado."
  exit 0
}

$inicio = Get-Date
& cmd.exe /c $cmd | Out-Null
$codigo = $LASTEXITCODE
$tardo = [int]((Get-Date) - $inicio).TotalSeconds

if ($codigo -ne 0) { Fail "Codex ha terminado con codigo $codigo despues de $tardo s." }
if (-not (Test-Path $SalidaFile)) { Fail "Codex no ha dejado salida despues de $tardo s." }

Sellar $sha $Esfuerzo $sandbox $tardo
Ok "Revision terminada en $tardo s."
Write-Host ''
Get-Content -Raw -Encoding UTF8 $SalidaFile
