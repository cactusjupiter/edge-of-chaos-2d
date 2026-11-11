# Refresh the publish/ staging dir from the live project files, then re-commit.
# Run from the workspace root:  powershell -File projects\edge-of-chaos-2d\publish\refresh.ps1
$root = Split-Path $PSScriptRoot   # .../projects/edge-of-chaos-2d
Copy-Item "$root\index.html", "$root\engine.js", "$root\app.js" $PSScriptRoot -Force
Copy-Item "$root\lib\*" "$PSScriptRoot\lib" -Force
Write-Output "publish/ refreshed from project root."
