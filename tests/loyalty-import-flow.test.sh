#!/usr/bin/env bash
# ============================================================================
# Loyalty Points Import — API Integration Test
# Requires: local dev server running at http://localhost:8787
# ============================================================================
set -euo pipefail

BASE="http://localhost:8787"
PASS=0; FAIL=0; TOTAL=0

run() {
  local name="$1"; shift
  TOTAL=$((TOTAL + 1))
  if eval "$@" > /dev/null 2>&1; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
body()   { curl -s "$@"; }
jq_val() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)" 2>/dev/null; }

echo ""
echo "═══════════════════════════════════════════"
echo " Loyalty Points Import — Integration Test"
echo "═══════════════════════════════════════════"

# ── 1. Setup ──
echo ""
echo "1. Setup: Admin, Store, Session"

# Login with test account
LOGIN_RESP=$(body -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"loyalty-test@test.com","password":"TestPass123"}')
ADMIN_TOKEN=$(echo "$LOGIN_RESP" | jq_val ".get('token','')" || echo "")

if [ -z "$ADMIN_TOKEN" ]; then
  # Register if not exists
  REG_RESP=$(body -X POST "$BASE/api/auth/register" \
    -H 'Content-Type: application/json' \
    -d '{"email":"loyalty-test@test.com","password":"TestPass123","name":"Loyalty Tester","inviteCode":"CLIFSPA2026"}')
  ADMIN_TOKEN=$(echo "$REG_RESP" | jq_val ".get('token','')" || echo "")
  # Login again
  LOGIN_RESP=$(body -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"loyalty-test@test.com","password":"TestPass123"}')
  ADMIN_TOKEN=$(echo "$LOGIN_RESP" | jq_val ".get('token','')" || echo "")
fi
AUTH="Authorization: Bearer $ADMIN_TOKEN"
run "Admin authenticated" "[ -n '$ADMIN_TOKEN' ]"

