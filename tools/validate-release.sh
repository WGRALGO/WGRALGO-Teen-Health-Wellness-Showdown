#!/usr/bin/env bash
# Teen Health & Wellness Showdown — release validation.
# Usage: ./tools/validate-release.sh [path/to/app.apk]
# Exit non-zero if any check fails.
set -u
cd "$(dirname "$0")/.."

GR=app/build.gradle
VERSION=$(sed -n 's/.*versionName "\([^"]*\)".*/\1/p' $GR)
CODE=$(sed -n 's/.*versionCode \([0-9]*\).*/\1/p' $GR)
IDX=app/src/main/assets/www/index.html
RES=app/src/main/res

PASS=0
FAIL=0
ok()  { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }

echo "== Question banks =="
OUT=$(node - "$IDX" <<'NODE'
const fs = require("fs");
const h = fs.readFileSync(process.argv[2], "utf8");
const R = (ok, msg) => console.log((ok ? "PASS " : "FAIL ") + msg);
for (const [name, min] of [["QUESTIONS", 300], ["QUESTIONS_KIDS", 150]]) {
  const m = h.match(new RegExp("var " + name + " = (\\[[\\s\\S]*?\\]);\\n"));
  if (!m) { R(false, name + " not found"); continue; }
  const bank = eval(m[1]);
  R(bank.length >= min, name + ": " + bank.length + " questions (at least " + min + ")");
  R(bank.every(q => q.q && Array.isArray(q.o) && q.o.length === 4 && q.o.every(Boolean) &&
    Number.isInteger(q.c) && q.c >= 0 && q.c < 4 && q.t), name + ": every question has 4 options, a valid answer, and a topic");
}
NODE
)
while IFS= read -r line; do
  case "$line" in
    PASS*) ok "${line#PASS }" ;;
    FAIL*) bad "${line#FAIL }" ;;
  esac
done <<< "$OUT"

echo "== Version $VERSION (code $CODE) =="
grep -q "v$VERSION" $IDX && ok "app shows v$VERSION" || bad "app does not show v$VERSION"
grep -q "$VERSION" README.md && ok "README mentions $VERSION" || bad "README missing $VERSION"
grep -q "\[$VERSION\]" CHANGELOG.md && ok "CHANGELOG has $VERSION" || bad "CHANGELOG missing $VERSION"
[ -f "release-notes/v$VERSION.md" ] && ok "release-notes/v$VERSION.md present" || bad "release-notes/v$VERSION.md missing"

echo "== Build config =="
grep -q 'applicationId "com.wgra.teenhealthshowdown"' $GR && ok "appId com.wgra.teenhealthshowdown" || bad "appId wrong"
grep -q 'debuggable false' $GR && ok "release debuggable false" || bad "release not debuggable false"
grep -q 'android.permission' app/src/main/AndroidManifest.xml && bad "manifest requests a permission" || ok "manifest requests no permissions"

echo "== Logo, icon, splash =="
for f in drawable-xxxhdpi/ic_fg.png mipmap-xxxhdpi/ic_launcher.png mipmap-xxxhdpi/ic_launcher_round.png \
         drawable-nodpi/splash_icon.jpg drawable-nodpi/splash_logo.jpg drawable/splash_window.xml; do
  [ -f "$RES/$f" ] && ok "$f present" || bad "$f missing"
done
grep -q 'windowSplashScreenAnimatedIcon' $RES/values-v31/styles.xml && ok "Android 12+ splash uses the logo" || bad "Android 12+ splash not set"
grep -q '#000000' $RES/values/colors.xml && ok "icon/splash background is black" || bad "icon/splash background not black"
[ -f app/src/main/assets/www/logo.jpg ] && ok "in-app logo present" || bad "in-app logo missing"

echo "== App privacy =="
grep -qi 'Content-Security-Policy' $IDX && ok "CSP present" || bad "CSP missing"
grep -Eqi 'href="(https?:)?//|href="/|src="https?://|@import' $IDX && bad "external link or resource in app" || ok "no external links or resources"
grep -Eqi 'gofundme\.com|facebook\.com|instagram\.com|tiktok\.com|youtube\.com|linkedin\.com' $IDX && bad "donation/social link in app" || ok "no donation or social links"
grep -Eqi 'google-analytics|googletagmanager|gtag\(|firebase|admob' $IDX && bad "analytics/ads reference" || ok "no analytics or ads"
grep -Eq 'localStorage|sessionStorage|indexedDB|document\.cookie' $IDX && bad "app stores data on device" || ok "no on-device storage"

if [ "${1:-}" != "" ] && [ -f "${1:-}" ]; then
  APK="$1"
  echo "== APK: $APK =="
  SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
  BT=$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)
  if [ -x "$BT/aapt2" ]; then
    DUMP=$("$BT/aapt2" dump badging "$APK" 2>/dev/null)
    echo "$DUMP" | grep -q "versionName='$VERSION'" && ok "APK versionName $VERSION" || bad "APK versionName wrong"
    echo "$DUMP" | grep -q "versionCode='$CODE'" && ok "APK versionCode $CODE" || bad "APK versionCode wrong"
    echo "$DUMP" | grep -q "package: name='com.wgra.teenhealthshowdown'" && ok "APK package id" || bad "APK package id wrong"
    echo "$DUMP" | grep -q "uses-permission:" && bad "APK declares a permission" || ok "APK declares no permissions"
  else
    bad "aapt2 not found"
  fi
  if [ -x "$BT/apksigner" ]; then
    CERT=$("$BT/apksigner" verify --print-certs "$APK" 2>/dev/null)
    echo "$CERT" | grep -qi "CN=Android Debug" && bad "APK signed with debug cert" || ok "APK not signed with debug cert"
    "$BT/apksigner" verify "$APK" >/dev/null 2>&1 && ok "APK signature verifies" || bad "APK signature invalid/unsigned"
  else
    bad "apksigner not found"
  fi
else
  echo "== APK checks skipped (no APK path given) =="
fi

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
