# Spa CRM — 开发进度文档

> 创建日期：2026-03-29
> 设计文档版本：v0.7
> 代码进度：Phase 0（纯设计，未开始编码）

---

## 一、项目概述

为 Clif's Foot Spa（两家门店：Plano + Carrollton）开发的 PWA CRM 系统，将纸质按摩咨询表格数字化。

- **仓库**：https://github.com/Rebas9512/Spa_CRM.git
- **技术栈**：React + TypeScript + Vite / Cloudflare Workers + Hono / Cloudflare D1 / Cloudflare Pages
- **Monorepo**：npm workspaces — `packages/shared`、`packages/api`、`packages/web`
- **设计文档**：`DESIGN.md`（v0.7，约 1080 行，包含全部架构、DB schema、API、前端流程）
- **PDF 原件**：`Form/ConsultationForm.pdf`（两页纸质表格）

---

## 二、设计迭代历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| v0.1 | 2026-03-29 | 初始设计：DB schema + API + 前端路由 |
| v0.2 | 2026-03-29 | 将 PDF 表格字段完整映射到 IntakeFormData schema |
| v0.3 | 2026-03-29 | 补充门店地址电话、CSV 导出、完整审计 |
| v0.4 | 2026-03-29 | 移除 staff 表，改为门店级 PIN 认证；技师当场填写；老客户 prefill 流程 |
| v0.5 | 2026-03-29 | 单 iPad 多角色交互、多设备协作初步设计 |
| v0.6 | 2026-03-29 | PIN 领地门控（staffUnlocked）、多设备协作细化、pending-checkin 概念 |
| v0.7 | 2026-03-29 | **表单提交即创建 visit**（移除 pending-checkin）、**visit 取消功能**、技师预选面板 |

---

## 三、v0.7 设计审计结果

### 严重程度说明
- P0 = 开发前必须解决（数据完整性 / 功能正确性）
- P1 = Phase 2-3 开发时解决（改善 UX / 防御边界情况）
- P2 = Phase 4-5 可选优化

---

### Issue #1 — 手机号未做标准化 [P0]

**问题**：`customers.phone` 是 UNIQUE 约束。但 `"214-555-1234"`、`"(214) 555-1234"`、`"2145551234"` 会被视为三个不同号码，导致同一个人创建多条 customer 记录。

**建议**：
- 后端：在 `POST /api/customers` 和 `GET /api/customers/search` 中统一 strip 非数字字符，仅保留数字
- 前端：NumPad 只允许输入数字，不涉及格式问题
- 共享：`shared/schemas.ts` 中的 Zod schema 加 `.transform(v => v.replace(/\D/g, ''))`

**实现位置**：`packages/shared/src/schemas.ts`

---

### Issue #2 — D1 外键约束未启用 [P0]

**问题**：SQLite 默认 `PRAGMA foreign_keys = OFF`。visits 和 intake_forms 上的 `REFERENCES` 声明不会实际生效，可以插入不存在的 customer_id。

**建议**：
- 每个 Worker 请求开头执行 `PRAGMA foreign_keys = ON`
- 或在 Hono 中间件中统一处理：
```typescript
app.use('/api/*', async (c, next) => {
  await c.env.DB.exec('PRAGMA foreign_keys = ON')
  await next()
})
```

**实现位置**：`packages/api/src/middleware/` 新增或合并到 session 中间件

---

### Issue #3 — D1 事务：POST /api/customers 需要 batch() [P0]

**问题**：`POST /api/customers` 一个请求创建 customer + intake_form + visit 三条记录。如果中途失败（如 intake_form INSERT 出错），会留下孤立的 customer 记录。

**建议**：
- 使用 D1 的 `db.batch([stmt1, stmt2, stmt3])` 确保原子性
- 所有涉及多表写入的接口都应使用 batch

**影响接口**：
- `POST /api/customers`（3 条 INSERT）
- `PATCH /api/visits/:id/therapist`（UPDATE visits + 可能 UPDATE intake_forms.status）

---

### Issue #4 — "Next Client" 连续填表时 pendingAssignment 不灵活 [P1]

**问题**：当员工点 "New Client" 时预选 serviceType + therapistName 存入 Zustand。"Next Client" 连续填表复用同一个 pendingAssignment。如果不同客户需要不同技师，该值会不对。

**现状评估**：小型按摩店同时只有 1-2 个技师工作，大部分情况下连续客户分配同一技师是合理的。

**建议（P1，不阻塞 MVP）**：
- ThankYou 页面可以加一个小字提示："Therapist: Mike | Service: Deep Tissue"，让员工知道当前分配
- 员工如需改分配，回到主界面（输 PIN）→ 重新点 New Client 选新的技师
- 暂不加入 "在客户领地直接修改技师" 的功能，因为这是员工操作

