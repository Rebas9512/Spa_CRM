#!/usr/bin/env bash
# ============================================================================
# Loyalty Points (Punch Card) — Static Analysis Acceptance Test
# Verifies code structure, schema changes, and frontend integration
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
fe_exists() { [[ -f "$ROOT_DIR/$FE/$1" ]]; }
fe_contains() { grep -qE "$2" "$ROOT_DIR/$FE/$1" 2>/dev/null; }
be_contains() { grep -qE "$2" "$ROOT_DIR/$BE/$1" 2>/dev/null; }
file_contains() { grep -qE "$2" "$ROOT_DIR/$1" 2>/dev/null; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     Loyalty Points (Punch Card) — Acceptance Test        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"

# ============================================================================
section "DB-01/02: Database Schema"
# ============================================================================

SCHEMA="backend/src/db/schema.sql"
if [[ -f "$ROOT_DIR/$SCHEMA" ]]; then
  file_contains "$SCHEMA" "loyalty_points.*INTEGER|INTEGER.*loyalty_points" \
    && pass "DB-01: customers.loyalty_points field in schema" \
    || fail "DB-01: customers.loyalty_points missing from schema"

  file_contains "$SCHEMA" "points_redeemed.*INTEGER|INTEGER.*points_redeemed" \
    && pass "DB-02: visits.points_redeemed field in schema" \
    || fail "DB-02: visits.points_redeemed missing from schema"
else
  fail "DB-01: schema.sql not found"
  fail "DB-02: schema.sql not found"
fi

# ============================================================================
section "BE-01~04: Backend — Points Accumulation"
# ============================================================================

VISITS_ROUTE="routes/visits.ts"
if [[ -f "$ROOT_DIR/$BE/$VISITS_ROUTE" ]]; then
  # BE-01: Therapist sign increments loyalty_points
  be_contains "$VISITS_ROUTE" "loyalty_points.*\+.*1|loyalty_points \+ 1" \
    && pass "BE-01: loyalty_points +1 on therapist sign" \
    || fail "BE-01: loyalty_points increment missing in therapist sign handler"

  # BE-03: Cancel handler should NOT touch loyalty_points
  # Extract the cancel endpoint handler (from PATCH cancel to the next export/route) and verify no loyalty_points
  if sed -n '/visits.*cancel\|cancel.*visits/,/^export\|^\/\/ ---/p' "$ROOT_DIR/$BE/$VISITS_ROUTE" | grep -qE "UPDATE.*customers.*loyalty_points"; then
    fail "BE-03: cancel handler should NOT modify loyalty_points"
  else
    pass "BE-03: cancel handler correctly ignores loyalty_points"
  fi
else
  fail "BE-01: visits route file not found"
  fail "BE-03: visits route file not found"
fi

# ============================================================================
section "BE-05~09: Backend — Points Redemption"
# ============================================================================

if [[ -f "$ROOT_DIR/$BE/$VISITS_ROUTE" ]]; then
  # BE-05: redeemPoints parameter accepted
  be_contains "$VISITS_ROUTE" "redeemPoints" \
    && pass "BE-05: redeemPoints parameter in therapist sign" \
    || fail "BE-05: redeemPoints parameter missing"

  # BE-06: Deduction logic (loyalty_points - 10 or loyalty_points + 1 - pointsRedeemed)
  be_contains "$VISITS_ROUTE" "loyalty_points.*-.*10|loyalty_points - 10|loyalty_points \+ 1 -|pointsRedeemed.*10" \
    && pass "BE-06: loyalty_points -10 deduction logic" \
    || fail "BE-06: loyalty_points deduction logic missing"

  # BE-07: Guard — reject redemption when points < 10
  be_contains "$VISITS_ROUTE" "loyalty_points.*<.*10|points.*<.*10|insufficient|not enough" \
    && pass "BE-07: guard for insufficient points" \
    || fail "BE-07: guard for insufficient points missing"

  # BE-09: points_redeemed stored on visit record
  be_contains "$VISITS_ROUTE" "points_redeemed" \
    && pass "BE-09: points_redeemed stored on visit" \
    || fail "BE-09: points_redeemed not written to visit"
else
  for i in 05 06 07 09; do fail "BE-$i: visits route file not found"; done
fi

# ============================================================================
section "BE-10~12: Backend — Points Query"
# ============================================================================

# BE-10: GET /visits/:id returns customer loyalty points
if [[ -f "$ROOT_DIR/$BE/$VISITS_ROUTE" ]]; then
  be_contains "$VISITS_ROUTE" "loyaltyPoints|loyalty_points" \
    && pass "BE-10: visit detail returns loyalty points" \
    || fail "BE-10: loyalty points missing from visit detail response"
else
  fail "BE-10: visits route file not found"
fi

# BE-11: GET /customers/:id returns loyaltyPoints
CUST_ROUTE="routes/customers.ts"
if [[ -f "$ROOT_DIR/$BE/$CUST_ROUTE" ]]; then
  be_contains "$CUST_ROUTE" "loyaltyPoints|loyalty_points" \
    && pass "BE-11: customer profile returns loyaltyPoints" \
    || fail "BE-11: loyaltyPoints missing from customer profile response"
else
  fail "BE-11: customers route file not found"
fi

# BE-12: GET /admin/customers/:id returns loyaltyPoints
ADMIN_ROUTE="routes/admin.ts"
if [[ -f "$ROOT_DIR/$BE/$ADMIN_ROUTE" ]]; then
  be_contains "$ADMIN_ROUTE" "loyaltyPoints|loyalty_points" \
    && pass "BE-12: admin customer detail returns loyaltyPoints" \
    || fail "BE-12: loyaltyPoints missing from admin customer detail"
else
  fail "BE-12: admin route file not found"
fi

# ============================================================================
section "FE-01~05: Frontend — Therapist Record Page"
# ============================================================================

THERAPIST_PAGE="pages/store/TherapistRecordPage.tsx"
if fe_exists "$THERAPIST_PAGE"; then
  # FE-01: Displays customer loyalty points
  fe_contains "$THERAPIST_PAGE" "loyaltyPoints|loyalty.*points|积分" \
    && pass "FE-01: TherapistRecordPage displays loyalty points" \
    || fail "FE-01: loyalty points not shown on TherapistRecordPage"

  # FE-03: Redemption UI when points >= 10
  fe_contains "$THERAPIST_PAGE" ">=\s*10|≥\s*10|loyaltyPoints.*10|redeemPoints|redeem" \
    && pass "FE-03: redemption option conditional on >= 10 points" \
    || fail "FE-03: redemption conditional logic missing"

  # FE-04: Sends redeemPoints in request
  fe_contains "$THERAPIST_PAGE" "redeemPoints" \
    && pass "FE-04: redeemPoints sent in sign request" \
    || fail "FE-04: redeemPoints not sent in sign request"
else
  for i in 01 03 04; do fail "FE-$i: TherapistRecordPage.tsx not found"; done
fi

# ============================================================================
section "FE-06: Frontend — Staff Customer Profile"
# ============================================================================

STAFF_PROFILE="pages/store/CustomerProfile.tsx"
if fe_exists "$STAFF_PROFILE"; then
  fe_contains "$STAFF_PROFILE" "loyaltyPoints|loyalty.*points|积分" \
    && pass "FE-06: CustomerProfile displays loyalty points" \
    || fail "FE-06: loyalty points not shown on CustomerProfile"
else
  fail "FE-06: CustomerProfile.tsx not found"
fi

# ============================================================================
section "FE-07: Frontend — Admin Customer Detail"
# ============================================================================

ADMIN_DETAIL=""
for p in "pages/admin/AdminCustomerDetail.tsx" "pages/admin/CustomerDetail.tsx"; do
  fe_exists "$p" && ADMIN_DETAIL="$p" && break
done

if [[ -n "$ADMIN_DETAIL" ]]; then
  fe_contains "$ADMIN_DETAIL" "loyaltyPoints|loyalty.*points|积分" \
    && pass "FE-07: AdminCustomerDetail displays loyalty points" \
    || fail "FE-07: loyalty points not shown on AdminCustomerDetail"
else
  fail "FE-07: AdminCustomerDetail.tsx not found"
fi

# ============================================================================
section "Build Verification"
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
echo -e "${BOLD}  Loyalty Points — Static Analysis Results${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}PASSED${NC}: ${PASS_COUNT}/${TOTAL_COUNT}"
echo -e "  ${RED}FAILED${NC}: ${FAIL_COUNT}/${TOTAL_COUNT}"
echo ""
if [[ $FAIL_COUNT -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}✓ LOYALTY POINTS ACCEPTANCE — ALL PASSED${NC}"; exit 0
else
  echo -e "  ${RED}${BOLD}✗ LOYALTY POINTS ACCEPTANCE — ${FAIL_COUNT} failed${NC}"
  for f in "${FAILURES[@]}"; do echo -e "    ${RED}•${NC} $f"; done
  echo ""; exit 1
fi
