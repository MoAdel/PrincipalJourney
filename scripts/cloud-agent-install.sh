#!/usr/bin/env bash
set -euo pipefail

if ! command -v dotnet >/dev/null 2>&1; then
  echo "dotnet SDK is not available on PATH" >&2
  exit 1
fi

dotnet --version
dotnet --list-sdks