---

### Issue #5 — 多设备：重复 visit 创建 [P1]

**问题**：没有针对 "同一客户同日重复签到" 的防重机制。理论上：
- iPad A：员工搜索 Jane → 确认签到 → POST /api/customers/jane/visits
- iPad B：另一员工同时搜索 Jane → 确认签到 → POST /api/customers/jane/visits
- 结果：两条重复 visit

**现状评估**：2-3 台 iPad 的小店，实际发生概率极低。

**建议（P1）**：
- `POST /api/customers/:id/visits` 加一个软校验：如果该客户在最近 30 分钟内已有 visit（同 store_id），返回 409 + 已有 visit 信息
- 不用 UNIQUE 约束（合法场景：早上做了 Swedish，下午又做 Deep Tissue）

---

### Issue #6 — 手机号重复时新客户流程的 visit 缺口 [P1]

**问题**：新客户填完表，`POST /api/customers` 检测到手机号已存在 → 返回 `200 { existing: true, customerId }`。此时 visit 没有创建，但 Zustand 里的 pendingAssignment 已经准备好了。

**场景**：老客户换了名字 / 新客户输错号码 / 家庭成员用同一号码。

**建议**：
- 前端 ThankYou 页面收到 `existing: true` 时显示："This phone number is already registered. Please return the iPad to staff for check-in."
- 同时清空 pendingAssignment（因为 visit 没创建）
- 员工拿回 iPad 后通过老客户签到流程 B 创建 visit

---

### Issue #7 — JWT 过期前端无处理 [P1]

**问题**：JWT 36 小时过期。如果 iPad 放了一晚上没 Close Out，第二天继续用可能遇到 JWT 失效。

**建议**：
- TanStack Query 全局 `onError` 拦截 401 → 清空 session → 跳转 `/pin`
- API client（fetch wrapper）统一处理 401 响应

**实现位置**：`packages/web/src/lib/api.ts`

---

### Issue #8 — 技师姓名不一致性 [P2]

**问题**：`therapist_name` 是自由文本。"Mike"、"mike"、"Mike Chen" 会被视为不同技师。Admin 查询和过滤会混乱。

**建议（Phase 4 优化）**：
- NewClientPreAssign 和 ReturnCheckin 页面的 Therapist 输入框加上 autocomplete，数据源为最近 30 天内使用过的 `DISTINCT therapist_name`
- 需要新 API：`GET /api/stores/:id/therapists?since=` 返回去重列表
- 或简化为前端常量列表（因为技师相对固定）

---

### Issue #9 — 离线提交失败无重试机制 [P2]

**问题**：客户填完表点 Submit 时如果网络断开，POST 请求会失败。AutoSave 保存了草稿到 localStorage，但没有自动重试发送。

**建议（Phase 5 完善）**：
- Submit 失败时显示 "Network error. Tap to retry." 按钮
- 不自动重试（避免重复提交）
- AutoSave 草稿在成功提交后清理

---

### Issue #10 — form_version 迁移策略未定义 [P2]

**问题**：`intake_forms.form_version` 字段存在但未规定版本升级策略。v1 表单数据在 v2 schema 下如何渲染？

**建议（后续有 schema 变更时再处理）**：
- 前端根据 form_version 选择对应的 Zod schema 和渲染组件
- 新版本只允许 additive changes（加字段），不删字段
- 旧版本字段缺失时用默认值填充

---

### Issue #11 — 管理后台导出：cancelled visit 状态 [P1]

**问题**：CSV 导出接口未定义如何体现 visit 的取消状态。

**建议**：
- visits CSV 增加 `status` 列，值为 `active`（正常）/ `cancelled`（已取消）/ `completed`（技师已签名）
- 判断逻辑：`cancelled_at IS NOT NULL → cancelled`，`therapist_signed_at IS NOT NULL → completed`，否则 `active`

---

### Issue #12 — 技师队列：therapist_signed_at IS NULL 查询缺 cancelled_at 过滤 [P0]

**问题**：技师签名队列查询条件在 DESIGN.md 流程 C 中描述为 `therapist_signed_at IS NULL`，但需要同时排除已取消的 visit（`cancelled_at IS NULL`）。

**现状**：DESIGN.md 其他位置（API 总览、Close Out）已提到 "排除已取消"，但流程 C 的 SQL 描述遗漏。

**建议**：
- 流程 C 的查询条件补充为：`therapist_signed_at IS NULL AND cancelled_at IS NULL`
- 确保 `GET /api/stores/:id/visits/pending-therapist` 的 WHERE 子句包含两个条件

