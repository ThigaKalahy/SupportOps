Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.Visible = $true
$notify.ShowBalloonTip(
    5000,
    'Prontuario',
    'Claude Code esta esperando voce',
    [System.Windows.Forms.ToolTipIcon]::Warning
)

[console]::beep(800, 200)
Start-Sleep -Seconds 3
$notify.Dispose()