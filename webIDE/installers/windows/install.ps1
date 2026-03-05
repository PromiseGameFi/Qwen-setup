$RootDir = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $RootDir
Write-Host "[webide] Windows local installer"

npm install
npm run dev:bridge
