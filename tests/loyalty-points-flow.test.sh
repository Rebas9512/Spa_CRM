#!/usr/bin/env bash
# ============================================================================
# Loyalty Points — API Integration Test
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
echo " Loyalty Points — API Integration Test"
echo "═══════════════════════════════════════════"

# ── 0. Health Check ──
echo ""
echo "0. Health Check"
run "API is alive" "[ \$(status $BASE/api/health) = 200 ]"

# ── 1. Setup: Admin + Store + PIN ──
echo ""
echo "1. Setup: Admin, Store, Session"

# Register
REG_RESP=$(body -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"loyalty-test@test.com","password":"TestPass123","name":"Loyalty Tester","inviteCode":"CLIFSPA2026"}')
ADMIN_TOKEN=$(echo "$REG_RESP" | jq_val ".get('token','')" || echo "")

# If registration fails (already exists), try login
if [ -z "$ADMIN_TOKEN" ]; then
  LOGIN_RESP=$(body -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"loyalty-test@test.com","password":"TestPass123"}')
  ADMIN_TOKEN=$(echo "$LOGIN_RESP" | jq_val ".get('token','')" || echo "")
fi
AUTH="Authorization: Bearer $ADMIN_TOKEN"
run "Admin authenticated" "[ -n '$ADMIN_TOKEN' ]"