# Create store with known admin PIN
STORE_RESP=$(body -X POST "$BASE/api/admin/stores" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Import Test Store","address":"999 Import St","staffPin":"1111","adminPin":"9999"}')
STORE_ID=$(echo "$STORE_RESP" | jq_val ".get('storeId','')" || echo "")
run "Create store" "[ -n '$STORE_ID' ]"

# Open store session (staff)
OPEN_RESP=$(body -X POST "$BASE/api/auth/store-pin" \
  -H 'Content-Type: application/json' \
  -d "{\"storeId\":\"$STORE_ID\",\"pin\":\"1111\"}")
STORE_TOKEN=$(echo "$OPEN_RESP" | jq_val ".get('token','')" || echo "")
SAUTH="Authorization: Bearer $STORE_TOKEN"
run "Open store session" "[ -n '$STORE_TOKEN' ]"

# Create test customer (unique phone per run to avoid residual state)
UNIQUE_PHONE="555$(date +%s | tail -c 8)"
CUST_RESP=$(body -X POST "$BASE/api/customers" \
  -H 'Content-Type: application/json' -H "$SAUTH" \
  -d '{
    "firstName":"Import","lastName":"Tester","phone":"'"$UNIQUE_PHONE"'",
    "dateOfBirth":"1990-01-01","gender":"female",
    "intakeFormData":{
      "hasSpinalProblems":false,"hasAllergies":false,"hasHighBloodPressure":false,
      "hasBruiseEasily":false,"hasVaricoseVeins":false,"hasMigraines":false,
      "hasHeartConditions":false,"hasInjuries":false,"isPregnant":false,
      "pregnancyDueDate":null,"medicalNotes":"","preferredMassageType":"swedish_relaxation",
      "areasOfPainTension":"","areasToAvoid":"","isMinor":false,
      "guardianName":null,"guardianSignatureDataUrl":null,
      "consentAcknowledged":true,"clientSignatureDataUrl":"data:image/png;base64,test"
    },
    "firstVisit":{"serviceType":"swedish_relaxation","therapistName":"Wei"}
  }')
CUST_ID=$(echo "$CUST_RESP" | jq_val ".get('customerId','')" || echo "")
run "Create test customer" "[ -n '$CUST_ID' ]"

# Verify initial points = 0
PROFILE=$(body -H "$SAUTH" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "Initial loyalty_points = 0" "[ '$POINTS' = '0' ]"

# ── 2. Staff Import — Validation ──
echo ""
echo "2. BE-02/EDGE-01/02: Import Validation"

run "BE-02: import 0 points → 400" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{\"points\":0}' $BASE/api/customers/$CUST_ID/import-points) = 400 ]"

run "BE-02: import negative → 400" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{\"points\":-5}' $BASE/api/customers/$CUST_ID/import-points) = 400 ]"

run "EDGE-02: import decimal → 400" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{\"points\":3.5}' $BASE/api/customers/$CUST_ID/import-points) = 400 ]"

run "BE-02: import missing points → 400" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{}' $BASE/api/customers/$CUST_ID/import-points) = 400 ]"

# ── 3. Staff Import — First Import ──
echo ""
echo "3. BE-03/04/06: First Import"

IMPORT_RESP=$(body -X POST "$BASE/api/customers/$CUST_ID/import-points" \
  -H 'Content-Type: application/json' -H "$SAUTH" \
  -d '{"points":8}')
IMPORT_STATUS=$(echo "$IMPORT_RESP" | jq_val "['loyaltyPoints']" || echo "fail")
run "BE-03: import 8 points → loyaltyPoints = 8" "[ '$IMPORT_STATUS' = '8' ]"

IMPORT_AT=$(echo "$IMPORT_RESP" | jq_val ".get('loyaltyImportedAt','')" || echo "")
run "BE-04: loyaltyImportedAt is set" "[ -n '$IMPORT_AT' ] && [ '$IMPORT_AT' != 'None' ]"

# Verify via profile
PROFILE=$(body -H "$SAUTH" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-03: profile confirms loyaltyPoints = 8" "[ '$POINTS' = '8' ]"

IMPORTED_AT_PROFILE=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyImportedAt','')" || echo "")
run "BE-15: profile returns loyaltyImportedAt" "[ -n '$IMPORTED_AT_PROFILE' ] && [ '$IMPORTED_AT_PROFILE' != 'None' ]"

# ── 4. Staff Import — Duplicate Blocked ──
echo ""
echo "4. BE-05: Duplicate Import Blocked"

DUP_STATUS=$(status -X POST -H 'Content-Type: application/json' -H "$SAUTH" \
  -d '{"points":5}' "$BASE/api/customers/$CUST_ID/import-points")
run "BE-05: second import → 400" "[ $DUP_STATUS = 400 ]"

# Points unchanged
PROFILE=$(body -H "$SAUTH" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-05: points still 8 after failed duplicate" "[ '$POINTS' = '8' ]"

# ── 5. Staff Import — Non-existent Customer ──
echo ""
echo "5. BE-07: Non-existent Customer"

run "BE-07: import for fake customer → 404" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{\"points\":5}' $BASE/api/customers/nonexistent999/import-points) = 404 ]"

# ── 6. Admin Modify — Validation ──
echo ""
echo "6. BE-09/12: Admin Modify Validation"

run "BE-12: missing PIN → 400" \
  "[ \$(status -X PATCH -H 'Content-Type: application/json' -H '$AUTH' \
    -d '{\"loyaltyPoints\":10}' $BASE/api/admin/customers/$CUST_ID/loyalty-points) = 400 ]"

run "BE-09: negative points → 400" \
  "[ \$(status -X PATCH -H 'Content-Type: application/json' -H '$AUTH' \
    -d '{\"loyaltyPoints\":-1,\"pin\":\"9999\"}' $BASE/api/admin/customers/$CUST_ID/loyalty-points) = 400 ]"

# ── 7. Admin Modify — Wrong PIN ──
echo ""
echo "7. BE-11: Wrong PIN"

WRONG_PIN_STATUS=$(status -X PATCH -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"loyaltyPoints":20,"pin":"0000"}' "$BASE/api/admin/customers/$CUST_ID/loyalty-points")
run "BE-11: wrong PIN → 403" "[ $WRONG_PIN_STATUS = 403 ]"

# Points unchanged
PROFILE=$(body -H "$SAUTH" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-11: points still 8 after wrong PIN" "[ '$POINTS' = '8' ]"

# ── 8. Admin Modify — Correct PIN ──
echo ""
echo "8. BE-10/14: Admin Modify with Correct PIN"

MODIFY_RESP=$(body -X PATCH "$BASE/api/admin/customers/$CUST_ID/loyalty-points" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"loyaltyPoints":15,"pin":"9999"}')
MOD_POINTS=$(echo "$MODIFY_RESP" | jq_val "['loyaltyPoints']" || echo "fail")
run "BE-10: set points to 15 with correct PIN → 200" "[ '$MOD_POINTS' = '15' ]"

# Verify via profile
PROFILE=$(body -H "$SAUTH" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-14: profile confirms loyaltyPoints = 15" "[ '$POINTS' = '15' ]"

# ── 9. Admin Modify — Repeat Allowed ──
echo ""
echo "9. BE-13: Admin Can Modify Multiple Times"

MODIFY2_STATUS=$(status -X PATCH -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"loyaltyPoints":20,"pin":"9999"}' "$BASE/api/admin/customers/$CUST_ID/loyalty-points")
run "BE-13: second admin modify → 200" "[ $MODIFY2_STATUS = 200 ]"

PROFILE=$(body -H "$SAUTH" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-13: points now 20" "[ '$POINTS' = '20' ]"

# ── 10. EDGE-03/04: Admin Set to 0 and 100 ──
echo ""
echo "10. EDGE-03/04: Admin Edge Cases"

ZERO_STATUS=$(status -X PATCH -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"loyaltyPoints":0,"pin":"9999"}' "$BASE/api/admin/customers/$CUST_ID/loyalty-points")
run "EDGE-03: set points to 0 → 200" "[ $ZERO_STATUS = 200 ]"

PROFILE=$(body -H "$SAUTH" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "EDGE-03: points now 0" "[ '$POINTS' = '0' ]"

HUNDRED_STATUS=$(status -X PATCH -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"loyaltyPoints":100,"pin":"9999"}' "$BASE/api/admin/customers/$CUST_ID/loyalty-points")
run "EDGE-04: set points to 100 → 200" "[ $HUNDRED_STATUS = 200 ]"

# ── 11. EDGE-05: Import Doesn't Break Normal Flow ──
echo ""
echo "11. EDGE-05: Normal Flow After Import"

# Set points to 9 for testing
curl -s -X PATCH "$BASE/api/admin/customers/$CUST_ID/loyalty-points" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"loyaltyPoints":9,"pin":"9999"}' > /dev/null

# Sign the pending visit → should add 1 point
QUEUE=$(body -H "$SAUTH" "$BASE/api/stores/$STORE_ID/visits/pending-therapist")
VISIT_ID=$(echo "$QUEUE" | python3 -c "
import sys, json
vs = json.load(sys.stdin).get('visits', [])
print(vs[0]['id'] if vs else '')
" 2>/dev/null || echo "")

if [ -n "$VISIT_ID" ]; then
  SIGN_STATUS=$(status -X PATCH -H 'Content-Type: application/json' -H "$SAUTH" \
    -d '{"therapistName":"Wei","therapistServiceTechnique":"Deep tissue","therapistBodyPartsNotes":"Back"}' \
    "$BASE/api/visits/$VISIT_ID/therapist")
  run "EDGE-05: sign visit after import → 200" "[ $SIGN_STATUS = 200 ]"

  PROFILE=$(body -H "$SAUTH" "$BASE/api/customers/$CUST_ID")
  POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
  run "EDGE-05: points = 10 (9 + 1 from sign)" "[ '$POINTS' = '10' ]"
else
  run "EDGE-05: sign visit after import (no pending visit)" "false"
  run "EDGE-05: points check (skipped)" "false"
fi

# ── 12. EDGE-06: Cross-Store Visibility ──
echo ""
echo "12. EDGE-06: Cross-Store Visibility"

# Create second store
STORE_B_RESP=$(body -X POST "$BASE/api/admin/stores" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Import Store B","address":"888 B St","staffPin":"2222","adminPin":"8888"}')
STORE_B=$(echo "$STORE_B_RESP" | jq_val ".get('storeId','')" || echo "")

if [ -n "$STORE_B" ]; then
  OPEN_B=$(body -X POST "$BASE/api/auth/store-pin" \
    -H 'Content-Type: application/json' \
    -d "{\"storeId\":\"$STORE_B\",\"pin\":\"2222\"}")
  TOKEN_B=$(echo "$OPEN_B" | jq_val ".get('token','')" || echo "")
  SAUTH_B="Authorization: Bearer $TOKEN_B"

  # Create visit in store B for same customer
  curl -s -X POST "$BASE/api/customers/$CUST_ID/visits" \
    -H 'Content-Type: application/json' -H "$SAUTH_B" \
    -d '{"serviceType":"deep_tissue","therapistName":"Li"}' > /dev/null 2>&1

  # Check points from store B profile
  PROFILE_B=$(body -H "$SAUTH_B" "$BASE/api/customers/$CUST_ID")
  POINTS_B=$(echo "$PROFILE_B" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
  run "EDGE-06: Store B sees same points = 10" "[ '$POINTS_B' = '10' ]"

  IMPORTED_B=$(echo "$PROFILE_B" | jq_val ".get('customer',{}).get('loyaltyImportedAt','')" || echo "")
  run "EDGE-06: Store B sees loyaltyImportedAt" "[ -n '$IMPORTED_B' ] && [ '$IMPORTED_B' != 'None' ]"
else
  run "EDGE-06: Store B creation (skipped)" "false"
  run "EDGE-06: Store B visibility (skipped)" "false"
fi

# ── 13. BE-16: Admin Profile Returns loyaltyImportedAt ──
echo ""
echo "13. BE-16: Admin Profile"

ADMIN_PROFILE=$(body -H "$AUTH" "$BASE/api/admin/customers/$CUST_ID")
HAS_IMPORTED=$(echo "$ADMIN_PROFILE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
c = d.get('customer', d)
print('yes' if 'loyaltyImportedAt' in c else 'no')
" 2>/dev/null || echo "no")
run "BE-16: admin profile has loyaltyImportedAt" "[ '$HAS_IMPORTED' = 'yes' ]"

# ── Summary ──
echo ""
echo "═══════════════════════════════════════════"
echo " Loyalty Points Import — Integration Test"
echo "═══════════════════════════════════════════"
echo " Results: $PASS passed, $FAIL failed (total $TOTAL)"
echo "═══════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
