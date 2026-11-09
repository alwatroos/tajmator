#!/bin/sh
# Next release version, computed from the existing `v*` tags. tag-release.yml runs it; nothing else does.
#
#   git tag -l 'v*' | next-version.sh <patch|minor|major> <version>
#
# Tags come in on stdin, one per line. <version> is empty or an exact X.Y.Z[-pre] (no `v`); an exact version wins
# over <bump>. A bump starts from the highest stable tag vX.Y.Z (prerelease and non-semver tags are ignored,
# fields compared numerically); with no stable tag the base is 0.0.0. 0.0.0 is the placeholder in package.json
# and is never released.
#
# Stdout: the version without `v`, nothing else.
# Exit 0: success. Exit 1: the version already exists as a tag. Exit 2: bad usage (bump, exact version, 0.0.0).
# Every message is `next-version: <reason>` on stderr.
set -eu

die() {
    echo "next-version: $1" >&2
    exit 1
}

usage() {
    echo "next-version: $1" >&2
    exit 2
}

[ $# -eq 2 ] || usage "usage: next-version.sh <patch|minor|major> <version>"
bump=$1
exact=$2

case "$bump" in
patch | minor | major) ;;
*) usage "bump must be patch, minor or major, got '$bump'" ;;
esac

tags=$(cat)

if [ -n "$exact" ]; then
    printf '%s\n' "$exact" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' ||
        usage "'$exact' is not X.Y.Z[-pre]"
    [ "$exact" != "0.0.0" ] || usage "0.0.0 is the placeholder and cannot be released"
    version=$exact
else
    base=$(printf '%s\n' "$tags" |
        grep -E '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' |
        sed 's/^v//' | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1) || true
    [ -n "$base" ] || base=0.0.0
    major=${base%%.*}
    rest=${base#*.}
    minor=${rest%%.*}
    patch=${rest#*.}
    case "$bump" in
    patch) version="$major.$minor.$((patch + 1))" ;;
    minor) version="$major.$((minor + 1)).0" ;;
    major) version="$((major + 1)).0.0" ;;
    esac
fi

if printf '%s\n' "$tags" | grep -Fxq "v$version"; then
    die "the tag v$version already exists"
fi
printf '%s\n' "$version"
