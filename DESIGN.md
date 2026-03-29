# 按摩店客户管理系统 — 设计概念文档

> 版本：v0.7（表单提交即创建 visit，取消 pending-checkin，visit 取消功能）
> 更新日期：2026-03-29
> 状态：开发就绪，可进入 Phase 1

---

## 一、项目背景与目标

### 背景
按摩店需要对每位顾客进行健康问卷的采集与管理。目前依赖纸质表单（Clif's Foot Spa Massage Therapy Consultation Document），存在以下问题：
- 老客户每次来访都要重复填写
- 纸质表单难以跨店共享和检索
- 无法快速统计来访记录
- 签名和知情同意件不便留存

### 目标
1. 新客户首次来访时由客户本人在 iPad 上完成电子问卷
2. 老客户来访时 prefill 旧表格，可编辑，一键确认签到
3. 多门店共用客户数据，统一管理
4. 技师在服务后即时完成技师记录；待签队列防止遗忘
5. 单台 iPad 安全地在客户/员工之间流转；支持未来多台 iPad 协作

### 核心设计原则
- **iPad 优先**：所有交互以触摸屏操作为标准
- **便利优先**：认证和操作流程以方便为第一优先
- **零运维成本**：全部托管在 Cloudflare
- **法律合规**：完整保留知情同意内容和签名

---

## 二、技术选型

### 整体架构

```
[iPad A / iPad B / 任意浏览器]
        |
        | HTTPS
        v
[Cloudflare Pages]  —— 前端 PWA
        |
        | fetch /api/*
        v
[Cloudflare Workers]  —— API（Hono）
        |
        | D1 binding
        v
[Cloudflare D1]  —— SQLite
```

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18+ | UI 框架 |
| TypeScript | 5+ | 类型安全 |
| Vite | 5+ | 构建工具 |
| TailwindCSS | 3+ | 触摸友好 UI |
| React Hook Form | 7+ | 表单管理，多步骤共享 form context |
| Zod | 3+ | 表单验证（前后端共用） |
| TanStack Query | 5+ | API 缓存与状态管理 |
| Zustand | 4+ | 全局状态（session + staffUnlocked） |
| React Router | 6+ | 路由 |
| vite-plugin-pwa | 最新 | Service Worker |
| react-signature-canvas | 最新 | 电子签名 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Cloudflare Workers | — | 无服务器运行环境 |
| Hono | 4+ | 轻量 API 框架 |
| Cloudflare D1 | — | SQLite 数据库 |
| Zod | 3+ | 请求体验证 |

---

## 三、认证设计 — 门店日次 PIN Session

### Session 生命周期

```
[早上]  输入门店 PIN → JWT (storeId + sessionDate + sessionStartAt, exp +36h)
              ↓
        [正常营业]
              ↓
[晚上]  Close Out（需技师队列清空）→ 清空 session → 返回 PIN 页
```

### "当日"边界

以 `sessionStartAt`（UTC）为界，不依赖 UTC 午夜。过了 0 点只要未 Close Out，来访仍属当日 session。

### 门店 PIN

- 存储在 `stores.pin_hash`（bcrypt）
- 初始 PIN 由 `seed.sql` 设置，可通过 `/settings` 修改
- 修改需先验证当前 PIN

### Session 中间件

```typescript
export const sessionMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'No active session' }, 401)
  const payload = verifyJWT(token, c.env.JWT_SECRET)
  if (!payload) return c.json({ error: 'Session expired' }, 401)
  c.set('session', {
    storeId: payload.storeId,
    sessionDate: payload.sessionDate,
    sessionStartAt: payload.sessionStartAt,
  })
  await next()
}
```

---

## 四、设备与交互模型

### 核心问题

一台 iPad 在三种角色之间流转：客户（填表签名）、前台（签到管理）、技师（服务记录）。
客户使用 iPad 时不应看到系统其他功能；员工拿回 iPad 后应无障碍恢复操作。

### 解决方案：PIN 领地门控

**一个 boolean `staffUnlocked` 控制一切。**

- `staffUnlocked = true`（默认，PIN 输入后）→ 所有页面可访问
- `staffUnlocked = false`（进入填表流程后）→ 只有填表相关页面可访问，其他页面自动弹出 PIN 输入框

**规则极简：**
- **进入填表** = 设备给到客户（staffUnlocked → false）
- **输入 PIN** = 设备回到员工（staffUnlocked → true）
- 中间没有"确认切换"、没有"模式按钮"，PIN 是唯一的钥匙

### 页面分区

