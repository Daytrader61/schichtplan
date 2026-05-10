$ErrorActionPreference = "SilentlyContinue"
while ($true) {
    $out = ssh -N -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ExitOnForwardFailure=yes -R 80:localhost:3000 nokey@localhost.run 2>&1 | Out-String
    Add-Content -Path "C:\Users\Hacer\.openclaw\workspace\schichtplan\tunnel-out.txt" -Value ($out -join "`n")
    Start-Sleep 5
}
