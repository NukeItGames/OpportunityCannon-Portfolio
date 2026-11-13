$ErrorActionPreference = 'Stop'
$nativeOutput = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../build/native'))
New-Item -ItemType Directory -Force -Path $nativeOutput | Out-Null
$nativeSource = Join-Path $PSScriptRoot 'Host.cs'
& "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" /nologo /target:exe /reference:System.Security.dll "/out:$nativeOutput/CannonHost.exe" $nativeSource
if ($LASTEXITCODE -ne 0) { throw 'Native host build failed' }
