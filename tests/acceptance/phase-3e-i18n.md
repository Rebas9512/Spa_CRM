# Phase 3e: Internationalization (i18n) -- Acceptance Test Plan

> Scope: `getLocale` route detection, `useTranslation` hook, `zh.ts` Chinese translations,
> `en.ts` English translations, per-page language correctness, bilingual health labels
> Sources: DESIGN.md v1.1 Phase 3e section, prototype screens (pagearchetype.pen)

---

## 1. Infrastructure -- File Existence & Hook Implementation

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-INF-01 | i18n directory structure | Check `frontend/src/i18n/` | Contains `index.ts`, `types.ts`, `locales/zh.ts`, `locales/en.ts` |
| 3e-INF-02 | `getLocale` returns `'en'` for intake routes | Call `getLocale('/s/abc123/intake/step1')` | Returns `'en'` |
| 3e-INF-03 | `getLocale` returns `'en'` for intake sub-paths | Call `getLocale('/s/abc123/intake/thankyou')` | Returns `'en'` |
| 3e-INF-04 | `getLocale` returns `'zh'` for staff main | Call `getLocale('/s/abc123')` | Returns `'zh'` |
| 3e-INF-05 | `getLocale` returns `'zh'` for customer list | Call `getLocale('/s/abc123/customers')` | Returns `'zh'` |
| 3e-INF-06 | `getLocale` returns `'zh'` for PIN page | Call `getLocale('/s/abc123/pin')` | Returns `'zh'` |
| 3e-INF-07 | `getLocale` returns `'zh'` for landing page | Call `getLocale('/')` | Returns `'zh'` |
| 3e-INF-08 | `getLocale` returns `'zh'` for admin routes | Call `getLocale('/admin/dashboard')` | Returns `'zh'` |
| 3e-INF-09 | `getLocale` returns `'zh'` for manage routes | Call `getLocale('/s/abc123/manage/customers')` | Returns `'zh'` |
| 3e-INF-10 | `getLocale` returns `'zh'` for therapist routes | Call `getLocale('/s/abc123/visits/v1/therapist')` | Returns `'zh'` |
| 3e-INF-11 | `useTranslation` hook returns `t` and `locale` | Render component at `/s/abc123`, call `useTranslation()` | Returns `{ t: Function, locale: 'zh' }` |
| 3e-INF-12 | `t()` resolves known key | Call `t('nav.customers')` with locale `'zh'` | Returns `"客户列表"` |
| 3e-INF-13 | `t()` falls back to key for missing translation | Call `t('nonexistent.key')` with any locale | Returns `"nonexistent.key"` (the raw key string) |
| 3e-INF-14 | `TranslationKeys` type covers both locales | TypeScript compilation | `zh.ts` and `en.ts` both satisfy the `TranslationKeys` type; no type errors |

---

## 2. Chinese Coverage -- Staff/Admin/Common Pages

### 2a. Staff Main Page (prototype: `0bQQe`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-ZH-01 | Nav item: Customers | Open Staff Main at `/s/:storeId` | Nav shows "客户列表" (not "Customers") |
| 3e-ZH-02 | Nav item: Manage | Open Staff Main | Nav shows "管理" (not "Manage") |
| 3e-ZH-03 | Nav button: Close Out | Open Staff Main | Button shows "结账关店" (not "Close Out") |
| 3e-ZH-04 | Label: Phone Number | Open Staff Main | Phone input label shows Chinese equivalent (e.g. "手机号") |
| 3e-ZH-05 | Placeholder: Enter phone number | Open Staff Main | Placeholder shows Chinese (e.g. "输入手机号") |
| 3e-ZH-06 | Button: + New Client | Open Staff Main | Button shows "+ 新客户" (not "+ New Client") |
| 3e-ZH-07 | Banner: pending signatures | Open Staff Main with pending visits | Banner shows "N 条来访待技师签名" (not "N visits awaiting...") |
| 3e-ZH-08 | Button: Sign Now | Open Staff Main with pending visits | Button shows "立即签名" (not "Sign Now") |