```
┌── 客户领地（staffUnlocked = false 可访问）──────────────────┐
│  /intake/new              新客户4步向导                      │
│  /intake/:customerId/edit 老客户健康编辑                     │
│  /intake/thankyou         提交成功（含"下一位客户"按钮）       │
└─────────────────────────────────────────────────────────────┘

┌── 员工领地（需 staffUnlocked = true，否则弹 PIN 输入）──────┐
│  /                        主界面（客户查找 + 待签名）        │
│  /customer/:id/checkin    老客户签到                         │
│  /therapist-queue         技师签名队列                       │
│  /visits/:visitId/therapist  技师记录填写                    │
│  /customer/:id            客户档案                          │
│  /admin                   管理后台                          │
│  /settings                门店设置                          │
└─────────────────────────────────────────────────────────────┘
```

### `staffUnlocked` 状态机

```
         [每日 PIN 开启 session]
                  ↓
           staffUnlocked = true
                  │
    ┌─────────────┼────────────────────────────┐
    │             │                            │
  员工操作      "New Client" 或              技师操作
  查找/签到    "Update Health Form"          签名队列
  管理后台       │                          (staffUnlocked
  取消 visit    ↓                            仍为 true)
    │    员工选技师 → staffUnlocked = false
    │           │
    │      客户填表 → 提交（自动创建 visit）
    │      → 下一位客户 → 提交
    │      → ...
    │           │
    │      任何员工领地导航
    │           ↓
    │      PIN 输入框弹出
    │           ↓
    └──── staffUnlocked = true
```

> **技师操作不触发 staffUnlocked 变更**，因为技师是员工，使用的是员工领地页面。

### 前端实现

```typescript
// Zustand store
interface AppState {
  session: { token: string; storeId: string; sessionDate: string; sessionStartAt: string } | null
  staffUnlocked: boolean  // PIN 输入后 true，进入填表后 false
  setStaffUnlocked: (v: boolean) => void
  // 员工在递 iPad 前预选，客户提交时一并发送
  pendingAssignment: { serviceType: string; therapistName: string } | null
  setPendingAssignment: (v: { serviceType: string; therapistName: string } | null) => void
}

// 路由守卫组件
function StaffGuard({ children }: { children: ReactNode }) {
  const { staffUnlocked, session } = useAppStore()
  if (!session) return <Navigate to="/pin" />
  if (!staffUnlocked) return <PinPrompt />  // 输入 PIN → setStaffUnlocked(true)
  return children
}

// 路由定义
<Route path="/intake/*" element={children} />          {/* 无守卫，客户领地 */}
<Route path="/" element={<StaffGuard><Main/></StaffGuard>} />
<Route path="/therapist-queue" element={<StaffGuard>...</StaffGuard>} />
// ... 所有员工领地路由都包 StaffGuard
```

### 多设备协作

同一家门店可以有多台 iPad 同时运行。

| 维度 | 设计 |
|------|------|
| Session | 每台 iPad 独立输入 PIN，各自获得 JWT。后端无状态，不跟踪设备。 |
| staffUnlocked | 每台设备独立（Zustand + localStorage）。iPad A 在客户领地不影响 iPad B。 |
| 数据同步 | D1 是唯一数据源。TanStack Query `refetchInterval: 30000`（30秒）轮询待分配和待签名计数。 |
| 实时性 | 无 WebSocket。iPad A 创建的来访记录，iPad B 在 30 秒内可见。对小型门店足够。 |
| Close Out | 每台设备独立。任意一台 Close Out 只清空自己的 session，不影响其他设备。 |

**典型多设备分工（软分配，非强制）：**

| iPad | 主要角色 | 场景 |
|------|---------|------|
| iPad A（前台柜台） | 员工操作 | 查客户、老客户签到、分配技师、管理 |
| iPad B（候客区）| 客户填表 | 长期在客户领地，连续多人填表 |
| iPad C（技师休息区）| 技师签名 | 主要在 `/therapist-queue`，批量签名 |

---

## 五、数据库设计

### 表结构总览

```
stores
  ↑
  └── visits ──→ customers ←── intake_forms
```

> 无 `staff` 表。技师身份以 `visits.therapist_name` 自由文本为准。

### 详细表结构

#### `stores`

```sql
CREATE TABLE stores (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name       TEXT NOT NULL,
  address    TEXT,
  phone      TEXT,
  pin_hash   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER stores_updated_at AFTER UPDATE ON stores
  BEGIN UPDATE stores SET updated_at = datetime('now') WHERE id = NEW.id; END;
```

#### `customers`

```sql
CREATE TABLE customers (
  id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  phone                   TEXT NOT NULL UNIQUE,
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  email                   TEXT,
  address                 TEXT,
  date_of_birth           TEXT,
  gender                  TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name  ON customers(last_name, first_name);

CREATE TRIGGER customers_updated_at AFTER UPDATE ON customers
  BEGIN UPDATE customers SET updated_at = datetime('now') WHERE id = NEW.id; END;
```

#### `intake_forms`

