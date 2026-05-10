$pinfo = New-Object System.Diagnostics.ProcessStartInfo
$pinfo.FileName = "ssh.exe"
$pinfo.RedirectStandardInput = $true
$pinfo.RedirectStandardOutput = $true
$pinfo.RedirectStandardError = $true
$pinfo.UseShellExecute = $false
$pinfo.CreateNoWindow = $true
$pinfo.Arguments = "-N -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:3000 nokey@localhost.run"
$p = New-Object System.Diagnostics.Process
$p.StartInfo = $pinfo
$p.Start() | Out-Null

$log = "C:\Users\Hacer\.openclaw\workspace\schichtplan\tunnel-url.txt"
"Tunnel started PID: $($p.Id)" | Out-File $log

# Read initial output for the URL
Start-Sleep -Seconds 10
$stdout = $p.StandardOutput.ReadToEnd()
$stderr = $p.StandardError.ReadToEnd()
"$stdout" | Out-File $log -Append
"$stderr" | Out-File $log -Append

# Keep stdin open with periodic writes
while (-not $p.HasExited) {
  try { $p.StandardInput.WriteLine(""); $p.StandardInput.Flush() } catch {}
  Start-Sleep -Seconds 30
}
"Tunnel exited" | Out-File $log -Append
