#!/bin/sh
# Checks that a packaged macOS zip holds a properly signed, notarised and stapled "Tajmator.app".
#
#   verify-macos-app.sh <app.zip>
#
# Checks, in order, and exits 1 on the first failure (message "verify-macos-app: <reason>"):
#   1. codesign --verify --deep --strict passes
#   2. the hardened runtime flag is set and the authority is a Developer ID Application certificate
#   3. the notarisation ticket is stapled (xcrun stapler validate)
#   4. Gatekeeper accepts it as "Notarized Developer ID" (spctl --assess)
# Exit 2: usage error. Needs macOS (ditto, codesign, xcrun, spctl).
set -eu

work=''
cleanup() {
    rc=$?
    trap - EXIT INT TERM
    [ -z "$work" ] || rm -rf "$work"
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

die() {
    echo "verify-macos-app: $1" >&2
    exit 1
}

[ "$#" -eq 1 ] || { echo "usage: verify-macos-app.sh <app.zip>" >&2; exit 2; }
zip=$1
[ -f "$zip" ] || die "no such file: $zip"

work=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/verify-macos-app.XXXXXX")
ditto -x -k "$zip" "$work" || die "cannot extract $zip"
app="$work/Tajmator.app"
[ -d "$app" ] || die "Tajmator.app is not in $zip"

codesign --verify --deep --strict --verbose=2 "$app" || die "codesign verification failed"

info=$(codesign -dv --verbose=2 "$app" 2>&1) || die "codesign -dv failed"
printf '%s\n' "$info" | grep -Eq 'flags=0x[0-9a-f]+\(.*runtime.*\)' || die "hardened runtime flag is not set"
printf '%s\n' "$info" | grep -q 'Authority=Developer ID Application' || die "not signed with a Developer ID Application certificate"

xcrun stapler validate "$app" || die "no stapled notarisation ticket"

assessment=$(spctl --assess --type execute --verbose=2 "$app" 2>&1) || die "Gatekeeper rejected the app: $assessment"
printf '%s\n' "$assessment" | grep -q 'source=Notarized Developer ID' || die "Gatekeeper source is not Notarized Developer ID: $assessment"

echo "verify-macos-app: ok ($zip)"
