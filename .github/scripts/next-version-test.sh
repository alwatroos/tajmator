#!/bin/sh
# Offline test of next-version.sh: bump rules, numeric ordering, prerelease and junk tags, exact versions and exit
# codes. No network. Prints "ok N cases" and exits 0, or the failing case and exits 1.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
tool=$here/next-version.sh
n=0

# expect <stdout> <exit> <tags> <bump> <version>
expect() {
    n=$((n + 1))
    want=$1 rc_want=$2 tags=$3 bump=$4 ver=$5
    rc=0
    got=$(printf '%s' "$tags" | sh "$tool" "$bump" "$ver" 2>/dev/null) || rc=$?
    if [ "$rc" != "$rc_want" ] || [ "$got" != "$want" ]; then
        printf 'FAIL case %s: bump=%s version=%s tags=[%s] -> exit %s out [%s], want exit %s out [%s]\n' \
            "$n" "$bump" "$ver" "$tags" "$rc" "$got" "$rc_want" "$want"
        exit 1
    fi
}

nl='
'
expect 0.0.1 0 '' patch ''
expect 1.0.1 0 'v1.0.0' patch ''
expect 1.1.0 0 'v1.0.0' minor ''
expect 2.0.0 0 'v1.0.0' major ''
expect 1.10.1 0 "v1.9.0${nl}v1.10.0" patch ''
expect 1.10.1 0 "v1.10.0${nl}v1.9.0" patch ''
expect 1.0.1 0 "v1.1.0-rc.1${nl}v1.0.0${nl}foo${nl}vX" patch ''
expect 1.1.0 0 "v1.1.0-rc.1${nl}v1.0.0" minor ''
expect 1.2.0-rc.1 0 'v1.0.0' patch 1.2.0-rc.1
expect 3.0.0 0 'v1.0.0' major 3.0.0
expect 0.9.0 0 'v1.0.0' patch 0.9.0
expect '' 1 'v1.0.0' patch 1.0.0
expect '' 1 "v1.0.0${nl}v1.0.1" patch 1.0.1
expect '' 1 "v1.0.1" minor 1.0.1
expect '' 1 "v1.0.1${nl}v1.1.0" patch 1.1.0
expect '' 2 'v1.0.0' patch v1.2.0
expect '' 2 'v1.0.0' patch 1.2
expect '' 2 'v1.0.0' patch 0.0.0
expect '' 2 '' patch 0.0.0
expect '' 2 'v1.0.0' huge ''
expect '' 2 'v1.0.0' '' ''

echo "ok $n cases"
