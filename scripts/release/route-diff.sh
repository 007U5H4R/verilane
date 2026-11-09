#!/usr/bin/env bash
# TASK-79.9 (TKT-75.09) · TC-75.50 / DoD 5: TASK-75 may add /exceptions,
# /exceptions/[id] and change Home; every other v1 route, redirect and
# data-testid must be unchanged.
#
# Usage: scripts/release/route-diff.sh [BASELINE] [HEAD]
#   BASELINE defaults to 516e2ee — merge-base of main and the TASK-75
#   integration line, the last main commit before any TASK-75 code (src/ is
#   identical to main@fb38fcb). HEAD defaults to HEAD.
# Exit 0 = clean, 1 = a forbidden change, 2 = usage error.
set -euo pipefail

BASE="${1:-516e2ee}"
TIP="${2:-HEAD}"
git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null || { echo "unknown baseline: $BASE" >&2; exit 2; }
git rev-parse --verify --quiet "$TIP^{commit}" >/dev/null || { echo "unknown head: $TIP" >&2; exit 2; }

# Paths TASK-75 is allowed to change: the two new routes and Home.
ALLOWED='^src/app/exceptions/|^src/app/page\.tsx$'
fail=0

echo "route-diff: $(git rev-parse --short "$BASE")..$(git rev-parse --short "$TIP")"
echo

echo "== 1. src/app/ files changed outside /exceptions, /exceptions/[id] and Home"
outside="$(git diff --name-status "$BASE..$TIP" -- src/app/ | awk -F'\t' -v re="$ALLOWED" '{ p = $NF; if (p !~ re) print }')"
if [ -n "$outside" ]; then echo "$outside"; else echo "(none)"; fi
echo

echo "== 2. Route files added, deleted or renamed outside the allowed paths"
routes="$(printf '%s\n' "$outside" | awk -F'\t' '$1 !~ /^M/ && $NF ~ /\/(page|route|layout|default|not-found|loading|error)\.(tsx?|jsx?)$/')"
if [ -n "$routes" ]; then echo "$routes"; fail=1; else echo "(none)"; fi
echo

echo "== 3. Redirect / rewrite changes (src/app outside allowed paths, next.config, middleware/proxy)"
redirect_paths=(src/app/ next.config.ts next.config.mjs next.config.js src/middleware.ts src/proxy.ts middleware.ts proxy.ts)
existing=()
for p in "${redirect_paths[@]}"; do
  if git cat-file -e "$BASE:$p" 2>/dev/null || git cat-file -e "$TIP:$p" 2>/dev/null; then existing+=("$p"); fi
done
redirects="$(git diff -U0 "$BASE..$TIP" -- "${existing[@]}" \
  | awk -v re="$ALLOWED" '/^\+\+\+ b\// { f = substr($0, 7); next } /^--- / { next } /^[+-]/ { if (f !~ re) print f ": " $0 }' \
  | grep -E 'redirect\(|permanentRedirect\(|redirects|rewrites|NextResponse\.(redirect|rewrite)' || true)"
if [ -n "$redirects" ]; then echo "$redirects"; fail=1; else echo "(none)"; fi
echo

echo "== 4. data-testid changes in src/app outside the allowed paths"
appids="$(git diff -U0 "$BASE..$TIP" -- src/app/ \
  | awk -v re="$ALLOWED" '/^\+\+\+ b\// { f = substr($0, 7); next } /^--- / { next } /^[+-]/ { if (f !~ re) print f ": " $0 }' \
  | grep -E 'data-testid|getByTestId|testId' || true)"
if [ -n "$appids" ]; then echo "$appids"; fail=1; else echo "(none)"; fi
echo

# Test IDs live mostly in src/components, so src/app alone under-reports.
# Any literal data-testid present at BASE but gone at TIP (anywhere in src/)
# would break a v1 spec; new IDs are fine.
echo "== 5. data-testid literals removed anywhere in src/ (BASE has it, TIP does not)"
ids_at() { git grep -h -o -E 'data-testid="[^"]+"' "$1" -- src/ | sort -u; }
removed="$(comm -23 <(ids_at "$BASE") <(ids_at "$TIP"))"
if [ -n "$removed" ]; then echo "$removed"; fail=1; else echo "(none)"; fi
added="$(comm -13 <(ids_at "$BASE") <(ids_at "$TIP") | wc -l | tr -d ' ')"
echo "(info: $added new data-testid literals added)"
echo

if [ "$fail" -eq 0 ]; then echo "RESULT: CLEAN"; else echo "RESULT: FORBIDDEN CHANGES FOUND"; fi
exit "$fail"