```sql
CREATE TABLE intake_forms (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  store_id         TEXT NOT NULL REFERENCES stores(id),
  form_version     INTEGER NOT NULL DEFAULT 1,
  form_data        TEXT NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'draft',
    -- 'draft'         填写中
    -- 'client_signed' 客户已提交并签名
    -- 'completed'     客户签名 + 首次技师记录完成
  client_signed_at    TEXT,
  last_reviewed_at    TEXT,
  completed_at        TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(customer_id)
);

CREATE INDEX idx_intake_forms_customer ON intake_forms(customer_id);

CREATE TRIGGER intake_forms_updated_at AFTER UPDATE ON intake_forms
  BEGIN UPDATE intake_forms SET updated_at = datetime('now') WHERE id = NEW.id; END;
```

> `completed_at` 触发：`PATCH /api/visits/:id/therapist` 时检查该客户 intake_forms，
> 若 status 为 `client_signed` 则更新为 `completed`。

#### `visits`

```sql
CREATE TABLE visits (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  store_id         TEXT NOT NULL REFERENCES stores(id),
  visit_date       TEXT NOT NULL DEFAULT (datetime('now')),
  service_type     TEXT,
  therapist_name   TEXT,
  notes            TEXT,
  therapist_service_technique   TEXT,
  therapist_body_parts_notes    TEXT,
  therapist_signature_data_url  TEXT,
  therapist_signed_at           TEXT,
  cancelled_at     TEXT,
    -- 非 NULL 表示该 visit 已取消（无需技师签名）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_visits_customer  ON visits(customer_id);
CREATE INDEX idx_visits_store     ON visits(store_id);
CREATE INDEX idx_visits_date      ON visits(visit_date DESC);
CREATE INDEX idx_visits_therapist ON visits(therapist_name);
```

---

## 六、表单字段规划（基于实际纸质表单）

### 填写主体划分

| 主体 | 内容 | 数据去向 |
|------|------|---------|
| 客户自填并提交 | 个人信息、健康状况、按摩偏好、同意书、签名 | `customers` + `intake_forms.form_data` |
| 技师服务后填写 | 服务技术、身体部位、技师签名 | `visits` |

### Step 1 → `customers` 表

| 字段 | 数据库列 | 必填 |
|------|---------|------|
| First Name / Last Name | `first_name` + `last_name` | 是 |
| Phone # | `phone` | 是 |
| Email | `email` | 否 |
| Address | `address` | 否 |
| Date of Birth | `date_of_birth` | 否（扩展） |
| Gender | `gender` | 否（扩展） |
| Emergency Contact | `emergency_contact_name` + `_phone` | 否（扩展） |
| Under 17? | `form_data.isMinor` | 是 |
| Guardian Name | `form_data.guardianName` | isMinor 时必填 |

### `intake_forms.form_data` 完整 Schema

```typescript
interface IntakeFormData {
  // 健康复选框
  hasSpinalProblems:      boolean
  hasAllergies:           boolean
  hasHighBloodPressure:   boolean
  hasBruiseEasily:        boolean
  hasVaricoseVeins:       boolean
  hasMigraines:           boolean
  hasHeartConditions:     boolean
  hasInjuries:            boolean

  // 怀孕
  isPregnant:             boolean
  pregnancyDueDate:       string | null

  // 医疗备注
  medicalNotes:           string

  // 按摩偏好
  preferredMassageType:
    | 'swedish_relaxation' | 'deep_tissue' | 'trigger_point'
    | 'pregnancy' | 'hot_stone' | 'other'
  areasOfPainTension:     string
  areasToAvoid:           string

  // 未成年人
  isMinor:                boolean
  guardianName:           string | null
  guardianSignatureDataUrl: string | null

  // 同意书
  consentAcknowledged:    boolean
  clientSignatureDataUrl: string

  // 员工备注（API 返回给客户领地时 strip）
  staffNotes:             string
}
```

### 同意书原文（`CONSENT_TEXT` 常量）

```
段落一：Massage therapy is not a substitute for medical examination or diagnosis. It is
recommended that I see a physician for any physical ailment that I may have. I understand
that the massage therapist does not prescribe medical treatments or pharmaceuticals and
does not perform any spinal adjustments. I am aware that if I have any serious medical
diagnosis, I must provide a physician's written consent prior to services.

段落二（粗体）：The licensee shall drape the breasts of all female clients and not engage
in breast massage of female clients unless the client gives written consent before each
session involving breast massage.

段落三（粗体）：Draping of the genital area and gluteal cleavage will be used at all
times during the session for all clients.

段落四（粗体）：The licensee must immediately end the massage session if a client
initiates any verbal or physical contact that is sexual in nature. If the client is
uncomfortable for any reason, the client may ask the licensee to end the massage, and
the licensee will end the session. The licensee also has a right to end the session if
uncomfortable for any reason.
```

### `visits` 技师字段

| 纸质字段 | 数据库列 |
|---------|---------|
| Type of massage service/technique | `therapist_service_technique` |
| Parts of the body (incl. indications/contraindications) | `therapist_body_parts_notes` |
| Licensee signature | `therapist_signature_data_url` |
| Date | `therapist_signed_at`（自动） |

---

## 七、前端页面设计

