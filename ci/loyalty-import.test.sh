#!/usr/bin/env bash
# ============================================================================
# Loyalty Points Import — Static Analysis Acceptance Test
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
file_contains() { grep -qE "$2" "$ROOT_DIR/$1" 2>/dev/null; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      Loyalty Points Import — Acceptance Test             ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"

# ============================================================================
section "DB-01: Schema"
# ============================================================================
file_contains "backend/src/db/schema.sql" "loyalty_imported_at" \
  && pass "DB-01: customers.loyalty_imported_at field in schema" \
  || fail "DB-01: loyalty_imported_at missing from schema"

# ============================================================================
section "BE-01~07: Staff Import Endpoint"
# ============================================================================
CUST_ROUTE="routes/customers.ts"

be_contains "$CUST_ROUTE" "import-points|import.*points" \
  && pass "BE-01: import-points endpoint exists" \
  || fail "BE-01: import-points endpoint missing"

be_contains "$CUST_ROUTE" "points.*min.*1|points.*positive|z\.number.*int.*min" \
  && pass "BE-02: points validation (positive integer)" \
  || fail "BE-02: points validation missing"

be_contains "$CUST_ROUTE" "loyalty_points.*\+|loyalty_points \+" \
  && pass "BE-03: loyalty_points increment on import" \
  || fail "BE-03: loyalty_points increment missing"

be_contains "$CUST_ROUTE" "loyalty_imported_at" \
  && pass "BE-04: loyalty_imported_at set on import" \
  || fail "BE-04: loyalty_imported_at not set"

be_contains "$CUST_ROUTE" "already.*import|已导入|imported_at.*!= null|imported_at IS NOT NULL" \
  && pass "BE-05: duplicate import guard" \
  || fail "BE-05: duplicate import guard missing"

# ============================================================================
section "BE-08~14: Admin Modify Endpoint"
# ============================================================================
ADMIN_ROUTE="routes/admin.ts"

be_contains "$ADMIN_ROUTE" "loyalty-points|loyalty.*points.*PATCH|loyaltyPoints.*pin" \
  && pass "BE-08: admin loyalty-points endpoint exists" \
  || fail "BE-08: admin loyalty-points endpoint missing"

be_contains "$ADMIN_ROUTE" "pin.*string|pin.*z\.string" \
  && pass "BE-12: PIN required in schema" \
  || fail "BE-12: PIN requirement missing"

be_contains "$ADMIN_ROUTE" "verifyHash.*pin|pin.*verify|admin_pin_hash" \
  && pass "BE-10: PIN verification logic" \
  || fail "BE-10: PIN verification missing"

be_contains "$ADMIN_ROUTE" "loyalty_points.*=.*\?" \
  && pass "BE-13: loyalty_points direct set (not increment)" \
  || fail "BE-13: loyalty_points set logic missing"

# ============================================================================
section "BE-15~16: Query Endpoints Return loyaltyImportedAt"
# ============================================================================
be_contains "$CUST_ROUTE" "loyaltyImportedAt|loyalty_imported_at" \
  && pass "BE-15: GET /customers/:id returns loyaltyImportedAt" \
  || fail "BE-15: loyaltyImportedAt missing from customer profile"

be_contains "$ADMIN_ROUTE" "loyaltyImportedAt|loyalty_imported_at" \
  && pass "BE-16: GET /admin/customers/:id returns loyaltyImportedAt" \
  || fail "BE-16: loyaltyImportedAt missing from admin customer detail"

# ============================================================================
section "FE-01~05: Staff Side (CustomerProfile)"
# ============================================================================
STAFF_PROFILE="pages/store/CustomerProfile.tsx"

fe_contains "$STAFF_PROFILE" "import.*points|import-points|importPoints|导入积分" \
  && pass "FE-01: import points UI in CustomerProfile" \
  || fail "FE-01: import points UI missing"

fe_contains "$STAFF_PROFILE" "loyaltyImportedAt|imported" \
  && pass "FE-04: checks loyaltyImportedAt to hide import after first use" \
  || fail "FE-04: loyaltyImportedAt check missing"

fe_contains "$STAFF_PROFILE" "import-points" \
  && pass "FE-05: calls POST /import-points endpoint" \
  || fail "FE-05: import-points API call missing"

# ============================================================================
section "FE-06~10: Admin Side (AdminCustomerDetail)"
# ============================================================================
ADMIN_DETAIL=""
for p in "pages/admin/AdminCustomerDetail.tsx" "pages/admin/CustomerDetail.tsx"; do
  [[ -f "$ROOT_DIR/$FE/$p" ]] && ADMIN_DETAIL="$p" && break
done

if [[ -n "$ADMIN_DETAIL" ]]; then
  fe_contains "$ADMIN_DETAIL" "loyalty-points|loyaltyPoints.*pin|修改积分" \
    && pass "FE-06: modify points UI in AdminCustomerDetail" \
    || fail "FE-06: modify points UI missing"

  fe_contains "$ADMIN_DETAIL" "pin|PIN" \
    && pass "FE-07: PIN input in admin points modification" \
    || fail "FE-07: PIN input missing"

  fe_contains "$ADMIN_DETAIL" "loyalty-points" \
    && pass "FE-10: calls PATCH /admin/customers/:id/loyalty-points" \
    || fail "FE-10: admin loyalty-points API call missing"
else
  fail "FE-06: AdminCustomerDetail not found"
  fail "FE-07: AdminCustomerDetail not found"
  fail "FE-10: AdminCustomerDetail not found"
fi

# ============================================================================
section "Build Verification"
# ============================================================================
if npm run build:web > /dev/null 2>&1; then
  pass "BUILD: frontend production build succeeds"
else
  fail "BUILD: frontend build failed"
fi

# ============================================================================
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Loyalty Points Import — Static Analysis Results${NC}"
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
