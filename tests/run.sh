#!/usr/bin/env bash
# Alle tests. tests/run.sh [snel|alles]
#   snel  (standaard, ~1,5 min): syntaxcheck, same, workers, rooktest kort
#   alles (~6 min, vóór release): syntaxcheck, same, workers, rooktest volledig, turbo
cd "$(dirname "$0")/.." || exit 1
mode="${1:-snel}"
fail=0
run() { echo "== $*"; "$@" || { fail=$((fail + 1)); echo "!! mislukt: $*"; }; }

echo "== syntaxcheck"
for f in $(find src -name '*.js' | sort); do node --check "$f" || { fail=$((fail + 1)); echo "!! syntaxfout: $f"; }; done

run node tests/same.js
run node tests/workers.js
if [ "$mode" = "alles" ]; then
  run node tests/smoke.js
  run node tests/turbo.js
else
  run node tests/smoke.js --quick
fi

if [ "$fail" -eq 0 ]; then echo "== ALLES OK"; else echo "== $fail ONDERDEEL/ONDERDELEN MISLUKT"; fi
exit "$fail"