### 主界面结构

```
┌──────────────────────────────────────────────────────────────┐
│  Clif's Foot Spa (Plano)                    [Admin] [Close] │
│                                                              │
│  ┌── 待签名（技师服务后补签）──────────────────────────┐     │
│  │ ⚠ 3 visits awaiting therapist signature             │     │
│  │                                    [Sign Now →]     │     │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ 客户查找 ─────────────────────────────────────────┐     │
│  │  [  输入手机号  ]         [New Client 📋]           │     │
│  │  ┌───┬───┬───┐                                     │     │
│  │  │ 1 │ 2 │ 3 │           NumPad                    │     │
│  │  ├───┼───┼───┤                                     │     │
│  │  │ 4 │ 5 │ 6 │                                     │     │
│  │  ├───┼───┼───┤                                     │     │
│  │  │ 7 │ 8 │ 9 │                                     │     │
│  │  ├───┼───┼───┤                                     │     │
│  │  │   │ 0 │ ⌫ │                                     │     │
│  │  └───┴───┴───┘                                     │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### 核心流程总览

```
[PIN 输入] → staffUnlocked = true → [主界面]
    │
    ├── "New Client" → 员工选技师 → staffUnlocked = false → [客户填表] → 提交（自动创建 visit）
    │
    ├── 手机号找到 → [老客户签到]
    │       ├── 无变更 → [一键签到]（全程员工领地，自动创建 visit）
    │       └── 有变更 → staffUnlocked = false → [客户编辑] → ... → [PIN] → [签到]
    │
    ├── 待签名横幅 → [技师签名队列] → [Sign & Next]
    │
    └── Close Out → 检查待签名队列 → 清空 session
```

---

### 流程 A：新客户填表 + 多客连续填表

```
[员工领地：主界面]
  员工点击 [New Client]
  → 弹出预分配面板：
    Service Type   [Deep Tissue      ▾]
    Therapist      [Mike              ]
    [Start Form →]
  → 前端暂存 { serviceType, therapistName } 到 Zustand
  → staffUnlocked = false
  → 员工把 iPad 递给客户
    ↓
[客户领地：/intake/new]
  Step 1 基本信息（姓名、手机、邮箱、地址、扩展字段、未成年人）
  Step 2 健康状况（8个复选框、怀孕、医疗备注）
  Step 3 按摩偏好（服务类型、疼痛区域、避开区域）
  Step 4 同意书 + 签名
    ↓ 客户提交
  POST /api/customers → 创建 customer + intake_form + visit（一个事务）
    ↓
[客户领地：/intake/thankyou]
┌──────────────────────────────────────────────┐
│  ✓  Thank you, Jane!                        │
│     Your form has been submitted.            │
│                                              │
│  [Next Client →]     ← 下一位新客户直接填表  │
│                                              │
│     ──── or ────                             │
│                                              │
│  Please return the iPad to our staff.        │
└──────────────────────────────────────────────┘
  • [Next Client] → 清空表单 → 回到 Step 1，staffUnlocked 仍为 false
    （新客户使用上一次相同的 serviceType + therapistName，员工也可以在递 iPad 前改）
  • 如果员工拿回 iPad 并访问主界面 → PIN 弹出 → staffUnlocked = true
```

> **表单提交即完成签到：** 客户提交后 visit 已创建，技师已分配。
> 技师不需要立即在前端签名 — 忙的时候可以通过待签名队列补签。
> **"Next Client" 连续填表** 仍支持多人连续填，所有 visit 自动创建。

---

### 流程 B：老客户签到

```
[员工领地：主界面]
  输入手机号 → 找到客户
    ↓
[员工领地：/customer/:id/checkin]
┌───────────────────────────────────────────────────┐
│  Jane Smith            Last visit: 2026-03-15     │
│  Total visits: 8                                  │
│                                                   │
│  ┌── Health Summary ────────────────────────┐     │
│  │ ⚠ High Blood Pressure                   │     │
│  │ ✓ No injuries · No pregnancy            │     │
│  │ Avoid: lower back area                  │     │
│  │                      [Review Full Form →]│     │
│  └──────────────────────────────────────────┘     │
│                                                   │
│  Service Type   [Deep Tissue      ▾]              │
│  Therapist      [Mike              ]              │
│                                                   │
│  [Confirm Check-In]                               │
│  [Update Health Form → hand iPad to client]       │
└───────────────────────────────────────────────────┘
```

**路径 B-1：无变更（全程员工领地，iPad 不离手）**

```
员工点击 [Confirm Check-In]
  → PATCH /api/customers/:id/intake/review  (刷新 last_reviewed_at)
  → POST  /api/customers/:id/visits         (service_type + therapist_name)
  → [签到成功] → 返回主界面
```

**路径 B-2：有变更（iPad 交给客户编辑）**

```
员工点击 [Update Health Form]
  → staffUnlocked = false
  → 员工把 iPad 递给客户
    ↓