### 2b. Customer Checkin Page (prototype: `Jfxgl`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-ZH-09 | Nav: Back | Open Return Checkin page | Back link shows Chinese (e.g. "返回") |
| 3e-ZH-10 | Section: Health Summary | Open Return Checkin | Section heading shows Chinese (e.g. "健康摘要") |
| 3e-ZH-11 | Health flag: High Blood Pressure | Open Return Checkin for flagged customer | Shows "高血压" (not "High Blood Pressure") |
| 3e-ZH-12 | Health flag: No allergies reported | Open Return Checkin | Shows Chinese (e.g. "无过敏") |
| 3e-ZH-13 | Health flag: Avoid areas | Open Return Checkin | Shows Chinese (e.g. "避开区域: 腰部") |
| 3e-ZH-14 | Link: Review Full Form | Open Return Checkin | Shows Chinese equivalent |
| 3e-ZH-15 | Label: Service Type | Open Return Checkin | Shows "服务类型" (not "Service Type") |
| 3e-ZH-16 | Placeholder: Select service type | Open Return Checkin | Placeholder in Chinese |
| 3e-ZH-17 | Label: Therapist | Open Return Checkin | Shows "技师" (not "Therapist") |
| 3e-ZH-18 | Placeholder: Enter therapist name | Open Return Checkin | Placeholder in Chinese |
| 3e-ZH-19 | Button: Confirm Check-In | Open Return Checkin | Shows "确认签到" (not "Confirm Check-In") |
| 3e-ZH-20 | Button: Update Health Form | Open Return Checkin | Shows Chinese equivalent (e.g. "更新健康表") |
| 3e-ZH-21 | Info: Last visit / Total visits | Open Return Checkin | Labels in Chinese (e.g. "上次来访", "总来访次数") |

### 2c. Staff Customer List (prototype: `FydNZ`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-ZH-22 | Page title: Customers | Open Customer List | Title shows "客户列表" |
| 3e-ZH-23 | Nav: Main link | Open Customer List | Back link shows Chinese (e.g. "主页") |
| 3e-ZH-24 | Search placeholder | Open Customer List | Shows Chinese placeholder (e.g. "搜索客户姓名或手机号") |
| 3e-ZH-25 | Table header: Customer | Open Customer List | Column header shows "客户" |
| 3e-ZH-26 | Table header: Phone | Open Customer List | Column header shows "电话" |
| 3e-ZH-27 | Table header: Last Service | Open Customer List | Column header shows "上次服务" |
| 3e-ZH-28 | Table header: Therapist | Open Customer List | Column header shows "技师" |
| 3e-ZH-29 | Table header: Time | Open Customer List | Column header shows "时间" |
| 3e-ZH-30 | Table header: Health | Open Customer List | Column header shows "健康" |
| 3e-ZH-31 | Health status: OK | Open Customer List with healthy customer | Shows Chinese equivalent (e.g. "正常") |
| 3e-ZH-32 | Health status: Alert | Open Customer List with flagged customer | Shows Chinese equivalent (e.g. "注意") |
| 3e-ZH-33 | Empty state: no customers | Open Customer List with empty store | Shows "未找到客户" |

### 2d. Therapist Queue (prototype: `edXLh`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-ZH-34 | Nav: Back link | Open Therapist Queue | Shows Chinese (e.g. "返回") |
| 3e-ZH-35 | Page title: Today's Pending Signatures | Open Therapist Queue | Title in Chinese (e.g. "今日待签名") |
| 3e-ZH-36 | Button: Sign | Open Therapist Queue with pending visits | Each row button shows Chinese (e.g. "签名") |

