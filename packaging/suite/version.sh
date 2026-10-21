#!/usr/bin/env bash
set -euo pipefail
version=${SUITE_VERSION:-$(date -u +%Y.%m.%d)}
# An optional .N suffix allows a second release on the same day (Burn versions have four fields).
day=${version%.*}
[[ $version =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$ ]] && day=$version
if [[ ! $version =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}(\.[1-9][0-9]{0,2})?$ ]] || [[ $(date -u -d "${day//./-}" +%Y.%m.%d) != "$day" ]]; then
  echo 'Version must be a valid date YYYY.MM.DD, optionally followed by .N' >&2
  exit 1
fi
echo "version=$version" >> "$GITHUB_OUTPUT"
