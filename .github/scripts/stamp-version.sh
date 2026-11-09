#!/bin/sh
# Writes a release version into package.json. release.yml runs it in the build workspace only; the committed
# package.json keeps the placeholder 0.0.0.
#
#   stamp-version.sh <version> [package-json]
#
# <version> is X.Y.Z[-pre] with no `v`. The default file is <repo>/package.json. Only `.version` changes; key order
# and every other field are kept (2-space JSON, trailing newline).
#
# Exit 0: stamped, the stdout line is `stamp-version: <version>`. Exit 1: the file cannot be read or written.
# Exit 2: bad usage or version. Every message is `stamp-version: <reason>` on stderr.
set -eu

here=$(cd "$(dirname "$0")" && pwd)

usage() {
    echo "stamp-version: $1" >&2
    exit 2
}

[ $# -ge 1 ] && [ $# -le 2 ] || usage "usage: stamp-version.sh <version> [package-json]"
version=$1
file=${2:-$here/../../package.json}

printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' ||
    usage "'$version' is not X.Y.Z[-pre]"
[ -f "$file" ] || {
    echo "stamp-version: $file not found" >&2
    exit 1
}

node -e "
const fs = require('node:fs');
const [file, version] = process.argv.slice(1);
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.version = version;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
" "$file" "$version" || {
    echo "stamp-version: could not update $file" >&2
    exit 1
}
echo "stamp-version: $version"