### 2e. Therapist Signature Page (prototype: `7IDc3`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-ZH-37 | Nav: Queue back link | Open Therapist Record page | Shows Chinese (e.g. "队列 (1/3)") |
| 3e-ZH-38 | Health alert banner | Open Therapist Record with flagged customer | Health conditions in Chinese (e.g. "高血压", "避开: 腰部") |
| 3e-ZH-39 | Label: Technique used | Open Therapist Record | Shows Chinese (e.g. "使用手法") |
| 3e-ZH-40 | Placeholder: Enter technique | Open Therapist Record | Placeholder in Chinese |
| 3e-ZH-41 | Label: Body parts massaged | Open Therapist Record | Shows Chinese (e.g. "按摩部位") |
| 3e-ZH-42 | Placeholder: Enter body parts | Open Therapist Record | Placeholder in Chinese |
| 3e-ZH-43 | Label: Licensee Signature | Open Therapist Record | Shows Chinese (e.g. "技师签名") |
| 3e-ZH-44 | Button: Clear | Open Therapist Record | Shows Chinese (e.g. "清除") |
| 3e-ZH-45 | Button: Sign & Next | Open Therapist Record (not last) | Shows Chinese (e.g. "签名并继续") |
| 3e-ZH-46 | Button: Sign & Done | Open Therapist Record (last visit) | Shows Chinese (e.g. "签名完成") |

### 2f. PIN Page (prototype: `9yTav`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-ZH-47 | Label: Enter PIN | Open PIN page | Shows "输入 PIN" (not "Enter PIN") |
| 3e-ZH-48 | Error: wrong PIN | Enter wrong PIN | Error message in Chinese (e.g. "PIN 错误") |

### 2g. Landing Page (prototype: `7nTTh`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-ZH-49 | Subtitle: Device & Store Management | Open Landing page | Shows Chinese (e.g. "设备和店铺管理") |
| 3e-ZH-50 | Card title: Sync Device | Open Landing page | Shows "同步设备" (not "Sync Device") |
| 3e-ZH-51 | Card description: Enter store ID | Open Landing page | Description in Chinese |
| 3e-ZH-52 | Placeholder: Enter store ID | Open Landing page | Placeholder in Chinese |
| 3e-ZH-53 | Button: Sync | Open Landing page | Shows Chinese (e.g. "同步") |
| 3e-ZH-54 | Card title: Admin Portal | Open Landing page | Shows Chinese (e.g. "管理员入口") |
| 3e-ZH-55 | Card description: Manage stores | Open Landing page | Description in Chinese |
| 3e-ZH-56 | Button: Login | Open Landing page | Shows Chinese (e.g. "登录") |
| 3e-ZH-57 | Link: Register with Code | Open Landing page | Shows Chinese (e.g. "使用邀请码注册") |

### 2h. Admin Panel Pages

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-ZH-58 | Admin Dashboard title | Open Admin Dashboard | Shows "管理员面板" |
| 3e-ZH-59 | Admin Dashboard: My Stores | Open Admin Dashboard | Section shows "我的店铺" |
| 3e-ZH-60 | Admin Dashboard: + New Store | Open Admin Dashboard | Button shows "新建店铺" |
| 3e-ZH-61 | Admin: Account Settings | Open Account Settings | Title shows "账号设置" |
| 3e-ZH-62 | Admin: Data Export | Open StoreManage Export tab | Tab/label shows "数据导出" |

### 2i. Status Labels (across all staff/admin pages)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-ZH-63 | Status: completed | View a completed visit on any staff page | Shows "已完成" |
| 3e-ZH-64 | Status: cancelled | View a cancelled visit | Shows "已取消" |
| 3e-ZH-65 | Status: active | View an active session/visit | Shows "活跃" |
| 3e-ZH-66 | Status: pending signature | View a visit awaiting signature | Shows "待签名" |
| 3e-ZH-67 | Prompt: complete or cancel first | Staff tries to close out with pending visits | Shows "请先完成或取消待签名来访" |

---

## 3. English Preservation -- Customer Pages