---

### Issue #13 — 跨店客户：intake_form.store_id 与实际使用 [P2]

**问题**：customer 跨店共享，intake_forms UNIQUE(customer_id) 只有一条记录。intake_forms.store_id 记录的是首次创建的门店。如果客户后来在另一家店更新了 intake_form（PUT /intake），store_id 不会更新。

**现状评估**：两家店共享一个 DB，数据本身是共享的。store_id 可理解为 "首次建档门店"。

**建议**：可以接受当前设计。如需精确记录 "最后更新门店"，后续加 `last_updated_store_id` 字段即可。

---

### 审计总结

| 严重程度 | 数量 | 需要阶段 |
|----------|------|---------|
| P0（必须修） | 3 | Phase 1-2 |
| P1（开发时修） | 5 | Phase 2-3 |
| P2（可选优化） | 5 | Phase 4-5 |

**P0 清单（开发前/开发中必须解决）：**
1. 手机号标准化（strip 非数字）
2. D1 `PRAGMA foreign_keys = ON`
3. 多表写入使用 `db.batch()` 保证事务

---

## 四、关键设计决策备忘（跨设备开发需知）

以下是历次讨论中确认的设计决策，不看 DESIGN.md 时容易遗忘：

### 认证模型
- **无员工账号**，无 staff 表。整个系统只有门店级 PIN。
- PIN 对应一个门店 session（JWT），不绑定个人。
- "技师" 不是系统用户，只是 visits.therapist_name 的一个文本值。
- 任何人输入 PIN 都获得同一权限。

### 前端领地门控
- `staffUnlocked` 是 Zustand + localStorage 的 boolean，不是后端状态。
- 点 "New Client" → `staffUnlocked = false`，之后任何员工领地路由弹 PinPrompt。
- 技师操作不触发 staffUnlocked 变更（技师是员工）。
- 每台设备的 staffUnlocked 独立，互不影响。

### 表单提交 = 签到完成
- v0.6 有 "pending-checkin" 概念（表单提交后不建 visit，员工二次分配技师）。**v0.7 已移除。**
- 现在：员工先选技师 → 递 iPad → 客户填表提交 → customer + intake_form + visit 一次创建。
- 技师签名队列只用于补签，不用于分配。

### Visit 取消
- 已创建的 visit 可以取消（客户走了 / 临时取消）。
- 取消条件：技师还没签名。
- 取消后 DB 留记录（cancelled_at），但不进待签名队列。

### 老客户流程
- 手机号搜索 → 找到 → 签到页（显示健康摘要）。
- 无变更：员工直接 Confirm（PATCH review + POST visit），iPad 不离手。
- 有变更：递 iPad 给客户编辑 → 提交后员工拿回 → 再搜索签到。

### 数据共享
- customers 表全局共享（两店同一人同一条记录）。
- intake_forms 每人一条（UNIQUE customer_id），跨店共享。
- visits 按 store_id 区分门店。

### "当日" 定义
- 以 sessionStartAt（UTC）为基准，不是 UTC 午夜。
- 同一 session 内所有操作属于同一个 "营业日"。

---

## 五、文件清单

```
Spa_CRM/
├── DESIGN.md              ← v0.7 完整设计文档（约 1080 行）
├── PROGRESS.md            ← 本文件
├── Form/
│   └── ConsultationForm.pdf   ← 纸质表格原件（2 页 PDF）
└── .claude/               ← Claude Code memory（AI 上下文持久化）
```

**尚未创建的文件（Phase 1 初始化时创建）：**
```
packages/
├── shared/src/
│   ├── types.ts           ← IntakeFormData + 所有 TS 类型
│   ├── schemas.ts         ← Zod validation schemas（前后端共用）
│   └── constants.ts       ← MASSAGE_TYPES, HEALTH_CONDITIONS, etc.
├── api/src/
│   ├── db/schema.sql      ← CREATE TABLE 语句
│   └── db/seed.sql        ← 两家门店种子数据
└── web/src/
    └── ...                ← React 前端
```

---

## 六、开发路线图 + 预估工作量

### Phase 1 — 基础设施
- [ ] `npm init` monorepo + workspace config
- [ ] `packages/shared`：types.ts + schemas.ts（含手机号标准化）+ constants.ts
- [ ] `packages/api`：schema.sql + seed.sql + wrangler.toml
- [ ] D1 创建 + 执行 schema + seed
- [ ] 验证 `PRAGMA foreign_keys = ON` 在 D1 环境下生效

