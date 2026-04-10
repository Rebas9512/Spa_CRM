#!/usr/bin/env bash
# ============================================================================
# Customer List & Search Scoping — API Integration Test
# Tests cross-store search, store-scoped lists, and admin global visibility
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
echo " Customer List & Search Scoping — Test"
echo "═══════════════════════════════════════════"

# ── 1. Setup: Admin + 2 Stores ──
echo ""
echo "1. Setup: Admin, Store A, Store B"

LOGIN_RESP=$(body -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"loyalty-test@test.com","password":"TestPass123"}')
ADMIN_TOKEN=$(echo "$LOGIN_RESP" | jq_val ".get('token','')" || echo "")
AUTH="Authorization: Bearer $ADMIN_TOKEN"
run "Admin authenticated" "[ -n '$ADMIN_TOKEN' ]"

# Create Store A
STORE_A_RESP=$(body -X POST "$BASE/api/admin/stores" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Scope Store A","address":"100 A St","staffPin":"1111","adminPin":"9999"}')
STORE_A=$(echo "$STORE_A_RESP" | jq_val ".get('storeId','')" || echo "")
run "Create Store A" "[ -n '$STORE_A' ]"

# Create Store B
STORE_B_RESP=$(body -X POST "$BASE/api/admin/stores" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Scope Store B","address":"200 B St","staffPin":"2222","adminPin":"8888"}')
STORE_B=$(echo "$STORE_B_RESP" | jq_val ".get('storeId','')" || echo "")
run "Create Store B" "[ -n '$STORE_B' ]"

# Open sessions
TOKEN_A=$(body -X POST "$BASE/api/auth/store-pin" \
  -H 'Content-Type: application/json' \
  -d "{\"storeId\":\"$STORE_A\",\"pin\":\"1111\"}" | jq_val ".get('token','')" || echo "")
SAUTH_A="Authorization: Bearer $TOKEN_A"
run "Open Store A" "[ -n '$TOKEN_A' ]"

TOKEN_B=$(body -X POST "$BASE/api/auth/store-pin" \
  -H 'Content-Type: application/json' \
  -d "{\"storeId\":\"$STORE_B\",\"pin\":\"2222\"}" | jq_val ".get('token','')" || echo "")
SAUTH_B="Authorization: Bearer $TOKEN_B"
run "Open Store B" "[ -n '$TOKEN_B' ]"

# ── 2. Create Customers in Different Stores ──
echo ""
echo "2. Create Customers"

PHONE_A="555$(date +%s | tail -c 8)1"
PHONE_B="555$(date +%s | tail -c 8)2"

# Customer Alpha — only in Store A
CUST_A_RESP=$(body -X POST "$BASE/api/customers" \
  -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{
    "firstName":"Alpha","lastName":"StoreA","phone":"'"$PHONE_A"'",
    "dateOfBirth":"1990-01-01","gender":"male",
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
CUST_A=$(echo "$CUST_A_RESP" | jq_val ".get('customerId','')" || echo "")
VISIT_A=$(echo "$CUST_A_RESP" | jq_val ".get('visitId','')" || echo "")
run "Create Alpha in Store A" "[ -n '$CUST_A' ]"

# Customer Beta — only in Store B
CUST_B_RESP=$(body -X POST "$BASE/api/customers" \
  -H 'Content-Type: application/json' -H "$SAUTH_B" \
  -d '{
    "firstName":"Beta","lastName":"StoreB","phone":"'"$PHONE_B"'",
    "dateOfBirth":"1985-05-15","gender":"female",
    "intakeFormData":{
      "hasSpinalProblems":false,"hasAllergies":false,"hasHighBloodPressure":false,
      "hasBruiseEasily":false,"hasVaricoseVeins":false,"hasMigraines":false,
      "hasHeartConditions":false,"hasInjuries":false,"isPregnant":false,
      "pregnancyDueDate":null,"medicalNotes":"","preferredMassageType":"deep_tissue",
      "areasOfPainTension":"","areasToAvoid":"","isMinor":false,
      "guardianName":null,"guardianSignatureDataUrl":null,
      "consentAcknowledged":true,"clientSignatureDataUrl":"data:image/png;base64,test"
    },
    "firstVisit":{"serviceType":"deep_tissue","therapistName":"Li"}
  }')
CUST_B=$(echo "$CUST_B_RESP" | jq_val ".get('customerId','')" || echo "")
VISIT_B=$(echo "$CUST_B_RESP" | jq_val ".get('visitId','')" || echo "")
run "Create Beta in Store B" "[ -n '$CUST_B' ]"

# Sign both visits to make them completed
curl -s -X PATCH "$BASE/api/visits/$VISIT_A/therapist" \
  -H 'Content-Type: application/json' -H "$SAUTH_A" \
  -d '{"therapistName":"Wei","therapistServiceTechnique":"F3","therapistBodyPartsNotes":"Back"}' > /dev/null
curl -s -X PATCH "$BASE/api/visits/$VISIT_B/therapist" \
  -H 'Content-Type: application/json' -H "$SAUTH_B" \
  -d '{"therapistName":"Li","therapistServiceTechnique":"B4","therapistBodyPartsNotes":"Legs"}' > /dev/null

# Create a cross-store visit: Alpha visits Store B too
CROSS_RESP=$(body -X POST "$BASE/api/customers/$CUST_A/visits" \
  -H 'Content-Type: application/json' -H "$SAUTH_B" \
  -d '{"serviceType":"hot_stone","therapistName":"Sarah"}')
VISIT_CROSS=$(echo "$CROSS_RESP" | jq_val ".get('visitId','')" || echo "")
run "Alpha checks in at Store B" "[ -n '$VISIT_CROSS' ]"

curl -s -X PATCH "$BASE/api/visits/$VISIT_CROSS/therapist" \
  -H 'Content-Type: application/json' -H "$SAUTH_B" \
  -d '{"therapistName":"Sarah","therapistServiceTechnique":"Hot Stone","therapistBodyPartsNotes":"Full body"}' > /dev/null

# ── 3. Staff Recent List — Store Scoped ──
echo ""
echo "3. Staff Recent List — Store Scoped"

# Store A recent list should have Alpha only
RECENT_A=$(body -H "$SAUTH_A" "$BASE/api/customers/recent?limit=50")
HAS_ALPHA_A=$(echo "$RECENT_A" | python3 -c "
import sys, json
custs = json.load(sys.stdin).get('customers', [])
print('yes' if any(c['firstName'] == 'Alpha' for c in custs) else 'no')
" 2>/dev/null || echo "no")
HAS_BETA_A=$(echo "$RECENT_A" | python3 -c "
import sys, json
custs = json.load(sys.stdin).get('customers', [])
print('yes' if any(c['firstName'] == 'Beta' for c in custs) else 'no')
" 2>/dev/null || echo "no")
run "Store A recent: has Alpha" "[ '$HAS_ALPHA_A' = 'yes' ]"
run "Store A recent: no Beta" "[ '$HAS_BETA_A' = 'no' ]"

# Store B recent list should have Beta AND Alpha (Alpha visited B too)
RECENT_B=$(body -H "$SAUTH_B" "$BASE/api/customers/recent?limit=50")
HAS_ALPHA_B=$(echo "$RECENT_B" | python3 -c "
import sys, json
custs = json.load(sys.stdin).get('customers', [])
print('yes' if any(c['firstName'] == 'Alpha' for c in custs) else 'no')
" 2>/dev/null || echo "no")
HAS_BETA_B=$(echo "$RECENT_B" | python3 -c "
import sys, json
custs = json.load(sys.stdin).get('customers', [])
print('yes' if any(c['firstName'] == 'Beta' for c in custs) else 'no')
" 2>/dev/null || echo "no")
run "Store B recent: has Alpha (cross-store visit)" "[ '$HAS_ALPHA_B' = 'yes' ]"
run "Store B recent: has Beta" "[ '$HAS_BETA_B' = 'yes' ]"

# ── 4. Staff Search — Global (cross-store) ──
echo ""
echo "4. Staff Search — Should Be Global"

# Store A staff searches for Beta (who only registered at Store B) → should find
SEARCH_BETA_FROM_A=$(status -H "$SAUTH_A" "$BASE/api/customers/search?phone=$PHONE_B")
run "Store A search for Beta (Store B customer) → 200 (global)" "[ $SEARCH_BETA_FROM_A = 200 ]"

# Store B staff searches for Alpha → should find
SEARCH_ALPHA_FROM_B=$(status -H "$SAUTH_B" "$BASE/api/customers/search?phone=$PHONE_A")
run "Store B search for Alpha (Store A customer) → 200 (global)" "[ $SEARCH_ALPHA_FROM_B = 200 ]"

# ── 5. Staff Visit History — Store Scoped ──
echo ""
echo "5. Staff Visit History — Store Scoped"

# Alpha's profile from Store A — should only show Store A visits (1 visit)
PROFILE_A=$(body -H "$SAUTH_A" "$BASE/api/customers/$CUST_A")
VISITS_COUNT_A=$(echo "$PROFILE_A" | python3 -c "
import sys, json
visits = json.load(sys.stdin).get('customer', {}).get('visits', [])
print(len(visits))
" 2>/dev/null || echo "0")
run "Alpha visits from Store A: 1 (store-scoped)" "[ '$VISITS_COUNT_A' = '1' ]"

# Alpha's profile from Store B — should only show Store B visits (1 visit)
PROFILE_B=$(body -H "$SAUTH_B" "$BASE/api/customers/$CUST_A")
VISITS_COUNT_B=$(echo "$PROFILE_B" | python3 -c "
import sys, json
visits = json.load(sys.stdin).get('customer', {}).get('visits', [])
print(len(visits))
" 2>/dev/null || echo "0")
run "Alpha visits from Store B: 1 (store-scoped)" "[ '$VISITS_COUNT_B' = '1' ]"

# ── 6. Admin Customer List — All Stores (global under admin) ──
echo ""
echo "6. Admin Customer List — Should Show ALL Stores"

# Admin customer list for Store A should show Alpha
ADMIN_CUST_A=$(body -H "$AUTH" "$BASE/api/admin/stores/$STORE_A/customers?pageSize=50")
ADMIN_HAS_ALPHA=$(echo "$ADMIN_CUST_A" | python3 -c "
import sys, json
custs = json.load(sys.stdin).get('customers', [])
print('yes' if any('Alpha' in c.get('firstName','') + c.get('name','') for c in custs) else 'no')
" 2>/dev/null || echo "no")
run "Admin Store A list: has Alpha" "[ '$ADMIN_HAS_ALPHA' = 'yes' ]"

# Key test: Admin customer list for Store A should ALSO show Beta (cross-store)
ADMIN_HAS_BETA_IN_A=$(echo "$ADMIN_CUST_A" | python3 -c "
import sys, json
custs = json.load(sys.stdin).get('customers', [])
print('yes' if any('Beta' in c.get('firstName','') + c.get('name','') for c in custs) else 'no')
" 2>/dev/null || echo "no")
run "Admin Store A list: has Beta (cross-store, global)" "[ '$ADMIN_HAS_BETA_IN_A' = 'yes' ]"

# Even a brand-new store should see all customers
STORE_C_RESP=$(body -X POST "$BASE/api/admin/stores" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Scope Store C","address":"300 C St","staffPin":"3333","adminPin":"7777"}')
STORE_C=$(echo "$STORE_C_RESP" | jq_val ".get('storeId','')" || echo "")

if [ -n "$STORE_C" ]; then
  ADMIN_CUST_C=$(body -H "$AUTH" "$BASE/api/admin/stores/$STORE_C/customers?pageSize=50")
  ADMIN_C_HAS_ALPHA=$(echo "$ADMIN_CUST_C" | python3 -c "
import sys, json
custs = json.load(sys.stdin).get('customers', [])
print('yes' if any('Alpha' in c.get('firstName','') + c.get('name','') for c in custs) else 'no')
" 2>/dev/null || echo "no")
  run "New Store C list: sees Alpha (global)" "[ '$ADMIN_C_HAS_ALPHA' = 'yes' ]"

  ADMIN_C_HAS_BETA=$(echo "$ADMIN_CUST_C" | python3 -c "
import sys, json
custs = json.load(sys.stdin).get('customers', [])
print('yes' if any('Beta' in c.get('firstName','') + c.get('name','') for c in custs) else 'no')
" 2>/dev/null || echo "no")
  run "New Store C list: sees Beta (global)" "[ '$ADMIN_C_HAS_BETA' = 'yes' ]"
else
  run "New Store C: creation failed" "false"
  run "New Store C: skipped" "false"
fi

# ── 7. Admin Visit History — All Stores ──
echo ""
echo "7. Admin Visit History — All Stores"

# Alpha has 2 visits (Store A + Store B) — admin should see both
ADMIN_VISITS=$(body -H "$AUTH" "$BASE/api/admin/customers/$CUST_A/visits")
ADMIN_VISIT_COUNT=$(echo "$ADMIN_VISITS" | python3 -c "
import sys, json
visits = json.load(sys.stdin).get('visits', [])
print(len(visits))
" 2>/dev/null || echo "0")
run "Admin: Alpha has 2 visits (all stores)" "[ '$ADMIN_VISIT_COUNT' = '2' ]"

# Check both store names appear
ADMIN_STORE_NAMES=$(echo "$ADMIN_VISITS" | python3 -c "
import sys, json
visits = json.load(sys.stdin).get('visits', [])
names = set(v.get('storeName','') for v in visits)
print(len(names))
" 2>/dev/null || echo "0")
run "Admin: Alpha visits span 2 different stores" "[ '$ADMIN_STORE_NAMES' = '2' ]"

# ── 8. Admin Visit List per Store — Should Show All Stores ──
echo ""
echo "8. Admin Visit List — Should Show All Stores"

# Admin visit list for Store A should show visits from all stores
ADMIN_VISIT_LIST_A=$(body -H "$AUTH" "$BASE/api/admin/stores/$STORE_A/visits?pageSize=50")
ADMIN_VL_HAS_STORE_B=$(echo "$ADMIN_VISIT_LIST_A" | python3 -c "
import sys, json
visits = json.load(sys.stdin).get('visits', [])
store_names = set(v.get('storeName','') for v in visits)
print('yes' if len(store_names) > 1 or any('B' in s for s in store_names) else 'no')
" 2>/dev/null || echo "no")
run "Admin Store A visit list: includes visits from other stores" "[ '$ADMIN_VL_HAS_STORE_B' = 'yes' ]"

# ── Summary ──
echo ""
echo "═══════════════════════════════════════════"
echo " Customer List & Search Scoping — Results"
echo "═══════════════════════════════════════════"
echo " Results: $PASS passed, $FAIL failed (total $TOTAL)"
echo "═══════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
