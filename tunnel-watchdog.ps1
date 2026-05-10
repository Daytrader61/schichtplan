$logFile = "C:\Users\Hacer\.openclaw\workspace\schichtplan\tunnel-log.txt"
$urlFile = "C:\Users\Hacer\.openclaw\workspace\schichtplan\tunnel-url.txt"

"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Watchdog started" | Out-File $logFile -Append

while ($true) {
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "ssh.exe"
        $psi.Arguments = "-N -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -R 80:localhost:3000 nokey@localhost.run"
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true

        $proc = [System.Diagnostics.Process]::Start($psi)
        "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Tunnel PID: $($proc.Id)" | Out-File $logFile -Append

        $timer = [System.Diagnostics.Stopwatch]::StartNew()
        while ($timer.Elapsed.TotalSeconds -lt 12 -and !$proc.HasExited) {
            $line = $proc.StandardError.ReadLine()
            if ($line) {
                if ($line -match "(https?://[a-z0-9]+\.lhr\.life)") {
                    $url = $matches[1]
                    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ✅ $url" | Out-File $logFile -Append
                    $url | Out-File $urlFile
                    break
                }
            }
            Start-Sleep -Milliseconds 500
        }

        # Keep stdin alive
        while (!$proc.HasExited) {
            try { $proc.StandardInput.WriteLine(""); $proc.StandardInput.Flush() } catch {}
            Start-Sleep -Seconds 30
        }

        "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Tunnel died. Restarting..." | Out-File $logFile -Append
    } catch {
        "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Error: $($_.Exception.Message)" | Out-File $logFile -Append
    }
    Start-Sleep -Seconds 5
}
