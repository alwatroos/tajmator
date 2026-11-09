#!/bin/sh
# Signed and notarised build of one macOS architecture of the app. Only the `sign-macos` job of release.yml
# runs it with real secrets. electron-builder itself signs (osx-sign) and notarises (notarytool) while packaging, so
# the unsigned `pnpm package` path is the same build with TAJMATOR_SIGN=1 added.
#
#   sign-desktop.sh <arm64|x64> <out-dir>
#
# Environment (all required, non-empty):
#   CSC_LINK                 base64 of the Developer ID Application .p12 (electron-builder accepts it as is)
#   CSC_KEY_PASSWORD         password of the .p12
#   APPLE_API_KEY_CONTENT    the App Store Connect AuthKey_<id>.p8, as base64 or as raw PEM
#   APPLE_API_KEY_ID         key id
#   APPLE_API_ISSUER         issuer id
#   RUNNER_TEMP              scratch directory (falls back to TMPDIR, then /tmp)
#
# Exit 0: the signed .dmg and .zip are in <out-dir> and the last stdout line is `sign-desktop: ok (<arch>)`.
# Exit 1: packaging or verification failed. Exit 2: bad arch or an empty required variable.
# Every message is `sign-desktop: <reason>`.
#
# SECRETS: never add `set -x`, never echo a secret. The API key is decoded into a 0700 temp dir that the EXIT trap
# removes.
set -eu
umask 077

work=''

die() {
    echo "sign-desktop: $1" >&2
    exit 1
}

usage() {
    echo "sign-desktop: $1" >&2
    exit 2
}

cleanup() {
    rc=$?
    trap - EXIT INT TERM
    [ -z "$work" ] || rm -rf "$work"
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

[ "$#" -eq 2 ] || usage "usage: sign-desktop.sh <arm64|x64> <out-dir>"
arch=$1
out=$2
case $arch in
    arm64 | x64) ;;
    *) usage "arch must be arm64 or x64" ;;
esac

: "${CSC_LINK:=}" "${CSC_KEY_PASSWORD:=}" "${APPLE_API_KEY_CONTENT:=}" "${APPLE_API_KEY_ID:=}" "${APPLE_API_ISSUER:=}"
for name in CSC_LINK CSC_KEY_PASSWORD APPLE_API_KEY_CONTENT APPLE_API_KEY_ID APPLE_API_ISSUER; do
    eval "value=\${$name}"
    [ -n "$value" ] || usage "$name is empty"
done
value=''
printf '%s\n' "$APPLE_API_KEY_ID" | grep -Eq '^[0-9A-Za-z_-]+$' || usage "APPLE_API_KEY_ID has an unexpected format"

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
cd "$repo"

rm -rf release

work=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/sign-desktop.XXXXXX")
key=$work/AuthKey_$APPLE_API_KEY_ID.p8
case $APPLE_API_KEY_CONTENT in
    -----BEGIN*) printf '%s\n' "$APPLE_API_KEY_CONTENT" >"$key" ;;
    *) printf '%s' "$APPLE_API_KEY_CONTENT" | base64 --decode >"$key" || die "APPLE_API_KEY is neither a PEM nor base64" ;;
esac
APPLE_API_KEY=$key
export APPLE_API_KEY
unset APPLE_API_KEY_CONTENT

TAJMATOR_ARCH=$arch TAJMATOR_SIGN=1 pnpm package || die "signed packaging failed"

sh "$here/check-native-arch.sh" release "$arch" || die "native module architecture check failed"
zip=$(find release -maxdepth 1 -name '*.zip' | head -n 1)
[ -n "$zip" ] || die "no .zip was produced"
sh "$here/verify-macos-app.sh" "$zip" || die "the packaged app failed verification"

mkdir -p "$out"
mv release/*.dmg release/*.zip "$out"/ || die "cannot collect the artifacts"
echo "sign-desktop: ok ($arch)"
