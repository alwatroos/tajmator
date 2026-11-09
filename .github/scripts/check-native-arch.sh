#!/bin/sh
# Fails unless the packaged app binary and its native modules include the expected architecture (a universal
# binary passes). An app with native
# modules of the wrong architecture packages fine and only fails at runtime, so release.yml checks before uploading.
#
#   check-native-arch.sh <release-dir> <arm64|x64>
#
# Exit 0: every checked file matches. Exit 1: a mismatch (prints "::error::<file> is <arch>, expected <arch>").
# Exit 2: usage error.
set -eu

[ "$#" -eq 2 ] || { echo "usage: check-native-arch.sh <release-dir> <arm64|x64>" >&2; exit 2; }
dir=$1
arch=$2
case $arch in
    x64) expected=x86_64 ;;
    arm64) expected=arm64 ;;
    *) echo "check-native-arch: arch must be arm64 or x64" >&2; exit 2 ;;
esac

app=$(find "$dir" -maxdepth 2 -name 'Tajmator.app' -type d | head -n 1)
[ -n "$app" ] || { echo "::error::no Tajmator.app found below $dir"; exit 1; }
robotjs=$app/Contents/Resources/app.asar.unpacked/node_modules/@jitsi/robotjs
[ -d "$robotjs" ] || { echo "::error::$robotjs is missing"; exit 1; }
natives=$(find "$robotjs" -name '*.node' -type f)
[ -n "$natives" ] || { echo "::error::no .node file found below $robotjs"; exit 1; }

# Newline-separated list: file names may hold spaces, so split on newlines only.
IFS='
'
# A universal binary lists both archs ("x86_64 arm64"); it is fine as long as the expected one is among them.
for file in "$app/Contents/MacOS/Tajmator" $natives; do
    actual=$(lipo -archs "$file")
    echo "$actual  $file"
    case " $actual " in
        *" $expected "*) ;;
        *)
            echo "::error::$file is $actual, expected $expected"
            exit 1
            ;;
    esac
done