### 3a. Intake Step 1 -- Personal Information (prototype: `qDkdS`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-EN-01 | Step indicator | Open Intake Step 1 at `/s/:storeId/intake/step1` | Shows "Step 1 of 4" in English |
| 3e-EN-02 | Title: Personal Information | Open Intake Step 1 | Title is "Personal Information" (English) |
| 3e-EN-03 | Field: First Name | Open Intake Step 1 | Label says "First Name" |
| 3e-EN-04 | Field: Last Name | Open Intake Step 1 | Label says "Last Name" |
| 3e-EN-05 | Field: Phone | Open Intake Step 1 | Label says "Phone" |
| 3e-EN-06 | Field: Email | Open Intake Step 1 | Label says "Email" |
| 3e-EN-07 | Field: Address | Open Intake Step 1 | Label says "Address" |
| 3e-EN-08 | Field: Date of Birth | Open Intake Step 1 | Label says "Date of Birth" |
| 3e-EN-09 | Field: Gender | Open Intake Step 1 | Label says "Gender" |
| 3e-EN-10 | Checkbox: minor | Open Intake Step 1 | Says "I am under 17 years old" in English |
| 3e-EN-11 | Button: Next | Open Intake Step 1 | Button says "Next" |

### 3b. Intake Step 2 -- Health Information (prototype: `8Ogqu`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-EN-12 | Title: Health Information | Open Intake Step 2 | Title is "Health Information" (English) |
| 3e-EN-13 | Health options in English | Open Intake Step 2 | Options like "Spinal Problems", "High Blood Pressure", "Pregnant" are in English |
| 3e-EN-14 | Button: Back | Open Intake Step 2 | Button says "Back" |
| 3e-EN-15 | Button: Next | Open Intake Step 2 | Button says "Next" |

### 3c. Intake Step 3 -- Massage Preferences (prototype: `rG2Vm`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-EN-16 | Title: Massage Preferences | Open Intake Step 3 | Title is "Massage Preferences" (English) |
| 3e-EN-17 | Preference options in English | Open Intake Step 3 | All massage type options are in English |
| 3e-EN-18 | Button: Back | Open Intake Step 3 | Button says "Back" |
| 3e-EN-19 | Button: Next | Open Intake Step 3 | Button says "Next" |

### 3d. Intake Step 4 -- Consent & Signature (prototype: `wG9uz`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-EN-20 | Title: Consent & Signature | Open Intake Step 4 | Title is "Consent & Signature" (English) |
| 3e-EN-21 | CONSENT_TEXT paragraphs | Open Intake Step 4 | All 4 paragraphs are in English legal text |
| 3e-EN-22 | Signature label | Open Intake Step 4 | Label says "Sign here..." or English equivalent |
| 3e-EN-23 | Button: Back | Open Intake Step 4 | Button says "Back" |
| 3e-EN-24 | Button: Submit / Save & Sign | Open Intake Step 4 | Button says "Submit" or "Save & Sign" (English) |

### 3e. ThankYou Page (prototype: `vvKoi`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-EN-25 | Heading | Open ThankYou at `/s/:storeId/intake/thankyou` | Shows "Thank you, Jane!" (English, with customer first name) |
| 3e-EN-26 | Subtitle | Open ThankYou | Shows "Your form has been submitted successfully." (English) |
| 3e-EN-27 | Button: Next Client | Open ThankYou | Button says "Next Client" (English) |
| 3e-EN-28 | Return prompt | Open ThankYou | Shows "Please return the iPad to our staff." (English) |

---

## 4. Boundary -- Language Switches at Route Transitions

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-BND-01 | Staff to Customer transition | Staff taps "New Client" on Staff Main; route changes to `/s/:storeId/intake/step1` | All UI text switches to English; no Chinese visible on intake form |
| 3e-BND-02 | Customer to PIN transition | Customer submits form; ThankYou shows; staff taps "Next Client" then eventually returns iPad; route goes to PIN page | PIN page shows "输入 PIN" in Chinese |
| 3e-BND-03 | PIN to Staff transition | Enter correct staff PIN at PIN page | Staff Main renders entirely in Chinese |
| 3e-BND-04 | Staff Main to Customer List | Tap "客户列表" in nav | Customer List page renders entirely in Chinese |
| 3e-BND-05 | Customer List back to Staff Main | Tap back/"主页" on Customer List | Staff Main renders in Chinese |
| 3e-BND-06 | Staff to Therapist Queue | Tap "立即签名" banner | Therapist Queue renders in Chinese |
| 3e-BND-07 | Checkin to Intake (Update Health Form) | On Return Checkin, tap "更新健康表" | Route changes to `/s/:storeId/intake/...`; page renders in English |
| 3e-BND-08 | Landing to Admin login | On Landing page, tap "登录" | Admin login page renders in Chinese |
| 3e-BND-09 | No flash of wrong language | Navigate from Staff Main to Intake Step 1 | English renders on first paint; no brief flash of Chinese text |
| 3e-BND-10 | No flash on return | Submit intake form, return to PIN via ThankYou flow | Chinese renders on first paint of PIN page; no brief flash of English |

