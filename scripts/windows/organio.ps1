<#
  OrganIO - lanzador para Windows (se ejecuta desde OrganIO.cmd).

  Qué hace, en orden:
    1. Comprueba Node.js (22 o superior) y Docker (arranca Docker Desktop si hace falta).
    2. Instala o actualiza dependencias solo cuando cambia algún package.json.
    3. La primera vez, pregunta tu correo: es el único que podrá entrar (modo invitación).
    4. Arranca Supabase en local. La primera vez crea la base; después solo aplica
       migraciones nuevas, sin tocar tus datos.
    5. Genera apps/app/.env con la URL y la clave PÚBLICA (nunca la secreta).
    6. Arranca la app y abre el navegador.

  Opciones:  -Lan    usar la IP local para abrir la app desde el iPhone (misma wifi)
             -Stop   detener Supabase (tus datos se conservan)
             -Reset  borrar la base de datos local y crearla de nuevo (pide confirmación)

  Nota: este fichero se guarda en UTF-8 con BOM para que Windows PowerShell 5.1 lea bien
  las tildes. No uses comillas tipográficas ni guiones largos en el código.
#>
param([switch]$Lan, [switch]$Stop, [switch]$Reset)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$StateDir = [IO.Path]::Combine($Root, '.organio')
$InitMarker = [IO.Path]::Combine($StateDir, 'db-initialized')
$EnvFile = [IO.Path]::Combine($Root, 'apps', 'app', '.env')
$SeedFile = [IO.Path]::Combine($Root, 'supabase', 'seed.sql')
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Step([string]$Text) { Write-Host ''; Write-Host "==> $Text" -ForegroundColor Cyan }
function Ok([string]$Text) { Write-Host "    $Text" -ForegroundColor Green }
function Info([string]$Text) { Write-Host "    $Text" }
function Fail([string]$Text) {
  Write-Host ''
  Write-Host "ERROR: $Text" -ForegroundColor Red
  exit 1
}

# Ejecuta un programa y aborta con un mensaje claro si falla. La salida va directa a la consola.
function Invoke-Checked([string]$Exe, [string[]]$Arguments) {
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { Fail "Ha fallado: $Exe $($Arguments -join ' ')" }
}

# Ejecuta un programa en silencio y devuelve si terminó bien. Se relaja la política de errores
# porque Windows PowerShell 5.1 convierte en excepción cualquier línea de stderr redirigida.
function Test-Succeeds([scriptblock]$Block) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Block *> $null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $previous
  }
}

# Devuelve la salida estándar de un programa como texto, ignorando stderr.
function Get-Output([string]$Exe, [string[]]$Arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    return ((& $Exe @Arguments 2> $null) -join "`n")
  } finally {
    $ErrorActionPreference = $previous
  }
}

Write-Host ''
Write-Host '  OrganIO' -ForegroundColor White
Write-Host '  Tareas y rutinas que no se te escapan.' -ForegroundColor DarkGray

# 0. Integridad (solo la primera vez) -------------------------------------------------------
# Compara cada fichero con scripts/windows/manifest.sha256. Ignora BOM y retornos de carro,
# que Windows o los editores pueden cambiar sin alterar el contenido.
$Manifest = [IO.Path]::Combine($Root, 'scripts', 'windows', 'manifest.sha256')
$VerifiedMarker = [IO.Path]::Combine($StateDir, 'verified')
if ([IO.File]::Exists($Manifest) -and -not [IO.File]::Exists($VerifiedMarker)) {
  Step 'Comprobando que el proyecto está completo'
  $sha = [Security.Cryptography.SHA256]::Create()
  $problems = @()
  foreach ($line in [IO.File]::ReadAllLines($Manifest)) {
    if (-not $line.Trim()) { continue }
    $expected = $line.Substring(0, 64)
    $relative = $line.Substring(64).Trim()
    $path = [IO.Path]::Combine($Root, $relative)
    if (-not [IO.File]::Exists($path)) { $problems += "falta:    $relative"; continue }
    $bytes = [IO.File]::ReadAllBytes($path)
    $start = if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { 3 } else { 0 }
    $clean = New-Object 'System.Collections.Generic.List[byte]' ($bytes.Length)
    for ($i = $start; $i -lt $bytes.Length; $i++) { if ($bytes[$i] -ne 13) { $clean.Add($bytes[$i]) } }
    $actual = [BitConverter]::ToString($sha.ComputeHash($clean.ToArray())).Replace('-', '').ToLowerInvariant()
    if ($actual -ne $expected) { $problems += "distinto: $relative" }
  }
  if ($problems.Count -gt 0) {
    $problems | ForEach-Object { Info $_ }
    Fail "Hay $($problems.Count) ficheros que no coinciden con el original. Pásale esta lista a Claude para reponerlos."
  }
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  [IO.File]::WriteAllText($VerifiedMarker, (Get-Date -Format o), $Utf8NoBom)
  Ok 'Todos los ficheros están completos'
}

