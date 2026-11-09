#!/bin/sh
# Offline test of update-manifest.mjs: sign/verify round-trip (PEM, base64 DER and base64 PEM keys) and tamper
# detection. No network. Prints "ok N cases" and exits 0, or the failing case and exits 1.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
tool=$here/update-manifest.mjs
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
n=0

pass() { n=$((n + 1)); "$@" >/dev/null 2>&1 || { printf 'FAIL expected pass: %s\n' "$*"; exit 1; }; }
fail() { n=$((n + 1)); if "$@" >/dev/null 2>&1; then printf 'FAIL expected failure: %s\n' "$*"; exit 1; fi; }

mkdir "$work/art"
printf 'dmg-bytes' > "$work/art/Tajmator-1.2.3-arm64.dmg"
printf 'zip-bytes' > "$work/art/Tajmator-1.2.3-arm64-mac.zip"
printf 'ignored' > "$work/art/notes.txt"

node --input-type=module -e "
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const w = process.argv[1];
const a = generateKeyPairSync('ed25519');
const b = generateKeyPairSync('ed25519');
const pem = (k) => k.privateKey.export({ format: 'pem', type: 'pkcs8' });
writeFileSync(w + '/a.pem', pem(a));
writeFileSync(w + '/a.der.b64', a.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
writeFileSync(w + '/a.pem.b64', Buffer.from(pem(a)).toString('base64'));
writeFileSync(w + '/a.pub.pem', a.publicKey.export({ format: 'pem', type: 'spki' }));
writeFileSync(w + '/b.pub.b64', b.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'));
" "$work"

ts=2026-01-02T03:04:05Z
sign() { node "$tool" sign --tag "$1" --artifacts "$work/art" --published "$ts" --key-file "$2" --out "$3"; }

for k in a.pem a.der.b64 a.pem.b64; do
    pass sign v1.2.3 "$work/$k" "$work/m-$k.json"
    pass node "$tool" verify "$work/m-$k.json"
    pass node "$tool" verify "$work/m-$k.json" --artifacts "$work/art"
done

m=$work/m-a.pem.json
pass node "$tool" verify "$m" --public-key "$work/a.pub.pem"
fail node "$tool" verify "$m" --public-key "$work/b.pub.b64"

# content: the manifest lists only release artifacts, with size and sha256, and the version comes from the tag
pass node -e "
const m = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
const ok = m.version === '1.2.3' && m.tag === 'v1.2.3' && m.artifacts.length === 2
  && m.artifacts.every((x) => x.size > 0 && /^[0-9a-f]{64}\$/.test(x.sha256) && /\.(dmg|zip)\$/.test(x.name));
process.exit(ok ? 0 : 1);
" "$m"

# tamper detection: every signed field, the signature itself, and the artifact bytes
tamper() { node -e "
const fs = require('fs');
const m = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
$1;
fs.writeFileSync(process.argv[2], JSON.stringify(m));
" "$m" "$work/t.json"; }
tamper "m.version = '9.9.9'";               fail node "$tool" verify "$work/t.json"
tamper "m.tag = 'v9.9.9'";                  fail node "$tool" verify "$work/t.json"
tamper "m.published = '2030-01-01T00:00:00Z'"; fail node "$tool" verify "$work/t.json"
tamper "m.artifacts[0].sha256 = '0'.repeat(64)"; fail node "$tool" verify "$work/t.json"
tamper "m.artifacts[0].size += 1";          fail node "$tool" verify "$work/t.json"
tamper "m.artifacts.pop()";                 fail node "$tool" verify "$work/t.json"
tamper "m.signature = 'AAAA' + m.signature.slice(4)"; fail node "$tool" verify "$work/t.json"
tamper "delete m.signature";                fail node "$tool" verify "$work/t.json"
# artifact bytes changed after signing
printf 'tampered' > "$work/art/Tajmator-1.2.3-arm64.dmg"
fail node "$tool" verify "$m" --artifacts "$work/art"

# input guards
fail sign 1.2.3 "$work/a.pem" "$work/x.json"
fail sign v1.2 "$work/a.pem" "$work/x.json"
fail sign v1.2.3 "$work/missing" "$work/x.json"
mkdir "$work/empty"
fail node "$tool" sign --tag v1.2.3 --artifacts "$work/empty" --published "$ts" --key-file "$work/a.pem" --out "$work/x.json"
fail node "$tool" sign --tag v1.2.3 --artifacts "$work/art" --published nonsense --key-file "$work/a.pem" --out "$work/x.json"

# entrypoint detection: a script path containing a space must still run (file:// URL encoding)
mkdir "$work/dir with space"
cp "$tool" "$work/dir with space/update-manifest.mjs"
printf 'dmg-bytes' > "$work/art/Tajmator-1.2.3-arm64.dmg"
pass node "$work/dir with space/update-manifest.mjs" sign --tag v1.2.3 --artifacts "$work/art" --published "$ts" --key-file "$work/a.pem" --out "$work/space.json"
pass test -s "$work/space.json"
pass node "$work/dir with space/update-manifest.mjs" verify "$work/space.json"

echo "ok $n cases"
