#!/usr/bin/env bash
# Full-flow integration test for Spa CRM
set -euo pipefail

BASE="http://localhost:8787"
PASS=0; FAIL=0; TOTAL=0

# Helper: run a test case
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

# Helper: HTTP request returning status code
status() {
  curl -s -o /dev/null -w '%{http_code}' "$@"
}

# Helper: HTTP request returning body
body() {
  curl -s "$@"
}

echo "═══════════════════════════════════════════"
echo " Spa CRM — Full Flow Integration Test"
echo "═══════════════════════════════════════════"
echo ""

# ── 1. Health Check ──
echo "1. Health Check"
run "API is alive" "[ \$(status $BASE/api/health) = 200 ]"

# ── 2. Admin Registration & Login ──
echo ""
echo "2. Admin Registration & Login"

# Register admin (auth routes are at /api/auth/*)
REG_RESP=$(body -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"TestPass123","name":"Test Admin","inviteCode":"CLIFSPA2026"}')
REG_STATUS=$(echo "$REG_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if 'token' in d or 'adminId' in d else d.get('error','fail'))" 2>/dev/null || echo "fail")
run "Register admin" "[ '$REG_STATUS' = 'ok' ]"

# Login
LOGIN_RESP=$(body -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"TestPass123"}')
ADMIN_TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
run "Admin login returns token" "[ -n '$ADMIN_TOKEN' ]"

AUTH="Authorization: Bearer $ADMIN_TOKEN"

# ── 3. Store Management ──
echo ""
echo "3. Store Management"

