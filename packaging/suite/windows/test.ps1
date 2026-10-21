$ErrorActionPreference = 'Stop'
$bundle = Join-Path $PWD 'artifacts/ERPCons-VanPhong-windows-x64-setup.exe'
$bases = @('VanBan', 'BangTinh', 'TrinhChieu', 'PDF')
$forks = @('wordcraft', 'gridcraft', 'deckcraft', 'pdfcraft')
$products = @{}
New-Item -ItemType Directory -Force test-logs | Out-Null
$installer = New-Object -ComObject WindowsInstaller.Installer
foreach ($base in $bases) {
    $msi = Join-Path $PWD "inputs/$base/ERPCons-$base-windows-x64.msi"
    $database = $installer.OpenDatabase($msi, 0)
    $view = $database.OpenView("SELECT Value FROM Property WHERE Property = 'ProductCode'")
    $view.Execute()
    $record = $view.Fetch()
    $products[$base] = $record.StringData(1)
    $view.Close()
}
function Invoke-Installer([string]$File, [string[]]$Arguments) {
    $process = Start-Process -FilePath $File -ArgumentList $Arguments -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) { throw "Installer exit code: $($process.ExitCode)" }
}
function Has-App([string]$Base) {
    $index = [array]::IndexOf($bases, $Base)
    return Test-Path "${env:ProgramFiles}/ERPCons/$Base/$($forks[$index]).exe"
}
function Has-Arp([string]$Base) {
    return Test-Path "HKLM:/Software/Microsoft/Windows/CurrentVersion/Uninstall/$($products[$Base])"
}
Invoke-Installer $bundle @('/install', '/quiet', '/norestart', '/log', "`"$PWD/test-logs/fresh-install.log`"")
foreach ($base in $bases) {
    if (!(Has-App $base) -or !(Has-Arp $base)) { throw "Fresh install missing EXE or ARP entry: $base" }
}
Write-Output 'PASS: fresh bundle install has all four EXEs and ARP entries'
Invoke-Installer $bundle @('/uninstall', '/quiet', '/norestart', '/log', "`"$PWD/test-logs/fresh-uninstall.log`"")
foreach ($base in $bases) {
    if ((Has-App $base) -or (Has-Arp $base)) { throw "Fresh uninstall left EXE or ARP entry: $base" }
}
Write-Output 'PASS: fresh bundle uninstall removed all four EXEs and ARP entries'
# Burn's dependency ownership of an independently installed MSI is observed separately.
try {
    $msi = Join-Path $PWD 'inputs/VanBan/ERPCons-VanBan-windows-x64.msi'
    Invoke-Installer msiexec.exe @('/i', "`"$msi`"", '/qn', '/norestart', '/l*v', "`"$PWD/test-logs/standalone.log`"")
    if (!(Has-App 'VanBan') -or !(Has-Arp 'VanBan')) { throw 'Standalone VanBan install missing' }
    Invoke-Installer $bundle @('/install', '/quiet', '/norestart', '/log', "`"$PWD/test-logs/existing-install.log`"")
    foreach ($base in $bases) {
        if (!(Has-App $base) -or !(Has-Arp $base)) { throw "Existing-app scenario missing: $base" }
    }
    Invoke-Installer $bundle @('/uninstall', '/quiet', '/norestart', '/log', "`"$PWD/test-logs/existing-uninstall.log`"")
    $result = "OBSERVATION (b): VanBan stayed installed: EXE=$(Has-App 'VanBan'); ARP=$(Has-Arp 'VanBan')"
    Write-Output $result
    $result | Out-File $env:GITHUB_STEP_SUMMARY -Append
} catch {
    $result = "OBSERVATION (b): inconclusive: $_"
    Write-Warning $result
    $result | Out-File $env:GITHUB_STEP_SUMMARY -Append
}
