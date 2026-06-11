# VaultTV Server — system tray icon
# Full Plex-style menu: open, start at login, update libraries, cancel, check updates, how to, exit

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── Read port from config.json ────────────────────────────────────────────────
$Port = 8080
$configPath = Join-Path $PSScriptRoot "config.json"
if (Test-Path $configPath) {
    try {
        $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
        if ($cfg.port) { $Port = $cfg.port }
    } catch {}
}
$url      = "http://localhost:$Port"
$interna  = "$url/internal"
$startupRegPath = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
$startupRegName = "VaultTV Server"
$hiddenScript   = Join-Path $PSScriptRoot "start-hidden.ps1"

# ── Icon ──────────────────────────────────────────────────────────────────────
$bmp = New-Object System.Drawing.Bitmap 16, 16
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
$g.FillEllipse([System.Drawing.Brushes]::MediumPurple, 0, 0, 15, 15)
$font = New-Object System.Drawing.Font("Arial", 5, [System.Drawing.FontStyle]::Bold)
$g.DrawString("VTV", $font, [System.Drawing.Brushes]::White, 1, 4)
$g.Dispose()
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())

# ── Tray icon ─────────────────────────────────────────────────────────────────
$tray         = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon    = $icon
$tray.Text    = "VaultTV Server  |  $url"
$tray.Visible = $true

$tray.BalloonTipTitle = "VaultTV Server"
$tray.BalloonTipText  = "Running at $url - double-click to open"
$tray.ShowBalloonTip(3000)

# ── Helper: call internal API ─────────────────────────────────────────────────
function Invoke-Internal($method, $path) {
    try {
        $r = Invoke-RestMethod -Method $method -Uri "$interna$path" -TimeoutSec 3 -ErrorAction Stop
        return $r
    } catch { return $null }
}

# ── Helper: check startup registry ───────────────────────────────────────────
function Get-StartupEnabled {
    try {
        $val = Get-ItemProperty -Path $startupRegPath -Name $startupRegName -ErrorAction Stop
        return ($val.$startupRegName -ne $null)
    } catch { return $false }
}

function Set-StartupEnabled($enable) {
    if ($enable) {
        $cmd = 'powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $hiddenScript + '"'
        Set-ItemProperty -Path $startupRegPath -Name $startupRegName -Value $cmd
    } else {
        Remove-ItemProperty -Path $startupRegPath -Name $startupRegName -ErrorAction SilentlyContinue
    }
}

# ── Context menu ──────────────────────────────────────────────────────────────
$menu = New-Object System.Windows.Forms.ContextMenuStrip

# Open VaultTV...
$openItem = New-Object System.Windows.Forms.ToolStripMenuItem
$openItem.Text = "Open VaultTV..."
$openItem.Font = New-Object System.Drawing.Font($openItem.Font, [System.Drawing.FontStyle]::Bold)
$openItem.add_Click({ Start-Process $url })
$menu.Items.Add($openItem) | Out-Null

$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# Start at Login (checkmark toggle)
$loginItem = New-Object System.Windows.Forms.ToolStripMenuItem
$loginItem.Text    = "Start VaultTV Server at Login"
$loginItem.Checked = Get-StartupEnabled
$loginItem.add_Click({
    $loginItem.Checked = -not $loginItem.Checked
    Set-StartupEnabled $loginItem.Checked
})
$menu.Items.Add($loginItem) | Out-Null

$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# Update Libraries
$rescanItem = New-Object System.Windows.Forms.ToolStripMenuItem
$rescanItem.Text = "Update Libraries"
$rescanItem.add_Click({
    $r = Invoke-Internal "POST" "/rescan"
    if ($r) {
        $tray.BalloonTipTitle = "VaultTV Server"
        $tray.BalloonTipText  = "Library update started..."
        $tray.ShowBalloonTip(2000)
    }
})
$menu.Items.Add($rescanItem) | Out-Null

# Cancel Library Update
$cancelItem = New-Object System.Windows.Forms.ToolStripMenuItem
$cancelItem.Text    = "Cancel Library Update"
$cancelItem.Enabled = $false
$cancelItem.add_Click({
    Invoke-Internal "POST" "/cancel-rescan" | Out-Null
})
$menu.Items.Add($cancelItem) | Out-Null

$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# Check for Updates
$updateItem = New-Object System.Windows.Forms.ToolStripMenuItem
$updateItem.Text = "Check for Updates"
$updateItem.add_Click({
    $status = Invoke-Internal "GET" "/status"
    $current = if ($status) { $status.version } else { "unknown" }
    [System.Windows.Forms.MessageBox]::Show(
        "VaultTV Server v$current`n`nTo update, pull the latest code and restart the server.",
        "Check for Updates",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
})
$menu.Items.Add($updateItem) | Out-Null

# How To
$helpItem = New-Object System.Windows.Forms.ToolStripMenuItem
$helpItem.Text = "How To"
$helpItem.add_Click({ Start-Process "$url/#/guide" })
$menu.Items.Add($helpItem) | Out-Null

$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# Exit
$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem
$exitItem.Text = "Exit"
$exitItem.add_Click({
    $tray.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})
$menu.Items.Add($exitItem) | Out-Null

$tray.ContextMenuStrip = $menu
$tray.add_DoubleClick({ Start-Process $url })

# ── Poll rescan status every 3s to enable/disable menu items ─────────────────
$timer          = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.add_Tick({
    $status = Invoke-Internal "GET" "/status"
    if ($status -ne $null) {
        $running = $status.running -eq $true
        $rescanItem.Enabled = -not $running
        $cancelItem.Enabled = $running
        if ($running) {
            $tray.Text = "VaultTV Server  |  Updating library..."
        } else {
            $tray.Text = "VaultTV Server  |  $url"
        }
    }
})
$timer.Start()

# ── Message pump ──────────────────────────────────────────────────────────────
[System.Windows.Forms.Application]::Run()

$timer.Stop()
$tray.Visible = $false
$tray.Dispose()
