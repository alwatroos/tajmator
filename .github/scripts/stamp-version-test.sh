#!/bin/sh
# Offline test of stamp-version.sh: only `.version` changes, the trailing newline stays, bad versions and a missing
# file fail. No network. Prints "ok N cases" and exits 0, or the failing case and exits 1.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
tool=$here/stamp-version.sh
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
n=0

pass() { n=$((n + 1)); "$@" >/dev/null 2>&1 || { printf 'FAIL expected pass: %s\n' "$*"; exit 1; }; }
fail() { n=$((n + 1)); if "$@" >/dev/null 2>&1; then printf 'FAIL expected failure: %s\n' "$*"; exit 1; fi; }
# code <exit> <command...>
code() {
    n=$((n + 1))
    want=$1
    shift
    rc=0
    "$@" >/dev/null 2>&1 || rc=$?
    [ "$rc" = "$want" ] || { printf 'FAIL expected exit %s, got %s: %s\n' "$want" "$rc" "$*"; exit 1; }
}

cat > "$work/package.json" <<'JSON'
{
  "name": "demo",
  "version": "0.0.0",
  "scripts": {
    "build": "x"
  },
  "dependencies": {
    "a": "^1.0.0"
  }
}
JSON
cp "$work/package.json" "$work/orig.json"

pass sh "$tool" 1.2.3 "$work/package.json"
pass test "$(node -p "require('$work/package.json').version")" = 1.2.3
pass test "$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$work/package.json")" = 1.2.3
pass test "$(sed -n 2p "$work/package.json")" = '  "name": "demo",'
# Everything except .version is unchanged (key order too: the files are equal once the version line matches).
pass test "$(node -e "
const fs = require('node:fs');
const strip = (f) => { const o = JSON.parse(fs.readFileSync(f, 'utf8')); delete o.version; return JSON.stringify(o); };
process.stdout.write(strip('$work/package.json') === strip('$work/orig.json') ? 'same' : 'differ');
")" = same
sed 's/1\.2\.3/0.0.0/' "$work/package.json" > "$work/restored.json"
pass cmp "$work/restored.json" "$work/orig.json"
pass test "$(tail -c 1 "$work/package.json" | od -An -c | tr -d ' ')" = '\n'

pass sh "$tool" 1.3.0-rc.1 "$work/package.json"
pass test "$(node -p "require('$work/package.json').version")" = 1.3.0-rc.1

code 2 sh "$tool" v1.0.0 "$work/package.json"
code 2 sh "$tool" 1.0 "$work/package.json"
code 2 sh "$tool" '' "$work/package.json"
code 2 sh "$tool"
pass test "$(node -p "require('$work/package.json').version")" = 1.3.0-rc.1
code 1 sh "$tool" 1.0.0 "$work/missing.json"
fail sh "$tool" 1.0.0 "$work/missing.json"

echo "ok $n cases"