[客户领地：/intake/:customerId/edit]
  单页预填所有健康字段，客户修改
    ↓ 提交
  变更 diff 展示 + 同意书 + 重签（SignaturePad）
    ↓
  PUT /api/customers/:id/intake → 更新 form_data + client_signed_at
    ↓
[客户领地：/intake/thankyou]
  "Changes saved! Please return the iPad to our staff."
  [Next Client →]  ← 如果其他客户也要填/改
    ↓ 员工拿回 iPad → PIN
[员工领地：主界面]
  员工重新搜索该客户 → 走 B-1 签到（创建 visit）
```

---

### 流程 C：技师签名队列

全程在员工领地，不涉及 staffUnlocked 变更。

**技师队列页 `/therapist-queue`：**
```
今日待签（visit_date >= sessionStartAt，therapist_signed_at IS NULL，cancelled_at IS NULL）

 1/3  Jane Smith    Swedish/Relaxation    2:30 PM   [Sign →]
 2/3  Bob Jones     Deep Tissue           2:45 PM   [Sign →]
 3/3  Mary Lee      Hot Stone             3:00 PM   [Sign →]
```

**技师记录页 `/visits/:visitId/therapist`：**
```
← 队列 (1/3)

Client: Jane Smith    Service: Swedish/Relaxation    2:30 PM
Health: ⚠ High Blood Pressure · Avoid: lower back

Technique used: [_______________________________________]
Body parts massaged: [__________________________________]

Licensee Signature:
┌────────────────────────────────────────┐
│              [签名画布]                 │
└────────────────────────────────────────┘

[Sign & Next →]    ← 最后一条: [Sign & Done ✓]
```

> PATCH /api/visits/:id/therapist 返回 `nextPendingVisitId`，前端自动跳转。
> 同时联动 intake_forms.status → completed（若为 client_signed）。

---

### 流程 D：Visit 取消

客户填了表、visit 已创建，但实际未做服务（如临时取消、等太久离开等）。

```
[员工领地：客户档案或来访记录]
  找到对应 visit → [Cancel Visit]
  → 确认弹窗："Cancel this visit? This cannot be undone."
  → PATCH /api/visits/:id/cancel
  → visit.cancelled_at = now()
  → 已取消的 visit 不出现在待签名队列中
  → 来访历史中标记为 "Cancelled"
```

> **取消不需要技师签名**，只留一条 DB 记录。已取消的 visit 在管理后台可见可导出。

---

### 流程 E：结账（Close Out Day）

```
[主界面] → [Close Out Day]
  → 检查待签名（排除已取消 visit）
  ├── 不为空 → "N visits awaiting therapist signature. Please complete or cancel first."
  └── 全部清空 → [Confirm Close Out] → 清空 session → /pin
