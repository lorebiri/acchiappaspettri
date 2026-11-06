# Installa l'installer vero per l'utente, controlla menu Start e avvio, poi disinstalla aspettando la fine.
# Uso: pwsh scripts/windows-install-test.ps1 <cartella con *-setup.exe>
param([string]$Bundle = 'src-tauri/target/release/bundle/nsis')
$ErrorActionPreference = 'Stop'
function WaitFor([scriptblock]$ok, [int]$seconds) { for ($i = 0; $i -lt $seconds * 2; $i++) { if (& $ok) { return $true }; Start-Sleep -Milliseconds 500 }; return [bool](& $ok) }
$exe = @(Get-ChildItem $Bundle -Filter *-setup.exe)
if ($exe.Count -ne 1) { throw "attesi un solo installer in $Bundle, trovati $($exe.Count)" }
Write-Host "Installer: $($exe[0].Name)"
$dir = "$env:LOCALAPPDATA\Acchiappaspettri"
$sm = @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs")
$lnk = { [bool](Get-ChildItem $sm -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'Acchiappaspettri' }) }
$appExe = { Get-ChildItem $dir -Filter *.exe -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'uninstall' } | Select-Object -First 1 }
Start-Process $exe[0].FullName -ArgumentList '/S' -Wait
if (-not (WaitFor { [bool](& $appExe) } 30)) { throw "non installato in $dir" }
$app = & $appExe
Write-Host "Installato in $dir : $($app.Name)"
if (-not (WaitFor $lnk 30)) { throw 'manca la voce nel menu Start' }
Write-Host 'Voce nel menu Start presente'
$p = Start-Process $app.FullName -PassThru
Start-Sleep 20
if ($p.HasExited) { throw "l'app si è chiusa all'avvio (codice $($p.ExitCode))" }
Write-Host 'Avviata e ancora aperta dopo 20 s'
Stop-Process $p.Id -Force
if (-not (WaitFor { $p.HasExited } 15)) { throw "l'app non si chiude" }
# _?= fa girare il disinstallatore sul posto: Start-Process -Wait aspetta davvero la fine (senza, NSIS si copia altrove e torna subito)
Start-Process (Join-Path $dir 'uninstall.exe') -ArgumentList '/S', "_?=$dir" -Wait
if (-not (WaitFor { -not (Test-Path $app.FullName) } 30)) { throw 'disinstallazione incompleta' }
if (-not (WaitFor { -not (& $lnk) } 30)) { throw 'voce del menu Start rimasta dopo la disinstallazione' }
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Disinstallata'