---

## 5. Edge Cases

### 5a. No Mixed Languages on a Single Page

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-EDGE-01 | Staff Main -- no English UI text | Open Staff Main; inspect all static text (nav, labels, buttons, placeholders, banners) | Zero English strings in UI chrome (customer names/phone numbers are data, not UI -- those stay as-is) |
| 3e-EDGE-02 | Customer List -- no English UI text | Open Customer List; inspect headers, search placeholder, status badges | All UI chrome in Chinese; customer names and phone data remain as entered |
| 3e-EDGE-03 | Intake Step 1 -- no Chinese text | Open Intake Step 1; inspect all labels, placeholders, buttons | Zero Chinese strings anywhere on the page |
| 3e-EDGE-04 | ThankYou -- no Chinese text | Open ThankYou page | Zero Chinese strings; all UI text in English |
| 3e-EDGE-05 | Therapist Record -- no English UI text | Open Therapist Record page | All labels, buttons, placeholders in Chinese; customer name is data |
| 3e-EDGE-06 | PIN page -- no English UI text | Open PIN page | "输入 PIN" in Chinese; no English UI strings (PIN acronym acceptable) |

### 5b. Health Labels -- Bilingual (Chinese for Staff, English for Customer)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-EDGE-07 | Health: staff view shows Chinese | Open Return Checkin for customer with "High Blood Pressure" | Health Summary shows "高血压" |
| 3e-EDGE-08 | Health: customer view shows English | Open Intake Step 2 (Health Information) | Checkbox option shows "High Blood Pressure" in English |
| 3e-EDGE-09 | Health: therapist view shows Chinese | Open Therapist Record for flagged customer | Health alert banner shows "高血压" in Chinese |
| 3e-EDGE-10 | Health: all conditions bilingual | Compare zh.ts health keys with en.ts health keys | Every health condition has both a Chinese and English translation |
| 3e-EDGE-11 | Avoid areas: staff Chinese | Staff views customer with avoid area "lower back" | Shows Chinese (e.g. "避开区域: 腰部") |
| 3e-EDGE-12 | Avoid areas: customer English | Customer fills in avoid area on Intake Step 2 | Label says "Areas to avoid" or similar in English |

### 5c. Massage Type Labels -- Bilingual

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-EDGE-13 | Massage type: staff dropdown Chinese | Open Return Checkin service type dropdown | Options show Chinese labels (e.g. "足部按摩", "深层组织") |
| 3e-EDGE-14 | Massage type: customer view English | Open Intake Step 3 massage preferences | Options show English labels (e.g. "Foot Massage", "Deep Tissue") |
| 3e-EDGE-15 | Massage type: customer list Chinese | View Last Service column in Customer List | Service names in Chinese |

### 5d. Dynamic / Data Content

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-EDGE-16 | Store name not translated | Open any page | Store name (e.g. "Clif's Foot Spa (Plano)") remains as stored, not translated |
| 3e-EDGE-17 | Customer names not translated | Open Customer List or Checkin page | Customer names display as entered (English names stay English) |
| 3e-EDGE-18 | Timestamps not translated | View time values on Customer List | Time values use consistent format (not locale-dependent translation) |

---

## 6. Translation Completeness