### Phase 2 — 后端 API
- [ ] Hono 骨架 + CORS 中间件 + session 中间件（含 foreign_keys pragma）
- [ ] `POST /api/auth/store-pin` + `POST /api/auth/closeout`
- [ ] `GET /api/customers/search` + `POST /api/customers`（含 db.batch 事务）
- [ ] `GET/PUT /api/customers/:id`
- [ ] `GET/PUT /api/customers/:id/intake` + `PATCH review`
- [ ] `POST /api/customers/:id/visits`（含 30 分钟重复校验）
- [ ] `GET /api/customers/:id/visits` + `GET /api/visits/:id`
- [ ] `PATCH /api/visits/:id/therapist`（含 intake_forms.status 联动，用 batch）
- [ ] `PATCH /api/visits/:id/cancel`
- [ ] `GET /api/stores/:id/visits/pending-therapist`（WHERE cancelled_at IS NULL）
- [ ] `GET /api/stores` + `PUT /api/stores/:id/pin`
- [ ] `GET /api/admin/customers` + `GET /api/admin/visits`（含 status 字段逻辑）
- [ ] `GET /api/admin/export/customers` + `GET /api/admin/export/visits`（CSV，含 cancelled 状态列）

### Phase 3 — 核心前端
- [ ] Vite + React + TailwindCSS + React Router 骨架
- [ ] Zustand store（session + staffUnlocked + pendingAssignment）
- [ ] TanStack Query + API client（全局 401 → 跳转 /pin）
- [ ] StaffGuard + PinPrompt 路由守卫
- [ ] PinPad（/pin 页面）+ NumPad（手机号键盘）
- [ ] SignaturePad + ConsentText
- [ ] AutoSave（500ms 防抖 → localStorage）
- [ ] NewClientPreAssign（技师预选弹窗）
- [ ] FormWizard（4 步向导，单 RHF context）
- [ ] IntakeThankYou（Next Client + existing 提示）
- [ ] ReturnCheckin 签到页（B-1 一键 + B-2 编辑入口）
- [ ] HealthForm（老客户单页编辑）+ FormDiff
- [ ] PendingSignatureBanner（主界面横幅）
- [ ] TherapistQueuePage + TherapistRecordPage（Sign & Next）
- [ ] Visit 取消按钮（CustomerProfile 页面内）
- [ ] Close Out 流程（检查待签名，排除已取消）

### Phase 4 — 完善
- [ ] CustomerProfile 客户档案页（含 VisitHistory + 取消操作）
- [ ] AdminPage（客户列表 + 来访记录 + CSV 导出）
- [ ] StoreSettings（PIN 修改）
- [ ] 技师姓名 autocomplete（可选）

### Phase 5 — 上线
- [ ] PWA manifest + Service Worker 配置
- [ ] iPad Safari 真机测试（SignaturePad、触摸交互、横屏）
- [ ] 离线 + 重连测试
- [ ] Submit 失败重试 UX
- [ ] 部署到 Cloudflare（D1 prod + Workers + Pages）
- [ ] 员工操作手册

---

## 七、Claude Memory 备份

以下是 Claude Code memory 系统中存储的内容，用于在新设备/新对话中恢复上下文。

### memory/MEMORY.md（索引）
```
# Memory Index
- [Project Overview](project_overview.md) — Spa CRM PWA for Clif's Foot Spa; Cloudflare Pages + Workers + D1; iPad-first; form digitization
- [Form Fields](project_form_fields.md) — Confirmed IntakeFormData schema from actual PDF consultation form
```