```

---

### 管理后台（`/admin`）

员工领地，session 激活后可访问。

**① 客户列表 Tab：** 搜索（姓名/手机）、过滤（来访日期区间）、列：姓名/手机/最近来访/技师/次数

**② 来访记录 Tab：** 过滤（日期/技师/服务类型）、列：日期/客户/服务/技师/签名状态

**③ 导出 Tab：** 客户 CSV + 来访 CSV（签名字段导出为 Yes/No，不含 base64）

---

### 页面清单

| 页面 | 路由 | 领地 | 功能 |
|------|------|------|------|
| PIN 输入 | `/pin` | — | 日次 session 开启 |
| 主界面 | `/` | 员工 | 客户查找 + 待签名横幅 |
| 新客户填表 | `/intake/new` | 客户 | 4步向导 |
| 老客户健康编辑 | `/intake/:customerId/edit` | 客户 | 单页预填 + diff + 重签 |
| 提交成功 | `/intake/thankyou` | 客户 | "Next Client" 或 "请交回 iPad" |
| 老客户签到 | `/customer/:id/checkin` | 员工 | 健康摘要 + 一键签到 |
| 技师签名队列 | `/therapist-queue` | 员工 | 今日待签列表 |
| 技师记录 | `/visits/:visitId/therapist` | 员工 | 技师填写 + Sign & Next |
| 客户档案 | `/customer/:id` | 员工 | 表单查看 + 来访历史 |
| 管理后台 | `/admin` | 员工 | 查询 + 导出 |
| 门店设置 | `/settings` | 员工 | PIN 修改 |

### 关键组件

| 组件 | 说明 |
|------|------|
| `StaffGuard` | 路由守卫：staffUnlocked=false 时弹出 PinPrompt |
| `PinPrompt` | 弹窗式 PIN 输入（复用 PinPad 样式），输入正确 → staffUnlocked=true |
| `PinPad` | 全屏 PIN 输入页面（/pin 使用） |
| `NumPad` | 手机号输入键盘 |
| `PendingSignatureBanner` | 主界面待签名横幅（排除已取消 visit） |
| `NewClientPreAssign` | "New Client" 弹出面板：选 service type + therapist name → 暂存 Zustand |
| `FormWizard` | 新客户4步向导（单一 RHF context 跨步骤） |
| `HealthForm` | 老客户单页编辑（复用 Step2+3 字段） |
| `FormDiff` | 变更字段对比展示 |
| `AutoSave` | 500ms 防抖草稿保存 |
| `SignaturePad` | 封装 react-signature-canvas |
| `ConsentText` | 同意书全文展示 |
| `CustomerCard` | 客户摘要卡片 |
| `HealthAlertBadge` | 高风险条目 Badge |
| `VisitHistory` | 来访时间线 |
| `AdminTable` | 可过滤可排序表格 |
| `CsvExportButton` | CSV 下载触发 |

---

## 八、API 设计

### 接口总览

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/auth/store-pin` | PIN 验证，开启 session |
| `POST` | `/api/auth/closeout` | 结账 |
| `GET` | `/api/customers/search?phone=` | 手机号查找（含健康摘要） |
| `POST` | `/api/customers` | 创建新客户 + intake_form + **visit**（一个事务） |
| `GET` | `/api/customers/:id` | 客户详情 |
| `PUT` | `/api/customers/:id` | 更新基本信息 |
| `GET` | `/api/customers/:id/intake` | 获取完整表单（strip staffNotes） |
| `PUT` | `/api/customers/:id/intake` | 有变更重签 |
| `PATCH` | `/api/customers/:id/intake/review` | 无变更 proceed |
| `POST` | `/api/customers/:id/visits` | 创建 visit（老客户签到时调用） |
| `GET` | `/api/customers/:id/visits` | 来访历史 |
| `GET` | `/api/visits/:id` | 单条来访详情 |
| `PATCH` | `/api/visits/:id/therapist` | 技师记录 + 签名 |
| `PATCH` | `/api/visits/:id/cancel` | **取消 visit** |
| `GET` | `/api/stores/:id/visits/pending-therapist?since=` | 待签名来访列表（排除已取消） |
| `GET` | `/api/stores` | 门店列表 |
| `PUT` | `/api/stores/:id/pin` | 修改 PIN |
| `GET` | `/api/admin/customers` | 管理后台客户查询 |
| `GET` | `/api/admin/visits` | 管理后台来访查询 |
| `GET` | `/api/admin/export/customers` | CSV 客户 |
| `GET` | `/api/admin/export/visits` | CSV 来访 |

### 关键接口

#### POST /api/auth/store-pin
```
{ "storeId": "store_plano", "pin": "1234" }
→ 200: { "token": "<JWT>", "storeName": "Clif's Foot Spa (Plano)", "sessionDate": "2026-03-29" }
→ 401: { "error": "Invalid PIN" }
```

#### POST /api/customers（客户提交表单，同时创建 visit）
```
{
  "firstName": "Jane", "lastName": "Smith",
  "phone": "2145551234", "email": "jane@example.com",
  "address": "123 Main St", "dateOfBirth": "1990-05-20",
  "gender": "female",
  "emergencyContactName": "John Smith", "emergencyContactPhone": "2145559999",
  "intakeFormData": { ...完整 IntakeFormData... },
  "firstVisit": {
    "serviceType": "deep_tissue",
    "therapistName": "Mike"
  }
}

→ 201: { "customerId": "c_new", "intakeFormId": "f_new", "visitId": "v_new" }
→ 200: { "existing": true, "customerId": "c_abc" }   // 手机号已存在
```

> **一个事务创建三条记录：** customer + intake_form(status: client_signed) + visit。
> `firstVisit` 中的 serviceType 和 therapistName 由员工在递出 iPad 前选择，前端暂存在 Zustand。
> 手机号已存在时返回 200 + existing flag，前端在 /intake/thankyou 页面提示该客户已注册。

#### PATCH /api/visits/:id/cancel（取消 visit）
```
PATCH /api/visits/v_123/cancel

→ 200: { "cancelledAt": "2026-03-29T16:00:00Z" }
→ 409: { "error": "Visit already signed by therapist" }  // 已签名不能取消
→ 409: { "error": "Visit already cancelled" }
```

> 取消条件：therapist_signed_at IS NULL 且 cancelled_at IS NULL。
> 取消后 visit 不再出现在待签名队列，但在来访历史和管理后台中可见（标记 "Cancelled"）。

#### POST /api/customers/:id/visits（老客户签到）
```
{ "serviceType": "deep_tissue", "therapistName": "Mike" }

→ 201: { "visitId": "v_new", "visitDate": "2026-03-29T15:00:00Z" }
```

> storeId 来自 JWT，无需在 body 中传递。

#### PATCH /api/visits/:id/therapist（Sign & Next）
```
{
  "therapistServiceTechnique": "Deep tissue, shoulders and upper back",
  "therapistBodyPartsNotes": "Upper back, shoulders. Avoid cervical.",
  "therapistSignatureDataUrl": "data:image/png;base64,..."
}

→ 200: { "therapistSignedAt": "...", "nextPendingVisitId": "v_002" | null }
```