# Create Store A
STORE_A_RESP=$(body -X POST "$BASE/api/admin/stores" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Loyalty Store A","address":"100 A St","staffPin":"1234","adminPin":"5678"}')
STORE_A=$(echo "$STORE_A_RESP" | jq_val ".get('storeId','')" || echo "")
run "Create Store A" "[ -n '$STORE_A' ]"

# Create Store B (for cross-store test)
STORE_B_RESP=$(body -X POST "$BASE/api/admin/stores" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Loyalty Store B","address":"200 B St","staffPin":"4321","adminPin":"8765"}')
STORE_B=$(echo "$STORE_B_RESP" | jq_val ".get('storeId','')" || echo "")
run "Create Store B" "[ -n '$STORE_B' ]"

# Open Store A session
OPEN_A=$(body -X POST "$BASE/api/auth/store-pin" \
  -H 'Content-Type: application/json' \
  -d "{\"storeId\":\"$STORE_A\",\"pin\":\"1234\"}")
TOKEN_A=$(echo "$OPEN_A" | jq_val ".get('token','')" || echo "")
SAUTH_A="Authorization: Bearer $TOKEN_A"
run "Open Store A session" "[ -n '$TOKEN_A' ]"

# Open Store B session
OPEN_B=$(body -X POST "$BASE/api/auth/store-pin" \
  -H 'Content-Type: application/json' \
  -d "{\"storeId\":\"$STORE_B\",\"pin\":\"4321\"}")
TOKEN_B=$(echo "$OPEN_B" | jq_val ".get('token','')" || echo "")
SAUTH_B="Authorization: Bearer $TOKEN_B"
run "Open Store B session" "[ -n '$TOKEN_B' ]"

# ── 2. Create Customer ──
echo ""
echo "2. Create Customer"

UNIQUE_PHONE="555$(date +%s | tail -c 8)"
CUST_RESP=$(body -X POST "$BASE/api/customers" \
  -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{
    "firstName":"Loyalty","lastName":"Tester","phone":"'"$UNIQUE_PHONE"'",
    "dateOfBirth":"1985-06-15","gender":"female",
    "intakeFormData":{
      "hasSpinalProblems":false,"hasAllergies":false,"hasHighBloodPressure":false,
      "hasBruiseEasily":false,"hasVaricoseVeins":false,"hasMigraines":false,
      "hasHeartConditions":false,"hasInjuries":false,"isPregnant":false,
      "pregnancyDueDate":null,"medicalNotes":"","preferredMassageType":"swedish_relaxation",
      "areasOfPainTension":"","areasToAvoid":"","isMinor":false,
      "guardianName":null,"guardianSignatureDataUrl":null,
      "consentAcknowledged":true,"clientSignatureDataUrl":"data:image/png;base64,test"
    },
    "firstVisit":{"serviceType":"swedish_relaxation"}
  }')
CUST_ID=$(echo "$CUST_RESP" | jq_val ".get('customerId','')" || echo "")
VISIT_1=$(echo "$CUST_RESP" | jq_val ".get('visitId','')" || echo "")
run "Create customer + first visit" "[ -n '$CUST_ID' ] && [ -n '$VISIT_1' ]"

# ── 3. BE-04: Pending visit does NOT earn points ──
echo ""
echo "3. BE-04: Pending Visit — No Points"

PROFILE=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-04: pending visit → loyalty_points = 0" "[ '$POINTS' = '0' ]"

# ── 4. BE-01: Therapist sign → +1 point ──
echo ""
echo "4. BE-01/08: First Sign — Points +1"

SIGN_STATUS=$(status -X PATCH -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{"therapistName":"Wei","therapistServiceTechnique":"Deep tissue","therapistBodyPartsNotes":"Back"}' \
  "$BASE/api/visits/$VISIT_1/therapist")
run "Sign visit #1" "[ $SIGN_STATUS = 200 ]"

PROFILE=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-01: after sign → loyalty_points = 1" "[ '$POINTS' = '1' ]"

# ── 5. EDGE-05: Re-sign → 409, no duplicate points ──
echo ""
echo "5. EDGE-05: Re-sign Blocked"

run "EDGE-05: re-sign visit #1 → 409" \
  "[ \$(status -X PATCH -H 'Content-Type: application/json' -H '$SAUTH_A' \
    -d '{\"therapistName\":\"Wei\",\"therapistServiceTechnique\":\"Test\",\"therapistBodyPartsNotes\":\"Test\"}' \
    $BASE/api/visits/$VISIT_1/therapist) = 409 ]"

PROFILE=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "EDGE-05: points still 1 after failed re-sign" "[ '$POINTS' = '1' ]"

# ── 6. BE-03: Cancel does NOT change points ──
echo ""
echo "6. BE-03: Cancel — No Points Change"

# Create visit #2, then cancel it
CHECKIN=$(body -X POST "$BASE/api/customers/$CUST_ID/visits" \
  -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{"serviceType":"deep_tissue"}')
VISIT_2=$(echo "$CHECKIN" | jq_val ".get('visitId','')" || echo "")
run "Create visit #2" "[ -n '$VISIT_2' ]"

CANCEL_STATUS=$(status -X PATCH -H 'Content-Type: application/json' -H "$SAUTH_A" \
  "$BASE/api/visits/$VISIT_2/cancel")
run "Cancel visit #2" "[ $CANCEL_STATUS = 200 ]"

PROFILE=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-03: after cancel → loyalty_points still 1" "[ '$POINTS' = '1' ]"

# ── 7. BE-02: Accumulate to 10 points ──
echo ""
echo "7. BE-02: Accumulate 9 More Visits (total 10)"

for i in $(seq 2 10); do
  # Create visit
  V_RESP=$(body -X POST "$BASE/api/customers/$CUST_ID/visits" \
    -H 'Content-Type: application/json' -H "$SAUTH_A" \
    -d "{\"serviceType\":\"swedish_relaxation\"}")
  V_ID=$(echo "$V_RESP" | jq_val ".get('visitId','')" || echo "")

  # Sign visit
  curl -s -X PATCH -H 'Content-Type: application/json' -H "$SAUTH_A" \
    -d '{"therapistName":"Wei","therapistServiceTechnique":"Deep tissue","therapistBodyPartsNotes":"Full body"}' \
    "$BASE/api/visits/$V_ID/therapist" > /dev/null 2>&1
done

PROFILE=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-02: after 10 completed visits → loyalty_points = 10" "[ '$POINTS' = '10' ]"

# ── 8. BE-10: Visit detail shows loyalty points ──
echo ""
echo "8. BE-10: Visit Detail Shows Points"

# Create visit #11 (pending) to check detail
V11_RESP=$(body -X POST "$BASE/api/customers/$CUST_ID/visits" \
  -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{"serviceType":"swedish_relaxation"}')
VISIT_11=$(echo "$V11_RESP" | jq_val ".get('visitId','')" || echo "")

DETAIL=$(body -H "$SAUTH_A" "$BASE/api/visits/$VISIT_11")
DETAIL_POINTS=$(echo "$DETAIL" | jq_val ".get('visit',{}).get('customerLoyaltyPoints',-1)" || echo "-1")
run "BE-10: visit detail returns customerLoyaltyPoints = 10" "[ '$DETAIL_POINTS' = '10' ]"

# ── 9. BE-07: Redeem with insufficient points → 400 ──
# (Currently has exactly 10, but let's test edge: first cancel #11 and test with a visit where we manually set < 10)
# Actually, we have 10 points. Let's first test successful redemption, then test insufficient.

# ── 10. BE-06/09: Redeem points on sign ──
echo ""
echo "9. BE-06/09: Redeem Points on Sign"

SIGN_REDEEM_STATUS=$(status -X PATCH -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{"therapistName":"Wei","therapistServiceTechnique":"Hot stone","therapistBodyPartsNotes":"Full body","redeemPoints":true}' \
  "$BASE/api/visits/$VISIT_11/therapist")
run "BE-06: sign with redeemPoints=true → 200" "[ $SIGN_REDEEM_STATUS = 200 ]"

# Points should be: 10 (before) + 1 (sign) - 10 (redeem) = 1
PROFILE=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "EDGE-02: 10 + 1 - 10 = 1 point remaining" "[ '$POINTS' = '1' ]"

# Check visit record has points_redeemed = 10
DETAIL_11=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID/visits" 2>/dev/null || body -H "$AUTH" "$BASE/api/admin/customers/$CUST_ID/visits" 2>/dev/null)
REDEEMED=$(echo "$DETAIL_11" | python3 -c "
import sys, json
data = json.load(sys.stdin)
visits = data.get('visits', [])
for v in visits:
    if v.get('id') == '$VISIT_11':
        print(v.get('pointsRedeemed', 0))
        break
else:
    print(-1)
" 2>/dev/null || echo "-1")
run "BE-09: visit record shows pointsRedeemed = 10" "[ '$REDEEMED' = '10' ]"

# ── 11. BE-07: Redeem with insufficient points → 400 ──
echo ""
echo "10. BE-07: Redeem with Insufficient Points"

# Create visit #12 (customer has 1 point, needs 10)
V12_RESP=$(body -X POST "$BASE/api/customers/$CUST_ID/visits" \
  -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{"serviceType":"swedish_relaxation"}')
VISIT_12=$(echo "$V12_RESP" | jq_val ".get('visitId','')" || echo "")
run "Create visit #12" "[ -n '$VISIT_12' ]"

REDEEM_FAIL=$(status -X PATCH -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{"therapistName":"Wei","therapistServiceTechnique":"Test","therapistBodyPartsNotes":"Test","redeemPoints":true}' \
  "$BASE/api/visits/$VISIT_12/therapist")
run "BE-07: redeemPoints with 1 point → 400" "[ $REDEEM_FAIL = 400 ]"

# Points should not have changed (visit not signed)
PROFILE=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-07: points unchanged after failed redemption (still 1)" "[ '$POINTS' = '1' ]"

# ── 12. BE-08: Sign without redemption → only +1 ──
echo ""
echo "11. BE-08: Sign Without Redemption"

SIGN_NO_REDEEM=$(status -X PATCH -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{"therapistName":"Wei","therapistServiceTechnique":"Swedish","therapistBodyPartsNotes":"Arms"}' \
  "$BASE/api/visits/$VISIT_12/therapist")
run "BE-08: sign without redeemPoints → 200" "[ $SIGN_NO_REDEEM = 200 ]"

PROFILE=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-08: points = 2 (1 + 1, no deduction)" "[ '$POINTS' = '2' ]"

# ── 13. EDGE-03/04: Accumulate > 10, choose not to redeem ──
echo ""
echo "12. EDGE-03: Points > 10, No Redemption"

# Accumulate 12 more visits (2 + 12 = 14 points)
for i in $(seq 1 12); do
  V_RESP=$(body -X POST "$BASE/api/customers/$CUST_ID/visits" \
    -H 'Content-Type: application/json' -H "$SAUTH_A" \
    -d "{\"serviceType\":\"swedish_relaxation\"}")
  V_ID=$(echo "$V_RESP" | jq_val ".get('visitId','')" || echo "")
  curl -s -X PATCH -H 'Content-Type: application/json' -H "$SAUTH_A" \
    -d '{"therapistName":"Wei","therapistServiceTechnique":"Deep tissue","therapistBodyPartsNotes":"Full body"}' \
    "$BASE/api/visits/$V_ID/therapist" > /dev/null 2>&1
done

PROFILE=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "EDGE-03: 14 points, no redemption → loyalty_points = 14" "[ '$POINTS' = '14' ]"

# ── 14. EDGE-04: Redeem with > 10 points ──
echo ""
echo "13. EDGE-04: Redeem with > 10 Points"

V_RESP=$(body -X POST "$BASE/api/customers/$CUST_ID/visits" \
  -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{"serviceType":"deep_tissue"}')
V_ID=$(echo "$V_RESP" | jq_val ".get('visitId','')" || echo "")

SIGN_STATUS=$(status -X PATCH -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{"therapistName":"Sarah","therapistServiceTechnique":"Hot stone","therapistBodyPartsNotes":"Legs","redeemPoints":true}' \
  "$BASE/api/visits/$V_ID/therapist")
run "EDGE-04: redeem with 14 points → 200" "[ $SIGN_STATUS = 200 ]"

# 14 + 1 - 10 = 5
PROFILE=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
POINTS=$(echo "$PROFILE" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "EDGE-04: 14 + 1 - 10 = 5 points remaining" "[ '$POINTS' = '5' ]"

# ── 15. BE-13/14: Cross-Store Points ──
echo ""
echo "14. BE-13/14: Cross-Store Points"

# Create visit in Store B for same customer
V_B_RESP=$(body -X POST "$BASE/api/customers/$CUST_ID/visits" \
  -H 'Content-Type: application/json' -H "$SAUTH_B" \
  -d '{"serviceType":"swedish_relaxation"}')
V_B_ID=$(echo "$V_B_RESP" | jq_val ".get('visitId','')" || echo "")
run "Create visit in Store B" "[ -n '$V_B_ID' ]"

# Check points visible from Store B visit detail
DETAIL_B=$(body -H "$SAUTH_B" "$BASE/api/visits/$V_B_ID")
DETAIL_B_POINTS=$(echo "$DETAIL_B" | jq_val ".get('visit',{}).get('customerLoyaltyPoints',-1)" || echo "-1")
run "BE-13: Store B sees customer points = 5" "[ '$DETAIL_B_POINTS' = '5' ]"

# Sign in Store B → points +1 = 6
SIGN_B=$(status -X PATCH -H 'Content-Type: application/json' -H "$SAUTH_B" \
  -d '{"therapistName":"Li","therapistServiceTechnique":"Thai","therapistBodyPartsNotes":"Back"}' \
  "$BASE/api/visits/$V_B_ID/therapist")
run "Sign visit in Store B" "[ $SIGN_B = 200 ]"

# Verify from Store A
PROFILE_A=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
POINTS_A=$(echo "$PROFILE_A" | jq_val ".get('customer',{}).get('loyaltyPoints',0)" || echo "0")
run "BE-14: Store A sees updated points = 6" "[ '$POINTS_A' = '6' ]"

# ── 16. BE-11/12: API Query Endpoints ──
echo ""
echo "15. BE-11/12: Points in Profile Endpoints"

# Staff profile endpoint
STAFF_PROFILE=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_ID")
HAS_LOYALTY=$(echo "$STAFF_PROFILE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('yes' if 'loyaltyPoints' in d.get('customer', {}) else 'no')
" 2>/dev/null || echo "no")
run "BE-11: GET /api/customers/:id has loyaltyPoints" "[ '$HAS_LOYALTY' = 'yes' ]"

# Admin profile endpoint
ADMIN_PROFILE=$(body -H "$AUTH" "$BASE/api/admin/customers/$CUST_ID")
HAS_LOYALTY_ADMIN=$(echo "$ADMIN_PROFILE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
c = d.get('customer', d)
print('yes' if 'loyaltyPoints' in c else 'no')
" 2>/dev/null || echo "no")
run "BE-12: GET /api/admin/customers/:id has loyaltyPoints" "[ '$HAS_LOYALTY_ADMIN' = 'yes' ]"

# ── Summary ──
echo ""
echo "═══════════════════════════════════════════"
echo " Loyalty Points — Integration Test Results"
echo "═══════════════════════════════════════════"
echo " Results: $PASS passed, $FAIL failed (total $TOTAL)"
echo "═══════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