# 1. Requisitos -----------------------------------------------------------------------------
Step 'Comprobando Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'No encuentro Node.js. Instala la versión 22 o superior desde https://nodejs.org (o: winget install OpenJS.NodeJS.LTS) y vuelve a abrir OrganIO.'
}
$nodeVersion = (Get-Output 'node' @('-v')).Trim().TrimStart('v')
if ([int]($nodeVersion.Split('.')[0]) -lt 22) {
  Fail "Tienes Node $nodeVersion y OrganIO necesita la 22 o superior. Actualízalo desde https://nodejs.org"
}
Ok "Node $nodeVersion"

Step 'Comprobando Docker'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'No encuentro Docker. Instala Docker Desktop: https://www.docker.com/products/docker-desktop/'
}
if (-not (Test-Succeeds { docker info })) {
  $desktop = if ($env:ProgramFiles) { [IO.Path]::Combine($env:ProgramFiles, 'Docker', 'Docker', 'Docker Desktop.exe') } else { $null }
  if ($desktop -and (Test-Path $desktop)) {
    Info 'Docker Desktop no está en marcha; lo arranco (puede tardar un minuto)...'
    Start-Process $desktop | Out-Null
  }
  $deadline = (Get-Date).AddMinutes(3)
  while (-not (Test-Succeeds { docker info })) {
    if ((Get-Date) -gt $deadline) {
      Fail 'Docker no responde. Abre Docker Desktop, espera a que indique que el motor está en marcha y vuelve a ejecutar OrganIO.'
    }
    Start-Sleep -Seconds 3
  }
}
Ok 'Docker en marcha'

# 2. Dependencias ---------------------------------------------------------------------------
Step 'Dependencias'
$stamp = [IO.Path]::Combine($Root, 'node_modules', '.package-lock.json')
$manifests = @([IO.Path]::Combine($Root, 'package.json'), [IO.Path]::Combine($Root, 'package-lock.json')) +
  @(Get-ChildItem -Path ([IO.Path]::Combine($Root, 'apps')), ([IO.Path]::Combine($Root, 'packages')) -Filter 'package.json' -Recurse -Depth 1 -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch 'node_modules' } | ForEach-Object { $_.FullName })
$needInstall = $true
if ([IO.File]::Exists($stamp)) {
  # API de .NET: Get-Item no ve ficheros que empiezan por punto u ocultos sin -Force.
  $installedAt = [IO.File]::GetLastWriteTimeUtc($stamp)
  $newest = $manifests | Where-Object { [IO.File]::Exists($_) } | ForEach-Object { [IO.File]::GetLastWriteTimeUtc($_) } | Sort-Object -Descending | Select-Object -First 1
  $needInstall = $newest -gt $installedAt
}
if ($needInstall) {
  Info 'Instalando dependencias (la primera vez tarda unos minutos)...'
  Invoke-Checked 'npm' @('install')
  Ok 'Dependencias instaladas'
} else {
  Ok 'Al día'
}

if ($Stop) {
  Step 'Deteniendo Supabase'
  Invoke-Checked 'npx' @('supabase', 'stop')
  Ok 'Supabase detenido. Tus datos se conservan.'
  exit 0
}