### 6a. zh.ts Required Keys

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-COMP-01 | Navigation keys exist | Inspect `zh.ts` | Contains keys for: "客户列表", "管理", "结账关店", "主页", "返回" |
| 3e-COMP-02 | Button keys exist | Inspect `zh.ts` | Contains keys for: "确认签到", "新客户", "立即签名", "同步设备", "签名并继续", "签名完成", "清除", "登录", "同步" |
| 3e-COMP-03 | Table header keys exist | Inspect `zh.ts` | Contains keys for: "客户", "电话", "上次服务", "技师", "时间", "健康" |
| 3e-COMP-04 | Label keys exist | Inspect `zh.ts` | Contains keys for: "服务类型", "技师", "手机号", "输入 PIN", "使用手法", "按摩部位", "技师签名", "健康摘要" |
| 3e-COMP-05 | Status keys exist | Inspect `zh.ts` | Contains keys for: "已完成", "已取消", "活跃", "待签名" |
| 3e-COMP-06 | Health condition keys exist | Inspect `zh.ts` | Contains keys for: "高血压", "心脏疾病", "怀孕", "糖尿病", "脊椎问题", "无过敏", "避开区域" |
| 3e-COMP-07 | Prompt/message keys exist | Inspect `zh.ts` | Contains keys for: "N 条来访待技师签名", "未找到客户", "请先完成或取消待签名来访", "PIN 错误" |
| 3e-COMP-08 | Admin panel keys exist | Inspect `zh.ts` | Contains keys for: "管理员面板", "我的店铺", "新建店铺", "账号设置", "数据导出" |
| 3e-COMP-09 | Landing page keys exist | Inspect `zh.ts` | Contains keys for: "同步设备", "管理员入口", "设备和店铺管理", "使用邀请码注册" |
| 3e-COMP-10 | Checkin page keys exist | Inspect `zh.ts` | Contains keys for: "确认签到", "更新健康表", "上次来访", "总来访次数" |
| 3e-COMP-11 | Therapist page keys exist | Inspect `zh.ts` | Contains keys for: "今日待签名", "签名", "队列" |

### 6b. en.ts Required Keys

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-COMP-12 | Form title keys exist | Inspect `en.ts` | Contains keys for: "Personal Information", "Health Information", "Massage Preferences", "Consent & Signature" |
| 3e-COMP-13 | Field label keys exist | Inspect `en.ts` | Contains keys for: "First Name", "Last Name", "Phone", "Email", "Address", "Date of Birth", "Gender" |
| 3e-COMP-14 | Health option keys exist | Inspect `en.ts` | Contains keys for: "Spinal Problems", "High Blood Pressure", "Pregnant", etc. |
| 3e-COMP-15 | Consent text key exists | Inspect `en.ts` | Contains CONSENT_TEXT or equivalent key with all 4 English legal paragraphs |
| 3e-COMP-16 | Navigation button keys exist | Inspect `en.ts` | Contains keys for: "Next", "Back", "Submit", "Save & Sign" |
| 3e-COMP-17 | ThankYou page keys exist | Inspect `en.ts` | Contains keys for: "Thank you, {name}!", "Your form has been submitted successfully.", "Next Client", "Please return the iPad to our staff." |
| 3e-COMP-18 | Minor checkbox key exists | Inspect `en.ts` | Contains key for: "I am under 17 years old" |
| 3e-COMP-19 | Step indicator key exists | Inspect `en.ts` | Contains key for: "Step {n} of 4" or equivalent pattern |

### 6c. Cross-Locale Key Parity for Shared Concepts

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| 3e-COMP-20 | Health conditions: parity | Compare health condition keys in `zh.ts` and `en.ts` | Every health condition present in `en.ts` has a corresponding entry in `zh.ts` and vice versa |
| 3e-COMP-21 | Massage types: parity | Compare massage type keys in `zh.ts` and `en.ts` | Every massage type present in `en.ts` has a corresponding entry in `zh.ts` |
| 3e-COMP-22 | No orphan keys | Run automated check | No key exists in only one locale file without a corresponding entry in the other (for shared concept keys) |

---

## Summary

| Category | Test Count |
|----------|-----------|
| 1. Infrastructure | 14 |
| 2. Chinese Coverage | 67 (ZH-01 through ZH-67) |
| 3. English Preservation | 28 (EN-01 through EN-28) |
| 4. Boundary Transitions | 10 |
| 5. Edge Cases | 18 |
| 6. Translation Completeness | 22 |
| **Total** | **159** |