#### GET /api/customers/search?phone=（含健康摘要）
```
GET /api/customers/search?phone=2145551234

→ 200: {
  "customer": {
    "id": "a1b2c3", "firstName": "Jane", "lastName": "Smith",
    "phone": "2145551234",
    "lastVisit": "2026-03-15T14:30:00Z", "lastTherapist": "Mike",
    "totalVisits": 8, "intakeStatus": "completed",
    "preferredMassageType": "deep_tissue",
    "healthAlerts": { "hasHighBloodPressure": true, ... , "areasToAvoid": "lower back" }
  }
}
→ 404: { "error": "Customer not found" }
```

#### GET /api/admin/customers + visits
```
GET /api/admin/customers?search=jane&lastVisitAfter=2026-01-01&page=1&pageSize=20
GET /api/admin/visits?dateFrom=2026-03-01&dateTo=2026-03-29&therapistName=Mike&page=1&pageSize=50
GET /api/admin/export/customers  → CSV
GET /api/admin/export/visits?dateFrom=&dateTo=  → CSV
```

### Workers 路由

```typescript
const app = new Hono<{ Bindings: { DB: D1Database; JWT_SECRET: string } }>()

app.use('*', cors())
app.post('/api/auth/store-pin', authHandler)

app.use('/api/*', sessionMiddleware)
app.post('/api/auth/closeout', closeoutHandler)
app.route('/api/customers', customersRouter)
app.route('/api/visits',    visitsRouter)
app.route('/api/stores',    storesRouter)
app.route('/api/admin',     adminRouter)

export default app
```

---

## 九、PWA 配置

### manifest.json
```json
{
  "name": "Clif's Foot Spa — Client Manager",
  "short_name": "Spa CRM",
  "display": "standalone",
  "orientation": "landscape",
  "start_url": "/",
  "background_color": "#ffffff",
  "theme_color": "#1a1a2e"
}
```

### 缓存策略

| 资源 | 策略 |
|------|------|
| HTML/JS/CSS | Cache First（离线可打开） |
| API | Network First |
| 表单草稿 | localStorage 双写 |
| 签名 | 不缓存，直接 POST |

---

## 十、项目目录结构

```
spa-crm/
├── packages/
│   ├── shared/src/
│   │   ├── types.ts
│   │   ├── schemas.ts
│   │   └── constants.ts
│   │
│   ├── api/src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── auth.ts         # store-pin, closeout
│   │   │   ├── customers.ts    # search, create, get, update
│   │   │   ├── intake.ts       # get, put, patch/review
│   │   │   ├── visits.ts       # create, list, get/:id, PATCH therapist
│   │   │   ├── stores.ts       # pending-therapist, PUT pin
│   │   │   └── admin.ts        # queries, CSV export
│   │   ├── middleware/
│   │   │   ├── session.ts
│   │   │   └── cors.ts
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   └── seed.sql
│   │   └── lib/
│   │       ├── jwt.ts
│   │       ├── hash.ts
│   │       └── csv.ts
│   │
│   └── web/src/
│       ├── store/appStore.ts   # Zustand: session + staffUnlocked
│       ├── components/
│       │   ├── ui/
│       │   ├── StaffGuard.tsx
│       │   ├── PinPrompt.tsx
│       │   ├── PinPad.tsx
│       │   ├── NumPad.tsx
│       │   ├── PendingSignatureBanner.tsx
│       │   ├── NewClientPreAssign.tsx
│       │   ├── FormWizard.tsx
│       │   ├── HealthForm.tsx
│       │   ├── FormDiff.tsx
│       │   ├── AutoSave.tsx
│       │   ├── SignaturePad.tsx
│       │   ├── ConsentText.tsx
│       │   ├── CustomerCard.tsx
│       │   ├── HealthAlertBadge.tsx
│       │   ├── VisitHistory.tsx
│       │   ├── AdminTable.tsx
│       │   └── CsvExportButton.tsx
│       └── pages/
│           ├── PinPage.tsx
│           ├── CustomerLookup.tsx
│           ├── IntakeForm.tsx
│           ├── IntakeEdit.tsx
│           ├── IntakeThankYou.tsx
│           ├── ReturnCheckin.tsx
│           ├── TherapistQueuePage.tsx
│           ├── TherapistRecordPage.tsx
│           ├── CustomerProfile.tsx
│           ├── AdminPage.tsx
│           └── StoreSettings.tsx
```

### 常量