# 3. Primera vez: correo invitado -----------------------------------------------------------
$seed = [IO.File]::ReadAllText($SeedFile)
if ($seed -match 'tu-correo@ejemplo\.com') {
  Step 'Configuración inicial'
  Info 'OrganIO solo deja entrar a los correos invitados. ¿Con cuál vas a entrar tú?'
  do {
    $email = (Read-Host '    Correo').Trim().ToLowerInvariant()
    $valid = $email -match '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
    if (-not $valid) { Info 'Ese correo no parece válido. Prueba otra vez.' }
  } until ($valid)
  # El patrón anterior no admite comillas ni caracteres especiales: el valor es seguro dentro del SQL.
  [IO.File]::WriteAllText($SeedFile, $seed.Replace('tu-correo@ejemplo.com', $email), $Utf8NoBom)
  if (Test-Path $InitMarker) { Remove-Item $InitMarker -Force }
  Ok "Correo invitado: $email"
}

# 4. Supabase local -------------------------------------------------------------------------
Step 'Supabase (base de datos local)'
Info 'La primera vez descarga las imágenes de Docker: puede tardar bastante.'
Invoke-Checked 'npx' @('supabase', 'start')

if ($Reset -or -not (Test-Path $InitMarker)) {
  if ($Reset) {
    $answer = Read-Host '    Esto BORRA todos los datos locales de OrganIO. Escribe BORRAR para continuar'
    if ($answer -ne 'BORRAR') { Fail 'Cancelado. No se ha borrado nada.' }
  }
  Info 'Creando la base de datos...'
  Invoke-Checked 'npx' @('supabase', 'db', 'reset', '--yes')
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  [IO.File]::WriteAllText($InitMarker, (Get-Date -Format o), $Utf8NoBom)
} else {
  Info 'Aplicando migraciones nuevas, si las hay (tus datos se conservan)...'
  Invoke-Checked 'npx' @('supabase', 'migration', 'up', '--local')
}
Ok 'Base de datos lista'

# 5. Configuración de la app ----------------------------------------------------------------
Step 'Configurando la app'
$raw = Get-Output 'npx' @('supabase', 'status', '-o', 'json')
$open = $raw.IndexOf('{')
$close = $raw.LastIndexOf('}')
if ($open -lt 0 -or $close -le $open) { Fail 'No he podido leer el estado de Supabase (npx supabase status).' }
$status = $raw.Substring($open, $close - $open + 1) | ConvertFrom-Json

$apiUrl = [string]$status.API_URL
# Solo la clave PÚBLICA. La secreta (SECRET_KEY / SERVICE_ROLE_KEY) nunca sale de Supabase.
$publicKey = if ($status.PUBLISHABLE_KEY) { [string]$status.PUBLISHABLE_KEY } else { [string]$status.ANON_KEY }
if (-not $apiUrl -or -not $publicKey) { Fail 'Supabase no ha devuelto la URL o la clave pública.' }

$lanIp = $null
if ($Lan) {
  $lanIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|Loopback|VirtualBox|VMware|WSL|Docker' } |
    Sort-Object InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress
  if ($lanIp) {
    $apiUrl = $apiUrl -replace '127\.0\.0\.1|localhost', $lanIp
  } else {
    Info 'No he encontrado la IP local de la wifi; la app solo funcionará en este ordenador.'
  }
}

$envText = "# Generado por OrganIO.cmd. Solo contiene la URL y la clave PÚBLICA; no lo edites a mano.`n" +
  "EXPO_PUBLIC_SUPABASE_URL=$apiUrl`n" +
  "EXPO_PUBLIC_SUPABASE_KEY=$publicKey`n"
[IO.File]::WriteAllText($EnvFile, $envText, $Utf8NoBom)
Ok 'apps\app\.env actualizado'

$mailUrl = if ($status.MAILPIT_URL) { $status.MAILPIT_URL } elseif ($status.INBUCKET_URL) { $status.INBUCKET_URL } else { 'http://127.0.0.1:54324' }

# 6. Arrancar -------------------------------------------------------------------------------
Step 'Arrancando OrganIO'
Info 'App:                          http://localhost:8081'
if ($lanIp) { Info "Desde el iPhone (misma wifi): http://${lanIp}:8081" }
Info "Códigos de acceso (correo):   $mailUrl"
if ($status.STUDIO_URL) { Info "Panel de la base de datos:    $($status.STUDIO_URL)" }
Info 'Para parar: Ctrl+C. Supabase sigue en segundo plano; OrganIO.cmd -Stop lo detiene.'
& npm run web -w '@organio/app'