# Create store
STORE_RESP=$(body -X POST "$BASE/api/admin/stores" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Test Spa","address":"123 Main St","staffPin":"1234","adminPin":"5678"}')
STORE_ID=$(echo "$STORE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('storeId',''))" 2>/dev/null || echo "")
run "Create store" "[ -n '$STORE_ID' ]"

# List stores
run "List stores" "[ \$(status -H '$AUTH' $BASE/api/admin/stores) = 200 ]"

# Get store detail
run "Get store detail" "[ \$(status -H '$AUTH' $BASE/api/admin/stores/$STORE_ID) = 200 ]"

# ── 4. PIN Validation ──
echo ""
echo "4. PIN Validation"

# PIN must be exactly 4 digits
run "PIN update rejects non-4-digit (123)" \
  "[ \$(status -X PUT -H 'Content-Type: application/json' -H '$AUTH' \
    -d '{\"staffPin\":\"123\"}' $BASE/api/admin/stores/$STORE_ID/pins) = 400 ]"

run "PIN update rejects letters (abcd)" \
  "[ \$(status -X PUT -H 'Content-Type: application/json' -H '$AUTH' \
    -d '{\"staffPin\":\"abcd\"}' $BASE/api/admin/stores/$STORE_ID/pins) = 400 ]"

run "PIN update rejects 5 digits (12345)" \
  "[ \$(status -X PUT -H 'Content-Type: application/json' -H '$AUTH' \
    -d '{\"adminPin\":\"12345\"}' $BASE/api/admin/stores/$STORE_ID/pins) = 400 ]"

run "PIN update accepts valid 4-digit PIN" \
  "[ \$(status -X PUT -H 'Content-Type: application/json' -H '$AUTH' \
    -d '{\"staffPin\":\"1111\",\"adminPin\":\"2222\"}' $BASE/api/admin/stores/$STORE_ID/pins) = 200 ]"

# ── 5. Password Validation ──
echo ""
echo "5. Password Validation"

run "Password rejects < 8 chars" \
  "[ \$(status -X PUT -H 'Content-Type: application/json' -H '$AUTH' \
    -d '{\"name\":\"Admin\",\"currentPassword\":\"Admin123!\",\"newPassword\":\"short\"}' \
    $BASE/api/admin/me) = 400 ]"

# ── 6. Store Session (Open / Close) ──
echo ""
echo "6. Store Session (Open / Close)"

# Open store with staff PIN
OPEN_RESP=$(body -X POST "$BASE/api/auth/store-pin" \
  -H 'Content-Type: application/json' \
  -d "{\"storeId\":\"$STORE_ID\",\"pin\":\"1111\"}")
STORE_TOKEN=$(echo "$OPEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
run "Open store with staff PIN" "[ -n '$STORE_TOKEN' ]"
SAUTH="Authorization: Bearer $STORE_TOKEN"

# Open store with admin PIN
OPEN_ADMIN_RESP=$(body -X POST "$BASE/api/auth/store-pin" \
  -H 'Content-Type: application/json' \
  -d "{\"storeId\":\"$STORE_ID\",\"pin\":\"2222\"}")
ADMIN_STORE_TOKEN=$(echo "$OPEN_ADMIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
run "Open store with admin PIN" "[ -n '$ADMIN_STORE_TOKEN' ]"

# Wrong PIN
run "Wrong PIN rejected" \
  "[ \$(status -X POST -H 'Content-Type: application/json' \
    -d '{\"storeId\":\"$STORE_ID\",\"pin\":\"9999\"}' $BASE/api/auth/store-pin) = 401 ]"

# ── 7. New Customer Flow ──
echo ""
echo "7. New Customer Flow"

CUST_RESP=$(body -X POST "$BASE/api/customers" \
  -H 'Content-Type: application/json' -H "$SAUTH" \
  -d '{
    "firstName":"Jane","lastName":"Doe","phone":"5551234567",
    "dateOfBirth":"1990-01-15","gender":"female",
    "emergencyContactName":"John Doe","emergencyContactPhone":"5559876543",
    "intakeFormData":{
      "hasSpinalProblems":false,"hasAllergies":true,"hasHighBloodPressure":false,
      "hasBruiseEasily":false,"hasVaricoseVeins":false,"hasMigraines":false,
      "hasHeartConditions":false,"hasInjuries":false,"isPregnant":false,
      "pregnancyDueDate":null,"medicalNotes":"Allergic to lavender",
      "preferredMassageType":"swedish_relaxation",
      "areasOfPainTension":"Lower back","areasToAvoid":"Neck",
      "isMinor":false,"guardianName":null,"guardianSignatureDataUrl":null,
      "consentAcknowledged":true,"clientSignatureDataUrl":"data:image/png;base64,test"
    },
    "firstVisit":{"serviceType":"swedish_relaxation"}
  }')
CUST_ID=$(echo "$CUST_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('customerId',''))" 2>/dev/null || echo "")
VISIT_ID=$(echo "$CUST_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('visitId',''))" 2>/dev/null || echo "")
run "Create new customer + visit" "[ -n '$CUST_ID' ] && [ -n '$VISIT_ID' ]"

# ── 8. Duplicate Prevention ──
echo ""
echo "8. Duplicate Prevention"

# Same phone → upsert (should succeed with visit)
DUP_RESP=$(body -X POST "$BASE/api/customers" \
  -H 'Content-Type: application/json' -H "$SAUTH" \
  -d '{
    "firstName":"Jane","lastName":"Doe","phone":"5551234567",
    "dateOfBirth":"1990-01-15","gender":"female",
    "emergencyContactName":"John Doe","emergencyContactPhone":"5559876543",
    "intakeFormData":{
      "hasSpinalProblems":false,"hasAllergies":true,"hasHighBloodPressure":false,
      "hasBruiseEasily":false,"hasVaricoseVeins":false,"hasMigraines":false,
      "hasHeartConditions":false,"hasInjuries":false,"isPregnant":false,
      "pregnancyDueDate":null,"medicalNotes":"Updated",
      "preferredMassageType":"swedish_relaxation",
      "areasOfPainTension":"","areasToAvoid":"",
      "isMinor":false,"guardianName":null,"guardianSignatureDataUrl":null,
      "consentAcknowledged":true,"clientSignatureDataUrl":"data:image/png;base64,test"
    },
    "firstVisit":{"serviceType":"swedish_relaxation"}
  }')
DUP_HTTP=$(echo "$DUP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('409' if 'pending' in d.get('error','') else 'other')" 2>/dev/null || echo "other")
run "Existing phone + pending visit → 409" "[ '$DUP_HTTP' = '409' ]"

# Check-in with pending visit → 409
run "Check-in duplicate pending → 409" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{\"serviceType\":\"swedish_relaxation\"}' \
    $BASE/api/customers/$CUST_ID/visits) = 409 ]"

# ── 9. Therapist Queue ──
echo ""
echo "9. Therapist Queue"

# Queue should have 1 pending visit
QUEUE=$(body -H "$SAUTH" "$BASE/api/stores/$STORE_ID/visits/pending-therapist")
QUEUE_COUNT=$(echo "$QUEUE" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('visits',[])))" 2>/dev/null || echo "0")
run "Queue has 1 pending visit" "[ $QUEUE_COUNT = 1 ]"

# ── 10. Therapist Signing ──
echo ""
echo "10. Therapist Signing"

# Sign visit
SIGN_STATUS=$(status -X PATCH -H 'Content-Type: application/json' -H "$SAUTH" \
  -d '{"therapistName":"Wei","therapistServiceTechnique":"Deep tissue","therapistBodyPartsNotes":"Back and shoulders"}' \
  "$BASE/api/visits/$VISIT_ID/therapist")
run "Sign visit" "[ $SIGN_STATUS = 200 ]"

# Already signed → 409
run "Re-sign visit → 409" \
  "[ \$(status -X PATCH -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{\"therapistName\":\"Wei\",\"therapistServiceTechnique\":\"Deep tissue\",\"therapistBodyPartsNotes\":\"Back\"}' \
    $BASE/api/visits/$VISIT_ID/therapist) = 409 ]"

# Queue should now be empty
QUEUE2=$(body -H "$SAUTH" "$BASE/api/stores/$STORE_ID/visits/pending-therapist")
QUEUE2_COUNT=$(echo "$QUEUE2" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('visits',[])))" 2>/dev/null || echo "0")
run "Queue empty after signing" "[ $QUEUE2_COUNT = 0 ]"

# ── 11. Validation: Missing Required Fields ──
echo ""
echo "11. Input Validation"

run "Visit POST rejects empty serviceType" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{\"serviceType\":\"\"}' \
    $BASE/api/customers/$CUST_ID/visits) = 400 ]"

run "Therapist sign rejects empty name" \
  "[ \$(status -X PATCH -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{\"therapistName\":\"\",\"therapistServiceTechnique\":\"Test\",\"therapistBodyPartsNotes\":\"Test\"}' \
    $BASE/api/visits/$VISIT_ID/therapist) = 400 ]"

# ── 12. Intake Form Store Scoping ──
echo ""
echo "12. Intake Store Scoping"

run "GET intake for own customer" \
  "[ \$(status -H '$SAUTH' $BASE/api/customers/$CUST_ID/intake) = 200 ]"

# Create a customer without a visit in this store (via direct DB would be ideal but let's test with a fake ID)
run "GET intake for non-existent customer → 404" \
  "[ \$(status -H '$SAUTH' $BASE/api/customers/nonexistent123/intake) = 404 ]"

# ── 13. Return Customer Check-in ──
echo ""
echo "13. Return Customer Check-in"

# First visit is now signed, so we can create a new one
CHECKIN_STATUS=$(status -X POST -H 'Content-Type: application/json' -H "$SAUTH" \
  -d '{"serviceType":"deep_tissue"}' \
  "$BASE/api/customers/$CUST_ID/visits")
run "Return check-in creates visit" "[ $CHECKIN_STATUS = 201 ]"

# Duplicate should fail
run "Return check-in duplicate pending → 409" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{\"serviceType\":\"deep_tissue\"}' \
    $BASE/api/customers/$CUST_ID/visits) = 409 ]"

# ── 14. Close Out ──
echo ""
echo "14. Close Out"

# Close out with pending visits → should be blocked
run "Close out blocked with pending visits" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{\"pin\":\"1111\"}' $BASE/api/auth/closeout) = 409 ]"

# Cancel the pending visit first
PENDING=$(body -H "$SAUTH" "$BASE/api/stores/$STORE_ID/visits/pending-therapist")
PENDING_ID=$(echo "$PENDING" | python3 -c "import sys,json; vs=json.load(sys.stdin).get('visits',[]); print(vs[0]['id'] if vs else '')" 2>/dev/null || echo "")
if [ -n "$PENDING_ID" ]; then
  curl -s -X PATCH -H 'Content-Type: application/json' -H "$SAUTH" \
    "$BASE/api/visits/$PENDING_ID/cancel" > /dev/null 2>&1
fi

# Close with staff PIN
run "Close out with staff PIN" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH' \
    -d '{\"pin\":\"1111\"}' $BASE/api/auth/closeout) = 200 ]"

# Re-open and close with admin PIN
REOPEN=$(body -X POST "$BASE/api/auth/store-pin" \
  -H 'Content-Type: application/json' \
  -d "{\"storeId\":\"$STORE_ID\",\"pin\":\"1111\"}")
REOPEN_TOKEN=$(echo "$REOPEN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
SAUTH2="Authorization: Bearer $REOPEN_TOKEN"

run "Close out with admin PIN" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH2' \
    -d '{\"pin\":\"2222\"}' $BASE/api/auth/closeout) = 200 ]"

# Wrong PIN
# Reopen with admin PIN for manage tests
REOPEN2=$(body -X POST "$BASE/api/auth/store-pin" \
  -H 'Content-Type: application/json' \
  -d "{\"storeId\":\"$STORE_ID\",\"pin\":\"2222\"}")
REOPEN2_TOKEN=$(echo "$REOPEN2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
SAUTH3="Authorization: Bearer $REOPEN2_TOKEN"

run "Close out wrong PIN → 401" \
  "[ \$(status -X POST -H 'Content-Type: application/json' -H '$SAUTH3' \
    -d '{\"pin\":\"9999\"}' $BASE/api/auth/closeout) = 401 ]"

# ── 15. Manage Endpoints (require store_admin role) ──
echo ""
echo "15. Manage Endpoints"

run "Manage customers list" \
  "[ \$(status -H '$SAUTH3' $BASE/api/manage/customers) = 200 ]"

run "Manage visits list" \
  "[ \$(status -H '$SAUTH3' $BASE/api/manage/visits) = 200 ]"

run "Manage export customers CSV" \
  "[ \$(status -H '$SAUTH3' $BASE/api/manage/export/customers) = 200 ]"

run "Manage export visits CSV" \
  "[ \$(status -H '$SAUTH3' $BASE/api/manage/export/visits) = 200 ]"

# ── Summary ──
echo ""
echo "═══════════════════════════════════════════"
echo " Results: $PASS passed, $FAIL failed (total $TOTAL)"
echo "═══════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