```typescript
export const MASSAGE_TYPES = [
  { value: 'swedish_relaxation', label: 'Swedish / Relaxation' },
  { value: 'deep_tissue',        label: 'Deep Tissue' },
  { value: 'trigger_point',      label: 'Trigger Point' },
  { value: 'pregnancy',          label: 'Pregnancy' },
  { value: 'hot_stone',          label: 'Hot Stone' },
  { value: 'other',              label: 'Other' },
] as const

export const HEALTH_CONDITIONS = [
  { key: 'hasSpinalProblems',    label: 'Spinal Problems' },
  { key: 'hasAllergies',         label: 'Allergies' },
  { key: 'hasHighBloodPressure', label: 'High Blood Pressure' },
  { key: 'hasBruiseEasily',      label: 'Bruise Easily' },
  { key: 'hasVaricoseVeins',     label: 'Varicose Veins' },
  { key: 'hasMigraines',         label: 'Migraines' },
  { key: 'hasHeartConditions',   label: 'Heart Conditions' },
  { key: 'hasInjuries',          label: 'Injuries' },
] as const

export const HIGH_RISK_CONDITIONS = [
  'hasHighBloodPressure', 'isPregnant',
  'hasHeartConditions', 'hasInjuries', 'hasVaricoseVeins',
] as const

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not', label: 'Prefer not to say' },
] as const
```

---

## 十一、部署配置

### seed.sql

```sql
INSERT INTO stores (id, name, address, phone, pin_hash) VALUES
  ('store_plano',
   'Clif''s Foot Spa (Plano)',
   '6505 W Park Blvd #338, Plano, TX 75093',
   '(972) 473-3337',
   '<bcrypt hash of "1234">'),
  ('store_carrollton',
   'Clif''s Foot Spa (Carrollton)',
   '2625 Old Denton Rd #558, Carrollton, TX 75007',
   '(972) 323-2044',
   '<bcrypt hash of "1234">');
```

### 部署命令

```bash
wrangler d1 create spa-crm-db && wrangler d1 create spa-crm-db-dev
wrangler d1 execute spa-crm-db     --file=./packages/api/src/db/schema.sql
wrangler d1 execute spa-crm-db-dev --file=./packages/api/src/db/schema.sql
wrangler d1 execute spa-crm-db     --file=./packages/api/src/db/seed.sql

cd packages/api && wrangler dev      # 本地 API
cd packages/web && npm run dev       # 本地前端
cd packages/api && wrangler deploy   # 部署 API
cd packages/web && npm run build && wrangler pages deploy dist --project-name=spa-crm-web
```

---

## 十二、实施路线图

### Phase 1 — 基础
- [x] 所有设计决策已确认
- [ ] 初始化 monorepo
- [ ] shared 包：types + schemas + constants
- [ ] D1 建库，schema.sql + seed.sql

### Phase 2 — 后端 API
- [ ] Hono 骨架 + CORS + session 中间件
- [ ] auth（store-pin, closeout）
- [ ] customers（search, create, get, update）
- [ ] intake（get, put, PATCH review）
- [ ] visits（create, list, GET/:id, PATCH therapist, **PATCH cancel**）
- [ ] stores（pending-therapist, PUT pin）
- [ ] admin（customers, visits, CSV export）

### Phase 3 — 核心前端
- [ ] Vite + React + Tailwind + Router
- [ ] Zustand（session + **staffUnlocked**）+ TanStack Query + API client
- [ ] **StaffGuard + PinPrompt 路由守卫**
- [ ] PinPad / NumPad / SignaturePad / ConsentText
- [ ] AutoSave
- [ ] **NewClientPreAssign（技师预选面板）** + 新客户4步向导 + IntakeThankYou（Next Client 连续填表）
- [ ] 老客户签到页（一键签到 + Update Health Form → 客户领地）
- [ ] PendingSignatureBanner + 技师队列 + Sign & Next
- [ ] **Visit 取消功能**
- [ ] Close Out（检查待签名，排除已取消）

### Phase 4 — 完善
- [ ] 客户档案页
- [ ] 管理后台（查询 + CSV 导出）
- [ ] 门店设置（PIN 修改）

### Phase 5 — 上线
- [ ] iPad 真机测试
- [ ] 离线 + 重连测试
- [ ] PWA 配置 + 部署
- [ ] 员工操作手册

---

## 十三、技术风险与对策

| 风险 | 概率 | 对策 |
|------|------|------|
| D1 5GB 用完 | 极低 | 升级 $0.75/GB |
| Workers 免费层用完 | 低 | $5/月 |
| iPad Safari SignaturePad | 中 | 真机测试，react-signature-canvas 支持 iOS |
| 签名 base64 体积 | 低 | 400×150px ≈ 10-30KB |
| 技师遗忘签名 | 低 | PendingSignatureBanner + Close Out 强制 |
| 客户误操作离开表单 | 低 | 客户领地路由隔离，员工领地需 PIN |
| 多设备数据同步延迟 | 低 | TanStack Query 30s 轮询，小门店足够 |
| visit 忘记取消 | 低 | 管理后台可查未签名 visit，Close Out 时强制处理 |
| PIN 暴力破解 | 低 | 便利优先，后续可加锁定 |
| 网络中断 | 低 | localStorage 双写 + 恢复重试 |