### memory/project_overview.md
```
---
name: Project Overview
description: Spa CRM system for Clif's Foot Spa — tech stack, architecture, current status
type: project
---

Digitizing Clif's Foot Spa paper consultation form into a PWA CRM system.

Two stores:
- Clif's Foot Spa (Plano): 6505 W Park Blvd #338, Plano, TX 75093 · (972) 473-3337 · ID: store_plano
- Clif's Foot Spa (Carrollton): 2625 Old Denton Rd #558, Carrollton, TX 75007 · (972) 323-2044 · ID: store_carrollton

Stack: React + TypeScript + Vite / Cloudflare Workers + Hono / Cloudflare D1 / Cloudflare Pages. npm workspaces monorepo, shared package for Zod schemas + types.

Auth: Store-level daily PIN session (no staff accounts). PIN stored in stores.pin_hash. Session JWT payload: { storeId, sessionDate, sessionStartAt, exp: +36h }. Close Out Day requires empty therapist queue. No roles, no per-user auth.

No staff table. Therapist identity = visits.therapist_name (free text). Admin queries by name + date.

Day boundary: session-based, not UTC midnight. "Today" = visit_date >= sessionStartAt. Handles overnight sessions.

Key design decisions:
- Phone UNIQUE, duplicate treated as same person (return 200 + existing customer)
- intake_forms UNIQUE(customer_id), one form per customer, long-lived
- Health conditions as individual booleans (not array)
- visits table stores per-session therapist records (technique, body parts, therapist signature)
- staffNotes stripped from client-facing API responses
- completed_at transition: triggered by PATCH /visits/:id/therapist when intake_forms.status = 'client_signed'
- AutoSave in Phase 3 (same as FormWizard), not Phase 4
- Form submission = visit created (no pending-checkin step). Staff pre-selects therapist before handing iPad.
- Visit cancellation: cancelled_at field on visits. Cancelled visits skip therapist signature queue.

Returning client flow: Prefill → no changes: PATCH /intake/review (updates last_reviewed_at only) → create visit. Changes: single-page edit → diff + re-sign → PUT /intake → create visit.

Therapist queue: pending = therapist_signed_at IS NULL AND cancelled_at IS NULL. PendingSignatureBanner on main screen. Sign & Next auto-advances. PATCH /visits/:id/therapist returns nextPendingVisitId. Close Out blocks if queue non-empty (excluding cancelled).

Admin: Customer list (search/filter, last visit + therapist), Visit list (date/therapist/service filter), CSV export (signatures as Yes/No, not base64).

Extended customer fields (optional, Step 1): date_of_birth, gender, emergency_contact_name, emergency_contact_phone.

Current state (2026-03-29): Design doc v0.7. All decisions confirmed. All audit issues resolved. Ready for Phase 1.
```

### memory/project_form_fields.md
```
---
name: Form Fields — Confirmed IntakeFormData
description: All fields confirmed from actual PDF consultation form (Clif's Foot Spa Massage Therapy Consultation Document)
type: project
---

Form has two fill-in parties: client (page 1 + top of page 2) and therapist/licensee (bottom of page 2).

Client → customers table: first_name, last_name, phone, email, address

Client → intake_forms.form_data (IntakeFormData):
- Health checkboxes (each a boolean): hasSpinalProblems, hasAllergies, hasHighBloodPressure, hasBruiseEasily, hasVaricoseVeins, hasMigraines, hasHeartConditions, hasInjuries
- isPregnant (boolean), pregnancyDueDate (string|null)
- medicalNotes (string) — conditions + medications
- preferredMassageType: 'swedish_relaxation'|'deep_tissue'|'trigger_point'|'pregnancy'|'hot_stone'|'other'
- areasOfPainTension (string), areasToAvoid (string)
- isMinor (boolean), guardianName (string|null), guardianSignatureDataUrl (string|null)
- consentAcknowledged (boolean), clientSignatureDataUrl (string)
- staffNotes (string)

Therapist → visits table (per session):
- therapist_service_technique (TEXT)
- therapist_body_parts_notes (TEXT) — includes indications/contraindications
- therapist_signature_data_url (TEXT) — base64 PNG
- therapist_signed_at (TEXT)

intake_forms.status: 'draft' | 'client_signed' | 'completed'

Paper form "Additional sessions" table = visits table history (already designed).

Why individual booleans for health conditions (not array): Direct checkbox binding in React Hook Form, json_extract queryable in SQLite, clear TypeScript types.
```

---

## 八、新设备快速开始

在新设备上恢复开发环境：

```bash
# 1. 克隆仓库
git clone https://github.com/Rebas9512/Spa_CRM.git
cd Spa_CRM

# 2. 阅读文档
# - DESIGN.md  → 完整技术设计
# - PROGRESS.md → 本文件（进度 + 审计 + 决策备忘）
# - Form/ConsultationForm.pdf → 纸质原件

# 3. Claude Code memory 恢复
# memory 文件在 .claude/ 目录中（项目级），跟随 git
# 如果使用新设备的 Claude Code，memory 会自动从 repo 中读取
# 也可以手动复制到 ~/.claude/projects/ 对应路径下

# 4. 开始 Phase 1
npm init -w packages/shared -w packages/api -w packages/web
# 按 PROGRESS.md 第六节的 checklist 推进
```

---

## 九、已知待讨论事项

以下事项在后续对话中需要确认：

1. **Cloudflare 账号准备**：是否已有 Cloudflare 账号？是否需要设置 Workers 和 D1？
2. **真实 PIN 值**：seed.sql 中两家店的初始 PIN 是否用 "1234"？生产环境需要修改。
3. **域名**：是否需要自定义域名？还是用 Cloudflare Pages 默认的 `.pages.dev`？
4. **技师姓名列表**：是否有固定的技师列表？还是完全自由输入？
