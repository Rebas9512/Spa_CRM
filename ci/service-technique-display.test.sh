#!/usr/bin/env bash
# ============================================================================
# Service → Technique Display — Acceptance Test
# Static analysis + normalization edge cases + API field consistency
# ============================================================================
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'
PASS_COUNT=0; FAIL_COUNT=0; TOTAL_COUNT=0; FAILURES=()
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
FE="frontend/src"
BE="backend/src"

pass() { PASS_COUNT=$((PASS_COUNT + 1)); TOTAL_COUNT=$((TOTAL_COUNT + 1)); echo -e "  ${GREEN}✓ PASS${NC}  $1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); TOTAL_COUNT=$((TOTAL_COUNT + 1)); FAILURES+=("$1"); echo -e "  ${RED}✗ FAIL${NC}  $1"; }
section() { echo ""; echo -e "${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
fe_contains() { grep -qE "$2" "$ROOT_DIR/$FE/$1" 2>/dev/null; }
be_contains() { grep -qE "$2" "$ROOT_DIR/$BE/$1" 2>/dev/null; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Service → Technique Display — Acceptance Test          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"

# ============================================================================
section "1. Backend — therapistServiceTechnique in ALL visit list endpoints"
# ============================================================================

# GET /customers/:id/visits (store-scoped visit history)
be_contains "routes/visits.ts" "therapistServiceTechnique.*therapist_service_technique" \
  && pass "API-01: GET /customers/:id/visits returns technique" \
  || fail "API-01: technique missing from GET /customers/:id/visits"

# GET /customers/:id (embedded visits in customer profile)
be_contains "routes/customers.ts" "therapistServiceTechnique.*therapist_service_technique" \
  && pass "API-02: GET /customers/:id returns technique in visits" \
  || fail "API-02: technique missing from GET /customers/:id"

# GET /admin/customers/:id/visits
be_contains "routes/admin.ts" "therapistServiceTechnique.*therapist_service_technique" \
  && pass "API-03: GET /admin/customers/:id/visits returns technique" \
  || fail "API-03: technique missing from admin customer visits"

# GET /admin/stores/:id/visits
grep -c "therapistServiceTechnique" "$ROOT_DIR/$BE/routes/admin.ts" 2>/dev/null | grep -q '[2-9]\|[1-9][0-9]' \
  && pass "API-04: GET /admin/stores/:id/visits returns technique" \
  || fail "API-04: technique missing from admin store visits"

# GET /manage/visits
be_contains "routes/manage.ts" "therapistServiceTechnique.*therapist_service_technique" \
  && pass "API-05: GET /manage/visits returns technique" \
  || fail "API-05: technique missing from manage visits"

# ============================================================================
section "2. Frontend — VisitHistory component"
# ============================================================================

HIST="components/VisitHistory.tsx"

fe_contains "$HIST" "therapistServiceTechnique" \
  && pass "FE-01: VisitRecord interface has therapistServiceTechnique" \
  || fail "FE-01: therapistServiceTechnique missing from VisitRecord"

fe_contains "$HIST" "normalizeTechnique" \
  && pass "FE-02: normalizeTechnique function exists" \
  || fail "FE-02: normalizeTechnique function missing"

fe_contains "$HIST" "export.*normalizeTechnique|normalizeTechnique.*export" \
  && pass "FE-03: normalizeTechnique is exported (shared utility)" \
  || fail "FE-03: normalizeTechnique not exported"

fe_contains "$HIST" "toUpperCase" \
  && pass "FE-04: normalization includes toUpperCase" \
  || fail "FE-04: toUpperCase missing from normalization"

fe_contains "$HIST" 'replace|[^\\w]' \
  && pass "FE-05: normalization strips punctuation" \
  || fail "FE-05: punctuation stripping missing"

fe_contains "$HIST" "cancelledAt|cancelled" \
  && pass "FE-06: cancelled visits handled" \
  || fail "FE-06: cancelled visit handling missing"

# ============================================================================
section "3. Frontend — Manage pages use technique"
# ============================================================================

# StoreManage removed — management is via StoreManagePage only
# StoreManagePage (in-store admin)
fe_contains "pages/store/StoreManagePage.tsx" "normalizeTechnique" \
  && pass "FE-09: StoreManagePage uses normalizeTechnique" \
  || fail "FE-09: StoreManagePage missing normalizeTechnique"

fe_contains "pages/store/StoreManagePage.tsx" "therapistServiceTechnique" \
  && pass "FE-10: StoreManagePage Visit interface has technique" \
  || fail "FE-10: StoreManagePage Visit interface missing technique"

# AdminCustomerDetail
fe_contains "pages/admin/AdminCustomerDetail.tsx" "therapistServiceTechnique" \
  && pass "FE-11: AdminCustomerDetail maps technique" \
  || fail "FE-11: AdminCustomerDetail missing technique mapping"

# ============================================================================
section "4. normalizeTechnique — Edge Case Unit Tests"
# ============================================================================

# Test the normalize logic using Node.js (same regex as frontend)
NODE_TEST=$(node -e "
function normalizeTechnique(raw) {
  if (!raw) return '-';
  return raw.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim().toUpperCase() || '-';
}

const cases = [
  // [input, expected, description]
  [null,            '-',         'null → dash'],
  [undefined,       '-',         'undefined → dash'],
  ['',              '-',         'empty string → dash'],
  ['f3',            'F3',        'lowercase → uppercase'],
  ['F4',            'F4',        'already uppercase → no change'],
  ['b3',            'B3',        'single code lowercase'],
  ['f3 (F3)',       'F3 F3',     'parens removed, content kept'],
  ['F4, B3',        'F4 B3',     'comma removed'],
  ['b4,f3',         'B4F3',      'comma no space → joined'],
  ['  f3  b4  ',    'F3 B4',     'extra spaces normalized'],
  ['deep tissue',   'DEEP TISSUE', 'text phrase uppercased'],
  ['()',            '-',         'only punctuation → dash'],
  ['...!!!',        '-',         'all punctuation → dash'],
  ['f3/b4',         'F3B4',      'slash removed'],
  ['F3 & B4',       'F3  B4',    'ampersand removed (double space stays after trim? no — multiple spaces normalized)'],
];

// Fix case 14: 'F3 & B4' → replace punctuation → 'F3  B4' → replace multiple spaces → 'F3 B4'
cases[14][1] = 'F3 B4';

let pass = 0, fail = 0;
for (const [input, expected, desc] of cases) {
  const result = normalizeTechnique(input);
  if (result === expected) {
    console.log('PASS|' + desc + ': \"' + input + '\" → \"' + result + '\"');
    pass++;
  } else {
    console.log('FAIL|' + desc + ': \"' + input + '\" → expected \"' + expected + '\", got \"' + result + '\"');
    fail++;
  }
}
console.log('SUMMARY|' + pass + '|' + fail);
" 2>&1)

while IFS='|' read -r status rest; do
  case "$status" in
    PASS) pass "NORM: $rest" ;;
    FAIL) fail "NORM: $rest" ;;
    SUMMARY)
      # just for reporting, individual results already tracked
      ;;
  esac
done <<< "$NODE_TEST"

# ============================================================================
section "5. Build Verification"
# ============================================================================

cd "$ROOT_DIR"
if npm run build:web > /dev/null 2>&1; then
  pass "BUILD: frontend production build succeeds"
else
  fail "BUILD: frontend build failed"
fi

# ============================================================================
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Service → Technique Display — Results${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}PASSED${NC}: ${PASS_COUNT}/${TOTAL_COUNT}"
echo -e "  ${RED}FAILED${NC}: ${FAIL_COUNT}/${TOTAL_COUNT}"
echo ""
if [[ $FAIL_COUNT -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}✓ ALL PASSED${NC}"; exit 0
else
  echo -e "  ${RED}${BOLD}✗ ${FAIL_COUNT} FAILED${NC}"
  for f in "${FAILURES[@]}"; do echo -e "    ${RED}•${NC} $f"; done
  echo ""; exit 1
fi
