# VaultTV Server — silent launcher (used by Start at Login registry entry)
# Starts node index.js hidden, then runs the tray icon in this process.

$serverDir = $PSScriptRoot

# Only start node if nothing is already on port 8080
$inUse = netstat -ano | Select-String ":8080 " | Select-String "LISTENING"
if (-not $inUse) {
    Start-Process -FilePath "node" -ArgumentList "index.js" -WorkingDirectory $serverDir -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

# Run the tray icon (blocks until Exit is clicked)
& "$serverDir\tray.ps1"
