$tunnelScript = @'
$logFile = "$env:USERPROFILE\.openclaw\workspace\schichtplan\tunnel-log.txt"
$urlFile = "$env:USERPROFILE\.openclaw\workspace\schichtplan\tunnel-url.txt"

function Start-Tunnel {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "ssh.exe"
    $psi.Arguments = "-N -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -R 80:localhost:3000 nokey@localhost.run"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    
    # Extract URL from stderr (localhost.run outputs URL on stderr)
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $output = ""
    while ($timer.Elapsed.TotalSeconds -lt 15 -and !$proc.HasExited) {
        $line = $proc.StandardError.ReadLine()
        if ($line) {
            $output += $line + "`n"
            if ($line -match "(https://[a-z0-9]+\.lhr\.life)") {
                $url = $matches[1]
                "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Tunnel ready: $url" | Out-File $logFile -Append
                $url | Out-File $urlFile
                break
            }
        }
        Start-Sleep -Milliseconds 500
    }
    
    return $proc
}

"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Watchdog started" | Out-File $logFile -Append

$proc = Start-Tunnel

while ($true) {
    if ($proc.HasExited) {
        "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Tunnel died (exit: $($proc.ExitCode)), restarting in 5s..." | Out-File $logFile -Append
        Start-Sleep -Seconds 5
        $proc = Start-Tunnel
    }
    Start-Sleep -Seconds 15
}
'@

$tunnelScript | Out-File "$env:USERPROFILE\.openclaw\workspace\schichtplan\tunnel-watchdog.ps1" -Encoding UTF8

# Delete old tasks
schtasks /delete /tn "SchichtplanTunnel" /f 2>$null
schtasks /delete /tn "SchichtplanApp" /f 2>$null
Start-Sleep -Seconds 1

# Create new scheduled task that runs at startup
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"C:\Users\Hacer\.openclaw\workspace\schichtplan\tunnel-watchdog.ps1`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName "SchichtplanTunnel" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force 2>&1

Write-Output "Scheduled task created. Starting now..."
schtasks /run /tn "SchichtplanTunnel" 2>&1
Start-Sleep -Seconds 10

Get-Content "$env:USERPROFILE\.openclaw\workspace\schichtplan\tunnel-log.txt" -Tail 8 2>$null
Get-Content "$env:USERPROFILE\.openclaw\workspace\schichtplan\tunnel-url.txt" -Tail 3 2>$null
