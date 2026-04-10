# Phase 3c: Customer Intake Flow -- Acceptance Test Plan

> Scope: NumPad, SignaturePad, ConsentText, AutoSave, IntakeForm (4-step wizard), IntakeEdit (returning customer), IntakeThankYou
> Sources: DESIGN.md v1.1 sections 6-7, prototype screens (pagearchetype.pen)

---

## 1. NumPad Component

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-NUM-01 | Digit entry | Tap 0-9 on NumPad | Digit appends to phone input; display updates in real time |
| 3c-NUM-02 | Backspace | Enter "1234", tap backspace (&#x232b;) | Display shows "123" |
| 3c-NUM-03 | Backspace on empty | Tap backspace with empty input | No-op, no crash |
| 3c-NUM-04 | Max length | Enter 11+ digits | Input stops accepting after 10 digits (US phone) |
| 3c-NUM-05 | Format display | Enter "2145551234" | Display formats as "(214) 555-1234" or equivalent mask "(555) 000-0000" per prototype |

---

## 2. SignaturePad Component

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-SIG-01 | Draw signature | Touch-draw strokes on canvas | Ink trail renders in real time on the canvas |
| 3c-SIG-02 | Clear button | Draw a signature, tap "Clear" | Canvas is wiped blank; signature data reset to null |
| 3c-SIG-03 | Export data URL | Draw signature, trigger export | Returns a non-empty `data:image/png;base64,...` string |
| 3c-SIG-04 | Empty guard | Attempt to submit without drawing | Submit is blocked; signature field shows validation error |
| 3c-SIG-05 | Touch vs mouse | Use finger on iPad (touch events) | Strokes register correctly (react-signature-canvas touch support) |
| 3c-SIG-06 | Canvas resize | Rotate iPad landscape/portrait | Canvas redraws at correct dimensions without losing current signature |

---

## 3. ConsentText Component

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-CON-01 | Four paragraphs rendered | Open Step 4 (Consent & Signature) | All 4 CONSENT_TEXT paragraphs display inside the scrollable consent box |
| 3c-CON-02 | Paragraph 1 content | Read consent box | Contains "Massage therapy is not a substitute for medical examination or diagnosis..." through "...physician's written consent prior to services." |
| 3c-CON-03 | Paragraphs 2-4 bold | Inspect paragraphs 2, 3, 4 | Rendered with bold/emphasis styling per DESIGN.md spec |
| 3c-CON-04 | Scrollable container | Consent text exceeds visible area | Container scrolls vertically; all text accessible |
| 3c-CON-05 | Consent box styling | Inspect consent container | Background #FAFAFA, 1px #E5E7EB border, 8px corner radius, 12px/16px padding (matches prototype node `consentBox`) |
| 3c-CON-06 | Static text | Attempt to select/edit consent text | Text is read-only; not editable |

---

## 4. AutoSave Component

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-AUTO-01 | Debounce save | Type in firstName field, wait 600ms | `localStorage` key (e.g. `intake_draft`) contains the entered value |
| 3c-AUTO-02 | Debounce cancel | Type "Ja", then "ne" within 500ms | Only one write to localStorage (after final keystroke + 500ms) |
| 3c-AUTO-03 | Draft recovery | Fill Step 1 partially, close tab, reopen `/intake/new` | Form restores all previously entered Step 1 values from localStorage |
| 3c-AUTO-04 | Cross-step persistence | Fill Step 1, advance to Step 2, fill some checkboxes, close tab | Reopening restores both Step 1 and Step 2 data |
| 3c-AUTO-05 | Draft cleared on submit | Complete and submit entire form | `intake_draft` key removed from localStorage |
| 3c-AUTO-06 | Draft cleared on Next Client | Submit form, tap "Next Client" on ThankYou page | localStorage draft cleared; Step 1 loads empty |
| 3c-AUTO-07 | Network failure recovery | Fill form, disable network, attempt submit (fails), re-enable network | Draft survives in localStorage; user can retry submit without re-entering data |

---

## 5. IntakeForm -- 4-Step Wizard

### 5.1 Step Navigation

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-FORM-01 | Initial state | Navigate to `/intake/new` | Step 1 "Personal Information" shown; progress bar shows "Step 1 of 4" with dot 1 filled (#0F766E), dots 2-4 grey (#E5E7EB) |
| 3c-FORM-02 | Next button | Fill required fields on Step 1, tap "Next" | Step 2 "Health Information" displays; progress bar updates to "Step 2 of 4", dots 1-2 filled |
| 3c-FORM-03 | Back button | On Step 2, tap "Back" | Returns to Step 1 with all previously entered data preserved |
| 3c-FORM-04 | Full forward traversal | Navigate Step 1 -> 2 -> 3 -> 4 | Each step loads correctly; progress dots fill incrementally; Step 4 shows "Submit" button instead of "Next" |
| 3c-FORM-05 | Back preserves all data | Fill all 4 steps, go Back to Step 1 | All fields on every step retain their values |
| 3c-FORM-06 | No skip ahead | On Step 1, attempt to click dot 3 | Dots are not clickable; user must use Next/Back sequentially |

### 5.2 Step 1 -- Personal Information

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-FORM-10 | Required field markers | View Step 1 | "First Name *", "Last Name *", "Phone # *" show asterisk; Email, Address, Date of Birth, Gender do not |
| 3c-FORM-11 | Empty required - firstName | Leave First Name blank, tap Next | Red border on First Name input; inline error "First name is required"; banner "Please fix the highlighted fields before continuing." with alert icon; Next button disabled (grey #9CA3AF) |
| 3c-FORM-12 | Empty required - lastName | Leave Last Name blank, tap Next | Red border on Last Name; inline error message |
| 3c-FORM-13 | Empty required - phone | Leave Phone blank, tap Next | Red border on Phone; inline error "Phone number must be 10 digits" |
| 3c-FORM-14 | Invalid phone length | Enter "21455" (5 digits), tap Next | Validation error: phone must be 10 digits |
| 3c-FORM-15 | Valid submission | Fill firstName="Jane", lastName="Smith", phone="2145551234", tap Next | Advances to Step 2 with no errors |
| 3c-FORM-16 | Optional fields empty | Fill only required fields, leave Email/Address/DOB/Gender empty, tap Next | Advances to Step 2 (no validation errors on optional fields) |
| 3c-FORM-17 | Email format | Enter "notanemail" in Email field | Shows format validation warning (non-blocking or on Next) |
| 3c-FORM-18 | Date of Birth format | View DOB field | Placeholder shows "MM/DD/YYYY" per prototype |
| 3c-FORM-19 | Gender dropdown | Tap Gender field | Dropdown appears with selectable options; placeholder "Select gender" |
| 3c-FORM-20 | Minor checkbox | Check "I am under 17 years old" | Guardian Name field appears below the checkbox |
| 3c-FORM-21 | Minor - guardian required | Check minor, leave guardian name blank, tap Next | Validation error on guardianName: required when isMinor is true |
| 3c-FORM-22 | Minor - guardian filled | Check minor, enter guardian name "John Doe", tap Next | Advances to Step 2 |
| 3c-FORM-23 | Error banner styling | Trigger validation errors | Red background (#FEF2F2), red border (#FECACA), red alert icon, red text (#DC2626), 8px corner radius |
| 3c-FORM-24 | Error clears on fix | Fix a previously errored field | Red border and inline error disappear for that field in real time |

### 5.3 Step 2 -- Health Information

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-FORM-30 | Eight checkboxes rendered | View Step 2 | Checkboxes: Spinal Problems, Allergies, High Blood Pressure, Bruise Easily (left column); Varicose Veins, Migraines, Heart Conditions, Injuries (right column) |
| 3c-FORM-31 | Checkbox toggle | Tap "High Blood Pressure" | Checkbox fills/checks; tapping again unchecks |
| 3c-FORM-32 | All default unchecked | View Step 2 fresh | All 8 health checkboxes unchecked by default |
| 3c-FORM-33 | Pregnancy checkbox | Check "Currently pregnant?" | Due Date field (MM/DD/YYYY) becomes enabled/visible |
| 3c-FORM-34 | Pregnancy unchecked | Uncheck "Currently pregnant?" | Due Date field hides or disables; pregnancyDueDate resets to null |
| 3c-FORM-35 | Medical Notes | Type in Medical Notes textarea | Free-text entry; placeholder "Add any additional medical notes or concerns..." |
| 3c-FORM-36 | No required fields | Leave everything blank on Step 2, tap Next | Advances to Step 3 (all health fields are optional) |

### 5.4 Step 3 -- Massage Preferences

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-FORM-40 | Service Type radios | View Step 3 | Radio buttons: Swedish, Deep Tissue, Trigger Point, Pregnancy, Hot Stone, Other |
| 3c-FORM-41 | Single selection | Select "Deep Tissue", then "Hot Stone" | Only "Hot Stone" is selected (radio group, not multi-select) |
| 3c-FORM-42 | Pre-selected from Zustand | Employee pre-assigned serviceType="deep_tissue" | "Deep Tissue" radio pre-selected on load |
| 3c-FORM-43 | Areas of pain textarea | Type "lower back, shoulders" | Text entered and stored in `areasOfPainTension` |
| 3c-FORM-44 | Areas to avoid textarea | Type "neck" | Text entered and stored in `areasToAvoid` |
| 3c-FORM-45 | No required fields | Leave all blank, tap Next | Advances to Step 4 |

### 5.5 Step 4 -- Consent & Signature

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-FORM-50 | Consent text displayed | View Step 4 | All 4 paragraphs of CONSENT_TEXT visible in scrollable box |
| 3c-FORM-51 | Acknowledgment checkbox | View Step 4 | Unchecked checkbox with label "I acknowledge and agree to the above terms" |
| 3c-FORM-52 | Signature canvas | View Step 4 | "Client Signature" label with empty canvas; placeholder text "Sign here with your finger" |
| 3c-FORM-53 | Submit blocked - no ack | Draw signature but leave checkbox unchecked, tap Submit | Validation error; submit blocked |
| 3c-FORM-54 | Submit blocked - no sig | Check acknowledgment but leave signature blank, tap Submit | Validation error; submit blocked |
| 3c-FORM-55 | Submit blocked - neither | Leave both empty, tap Submit | Both validation errors shown |
| 3c-FORM-56 | Valid submit | Check acknowledgment, draw signature, tap "Submit" | POST /api/customers fires with complete IntakeFormData (21 fields); creates customer + intake_form + visit in one transaction |
| 3c-FORM-57 | Submit button style | View Step 4 | Green button (#0F766E), white text "Submit" with checkmark icon; "Back" button on the left with left-arrow icon |
| 3c-FORM-58 | Loading state | Tap Submit with valid data | Button shows loading indicator; prevents double-tap/double-submit |
| 3c-FORM-59 | Server error | Submit fails (500) | Error toast/message displayed; form data preserved; user can retry |

### 5.6 Full Payload Verification

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-FORM-60 | POST body contains all fields | Intercept POST /api/customers on submit | Payload includes: firstName, lastName, phone, email, address, date_of_birth, gender, isMinor, guardianName, 8 health booleans, isPregnant, pregnancyDueDate, medicalNotes, preferredMassageType, areasOfPainTension, areasToAvoid, consentAcknowledged (true), clientSignatureDataUrl (base64 string) |
| 3c-FORM-61 | Service + therapist included | Intercept POST | Payload includes serviceType and therapistName from Zustand (pre-assigned by employee) |
| 3c-FORM-62 | guardianSignatureDataUrl | Minor checked, guardian signs | Payload includes guardianSignatureDataUrl as data URL |

---

## 6. IntakeEdit -- Returning Customer Review & Update

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-EDIT-01 | Page title | Navigate to `/intake/:customerId/edit` | Title: "Review & Update Your Information"; subtitle: "Jane Smith - Please review your details below. Edit any section that needs updating." |
| 3c-EDIT-02 | Single-page layout | View page | All 4 sections visible in one scrollable page (not a wizard): 1. Personal Information, 2. Health Conditions, 3. Massage Preferences, 4. Consent & Signature |
| 3c-EDIT-03 | Prefilled data | Load edit page for existing customer | All fields populated from existing customer/intake_form data |
| 3c-EDIT-04 | Section 1 read-only summary | View Section 1 | Personal info shown as read-only summary with checkmark icon (Name, Email, Phone, DOB displayed as text, not input fields) |
| 3c-EDIT-05 | Change highlight - yellow | Modify "Areas to avoid" from "lower back" to "lower back, neck" | Changed field gets yellow highlight: background #FEF9C3, border #FBBF24 |
| 3c-EDIT-06 | Health checkbox change highlight | Toggle "High Blood Pressure" on (was off) | Checkbox row gets yellow "Changed" badge/tag |
| 3c-EDIT-07 | Multiple highlights | Change 3 fields across sections | All 3 changed fields highlighted yellow independently |
| 3c-EDIT-08 | No highlight on unchanged | View a field that was not modified | Normal styling (white background, grey border) |
| 3c-EDIT-09 | Consent text full display | Scroll to Section 4 | All 4 paragraphs of CONSENT_TEXT displayed in full (same as wizard Step 4) |
| 3c-EDIT-10 | Re-sign required | View Section 4 signature area | Previous signature cleared; fresh empty canvas requiring new signature |
| 3c-EDIT-11 | Acknowledgment re-check | View Section 4 checkbox | "I acknowledge and agree to the above terms" checkbox pre-checked (carried over) |
| 3c-EDIT-12 | Save & Sign button | View bottom bar | "Save & Sign" button (green #0F766E) on right; "Cancel" button (white with border) on left |
| 3c-EDIT-13 | Save blocked without signature | Tap "Save & Sign" without drawing new signature | Validation error: signature required |
| 3c-EDIT-14 | Valid save | Make changes, draw new signature, tap "Save & Sign" | PUT /api/customers/:id/intake fires; updates form_data + client_signed_at |
| 3c-EDIT-15 | Cancel button | Tap "Cancel" | Navigates back without saving; no PUT request |
| 3c-EDIT-16 | No changes + re-sign | Change nothing, draw signature, tap "Save & Sign" | Still submits successfully (re-sign counts as update to client_signed_at) |

---

## 7. IntakeThankYou Page

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-THANK-01 | Success display | Submit wizard form | Page shows: green checkmark circle icon, "Thank you, Jane!" (uses customer firstName), "Your form has been submitted successfully." |
| 3c-THANK-02 | Next Client button | View ThankYou | Green button "Next Client" with right-arrow icon, centered |
| 3c-THANK-03 | Return iPad message | View ThankYou | Divider with "or", then "Please return the iPad to our staff." below |
| 3c-THANK-04 | Next Client action | Tap "Next Client" | Form clears completely; navigates to Step 1; accessLevel stays as `customer`; serviceType + therapistName preserved from Zustand |
| 3c-THANK-05 | Next Client - fresh form | After tapping Next Client, view Step 1 | All fields empty; no draft data from previous submission |
| 3c-THANK-06 | Return iPad flow | Employee takes iPad, enters PIN | accessLevel changes to `staff`; auto-redirects to `/s/:storeId/customers` (customer list); most recent customer at top |
| 3c-THANK-07 | Edit flow ThankYou | Submit from IntakeEdit page | ThankYou shows "Changes saved! Please return the iPad to our staff." with Next Client option |

---

## 8. Access Level & Security

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-SEC-01 | Customer mode on entry | Employee taps "New Client" -> "Start Form" | accessLevel set to `customer` in Zustand; employee-only UI hidden |
| 3c-SEC-02 | PIN required to exit | On ThankYou page, attempt to navigate to staff pages | Blocked; requires employee PIN to return to staff accessLevel |
| 3c-SEC-03 | Edit mode customer access | Employee taps "Update Health Form" | accessLevel set to `customer`; iPad handed to client |
| 3c-SEC-04 | PIN after edit | Complete IntakeEdit, on ThankYou | Employee PIN required to return to staff mode |

---

## 9. Edge Cases & Error Handling

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3c-EDGE-01 | Double submit prevention | Tap Submit rapidly twice | Only one POST fires; second tap ignored while request in flight |
| 3c-EDGE-02 | Network timeout | Submit with simulated slow network (>10s) | Loading indicator persists; timeout error displayed after threshold; draft preserved |
| 3c-EDGE-03 | Session expired (410) | Submit after store session closed | 410 response handled; redirect to PIN page |
| 3c-EDGE-04 | Very long text input | Enter 500+ characters in medicalNotes | Text accepted; textarea scrolls; no truncation on submit |
| 3c-EDGE-05 | Special characters | Enter "O'Brien-Smith" as lastName | Stored and displayed correctly; no SQL injection or XSS |
| 3c-EDGE-06 | Browser back button | On Step 3, use browser back | Navigates to Step 2 (not out of the form entirely); or handled gracefully |
| 3c-EDGE-07 | Concurrent edit conflict | Two devices edit same customer simultaneously | Last write wins or conflict detection with user notification |
| 3c-EDGE-08 | Signature with single dot | Tap once on signature canvas (minimal stroke) | Accepted as valid signature (any non-empty stroke counts) |

---

## Summary

| Category | Test Count |
|----------|-----------|
| NumPad | 5 |
| SignaturePad | 6 |
| ConsentText | 6 |
| AutoSave | 7 |
| IntakeForm Wizard (navigation + steps 1-4 + payload) | 29 |
| IntakeEdit (returning customer) | 16 |
| IntakeThankYou | 7 |
| Access Level & Security | 4 |
| Edge Cases | 8 |
| **Total** | **88** |
