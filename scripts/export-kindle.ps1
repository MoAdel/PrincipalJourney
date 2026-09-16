<#
.SYNOPSIS
    Principal Software Engineer Journey — Kindle EPUB Automated Exporter
    PowerShell Wrapper for scripts/export-kindle.js

.DESCRIPTION
    Compiles curriculum Markdown modules into Kindle-ready EPUB 3 eBooks
    compatible with Amazon Send to Kindle (https://www.amazon.com/sendtokindle)
    and USB sideloading.

.PARAMETER Module
    Specific module to export (e.g., '02-Authentication', '02', '01-Production-Ready-WebAPI').

.PARAMETER All
    Compiles all 14 individual modules, 6 multi-module study volumes, and the complete omnibus.

.PARAMETER Volumes
    Compiles the 6 grouped study volumes (Web API, Security, Storage, Concurrency, Cloud, Observability).

.PARAMETER Omnibus
    Compiles the complete single omnibus edition containing all 14 modules.

.PARAMETER List
    Lists all available modules and volumes.

.PARAMETER Out
    Custom output directory (default: dist/kindle).

.EXAMPLE
    .\scripts\export-kindle.ps1 -Module "02-Authentication"

.EXAMPLE
    .\scripts\export-kindle.ps1 -Module "02"

.EXAMPLE
    .\scripts\export-kindle.ps1 -Volumes

.EXAMPLE
    .\scripts\export-kindle.ps1 -All
#>

[CmdletBinding()]
param (
    [Alias("m")]
    [string]$Module,

    [Alias("a")]
    [switch]$All,

    [Alias("v")]
    [switch]$Volumes,

    [switch]$Omnibus,

    [Alias("l")]
    [switch]$List,

    [Alias("o")]
    [string]$Out,

    [Alias("h")]
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$JsScript = Join-Path $ScriptDir "export-kindle.js"

if (-not (Test-Path $JsScript)) {
    Write-Error "Could not find export engine at: $JsScript"
    exit 1
}

# Ensure Node.js is accessible
$NodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    Write-Error "Node.js is not found in PATH. Please install Node.js 18+ to run the exporter."
    exit 1
}

# Build arguments array
$NodeArgs = @($JsScript)

if ($Help) {
    $NodeArgs += "--help"
} elseif ($List) {
    $NodeArgs += "--list"
} elseif ($All) {
    $NodeArgs += "--all"
} elseif ($Volumes) {
    $NodeArgs += "--volumes"
} elseif ($Omnibus) {
    $NodeArgs += "--omnibus"
} elseif ($Module) {
    $NodeArgs += "--module"
    $NodeArgs += $Module
}

if ($Out) {
    $NodeArgs += "--out"
    $NodeArgs += $Out
}

# Execute
& node $NodeArgs
