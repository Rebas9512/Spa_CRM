# 按摩店客户管理系统 — 设计概念文档

> 版本：v0.2（规划阶段）
> 更新日期：2026-03-29
> 状态：待表单字段确认后进入开发阶段

---

## 一、项目背景与目标

### 背景
按摩店需要对每位顾客进行健康问卷的采集与管理。目前依赖纸质表单，存在以下问题：
- 老客户每次来访都要重复填写
- 纸质表单难以跨店共享和检索
- 无法快速统计来访记录

### 目标
构建一套轻量、易用的客户管理 PWA 系统，实现：
1. 新客户首次来访时完成电子问卷填写
2. 老客户来访时快速调出档案，一键签到
3. 多门店共用客户数据，统一管理

### 核心设计原则
- **iPad 优先**：所有交互以触摸屏操作为标准
- **操作极简**：前台员工无需培训即可上手
- **零运维成本**：全部托管在 Cloudflare，无需管理服务器，免费层可支撑数十万客户量级

---

## 二、技术选型

### 整体架构

```
[iPad / 任意浏览器]
        |
        | HTTPS
        v
[Cloudflare Pages]  —— 托管前端静态文件（PWA）
        |
        | fetch /api/*
        v
[Cloudflare Workers]  —— API 服务（Hono 框架）
        |
        | D1 binding
        v
[Cloudflare D1]  —— SQLite 数据库（边缘部署）
```

所有服务在同一个 Cloudflare 账号下管理，无需额外供应商。

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18+ | UI 框架 |
| TypeScript | 5+ | 类型安全 |
| Vite | 5+ | 构建工具，打包静态文件部署到 Pages |
| TailwindCSS | 3+ | 样式，快速实现触摸友好 UI |
| React Hook Form | 7+ | 表单管理，支持草稿分步保存 |
| Zod | 3+ | 表单验证 schema（前后端共用） |
| TanStack Query | 5+ | API 请求缓存与状态管理 |
| Zustand | 4+ | 轻量全局状态（当前门店 context） |
| React Router | 6+ | 客户端路由 |
| vite-plugin-pwa | 最新 | 自动生成 Service Worker，PWA 配置 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Cloudflare Workers | — | 无服务器运行环境，边缘部署，无冷启动 |
| Hono | 4+ | Workers 专用轻量 API 框架，Express 风格 |
| Cloudflare D1 | — | Workers 原生绑定 SQLite 数据库 |
| Zod | 3+ | 请求体验证（与前端共用 schema） |

### 部署

| 服务 | 平台 | 费用 |
|------|------|------|
| 前端 PWA | Cloudflare Pages | 永久免费，无限带宽 |
| API 服务 | Cloudflare Workers | 免费层 10万请求/天，绰绰有余 |
| 数据库 | Cloudflare D1 | 免费层 5GB，可支撑约 70 万客户 |
| 域名（可选） | Cloudflare DNS | 免费，需自购域名 |

### 为何选 Cloudflare 全家桶

| 对比维度 | Cloudflare | Supabase |
|---------|-----------|---------|
| 免费数据库容量 | 5 GB（~70万客户） | 500 MB（~7万客户） |
| 免费层暂停风险 | 无 | 1周无访问自动暂停，生产环境致命 |
| 强制付费门槛 | 几乎不触碰 | 上线即需 $25/月 Pro 消除暂停 |
| 后端代码 | 需自己写（Hono） | 自动生成 API |
| 长期运维成本 | $0 | $25/月起 |

---

## 三、数据库设计

D1 使用 SQLite 语法，与 PostgreSQL 主要差异：
- 主键用 `TEXT` + 随机 hex，不用 UUID（SQLite 无原生 UUID 函数）
- 时间用 `TEXT` 存 ISO 8601 字符串，不用 `TIMESTAMPTZ`
- JSON 用 `TEXT` 存储，不用 `JSONB`（SQLite 无 JSONB，但支持 `json_extract` 查询）

### 表结构总览

```
stores ←── staff
  ↑
  └── visits ──→ customers ←── intake_forms
```

### 详细表结构

#### `stores` — 门店信息

```sql
CREATE TABLE stores (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name       TEXT NOT NULL,
  address    TEXT,
  phone      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### `customers` — 客户档案（全局，跨门店共用）

```sql
CREATE TABLE customers (
  id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  phone                   TEXT NOT NULL UNIQUE,   -- 主要查找键
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  email                   TEXT,
  date_of_birth           TEXT,                   -- ISO 8601 日期，如 '1990-05-20'
  gender                  TEXT,                   -- 'M' | 'F' | 'other' | 'prefer_not'
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name  ON customers(last_name, first_name);
```

> 手机号唯一约束确保同一客户不被重复录入，是老客户识别的核心依据。

#### `intake_forms` — 健康问卷 / 偏好表

```sql
CREATE TABLE intake_forms (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  customer_id  TEXT NOT NULL REFERENCES customers(id),
  store_id     TEXT NOT NULL REFERENCES stores(id),   -- 首次填写的门店
  form_version INTEGER NOT NULL DEFAULT 1,             -- 表单版本号，支持字段迭代
  form_data    TEXT NOT NULL DEFAULT '{}',             -- JSON 字符串，存储所有表单字段
  status       TEXT NOT NULL DEFAULT 'draft',          -- 'draft' | 'completed'
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(customer_id)                                  -- 每位客户一份表单
);

CREATE INDEX idx_intake_forms_customer ON intake_forms(customer_id);
```

> `form_data` 用 JSON 字符串存储，字段变更时只需升级 `form_version`，历史数据不受影响。

#### `visits` — 来访记录

```sql
CREATE TABLE visits (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  customer_id    TEXT NOT NULL REFERENCES customers(id),
  store_id       TEXT NOT NULL REFERENCES stores(id),
  visit_date     TEXT NOT NULL DEFAULT (datetime('now')),  -- ISO 8601 datetime
  service_type   TEXT,          -- 服务类型，如 '推拿' / '足疗' / '精油'
  therapist_name TEXT,          -- 技师姓名
  notes          TEXT,          -- 本次来访备注
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_visits_customer ON visits(customer_id);
CREATE INDEX idx_visits_store    ON visits(store_id);
CREATE INDEX idx_visits_date     ON visits(visit_date DESC);
```

> 老客户"签到"操作 = 在此表 INSERT 一行，是整个系统最高频的写操作。

#### `staff` — 员工账号

```sql
CREATE TABLE staff (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  store_id   TEXT NOT NULL REFERENCES stores(id),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  pin_hash   TEXT,              -- bcrypt 哈希的 4-6 位 PIN，用于 iPad 快速解锁
  role       TEXT NOT NULL DEFAULT 'staff',  -- 'staff' | 'manager' | 'admin'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 四、表单字段规划

### 当前状态

> **待定：** 表单具体字段内容待实际纸质文件确认后填入。
> 下方为占位结构，字段名和类型会根据实际文件调整。

### `form_data` JSON 预留结构

```typescript
interface IntakeFormData {
  // ---- 待填入：健康信息字段 ----
  // 根据实际纸质表单确认后补充
  // 示例字段类型：
  // healthConditions: string[]   // 多选
  // medications: string          // 文字
  // isPregnant: boolean          // 是/否

  // ---- 待填入：按摩偏好字段 ----
  // 根据实际纸质表单确认后补充

  // ---- 同意书 ----
  consentAcknowledged: boolean    // 必填，表单提交前必须为 true
  signatureDataUrl?: string       // 可选，电子签名 base64 图片
  consentSignedAt?: string        // 同意时间戳

  // ---- 内部字段 ----
  staffNotes?: string             // 员工备注，不对客户显示
}
```

### 表单版本管理策略

```
form_version = 1  →  当前初始版本（字段待定）
form_version = 2  →  后续表单字段更新时升级
```

前端读取表单数据时，根据 `form_version` 做字段补全（旧数据缺失的新字段填默认值），确保历史数据始终可读。

---

## 五、前端页面设计

### 用户操作流程

```
[打开 App]
    |
    ↓
[门店选择] ← 首次启动配置，保存到 localStorage
    |
    ↓
[主界面 — 客户查找]          ← 每次客户来访都从这里开始
    |
    | 输入手机号（大号数字键盘）
    |
    ├── 找到客户
    |       ↓
    |   [老客户签到页]
    |   显示：姓名、上次来访日期、累计来访次数
    |   显示：表单关键信息摘要（供技师参考）
    |   操作：选择服务类型 + 技师 → "确认签到"
    |       ↓
    |   [签到成功确认页] → 3秒后返回主界面
    |
    └── 未找到
            ↓
        [新客户填表向导]
        Step 1：基本信息（姓名、手机、生日等）
        Step 2：[待定：健康信息字段]
        Step 3：[待定：按摩偏好字段]
        Step 4：同意书 + 电子签名
            ↓
        [提交成功] → 自动签到 → 返回主界面
```

### 页面清单

| 页面 | 路由 | 主要功能 |
|------|------|---------|
| 客户查找 | `/` | 手机号输入、搜索入口，主界面 |
| 新客户填表 | `/new` | 多步骤表单向导 |
| 老客户签到 | `/customer/:id/checkin` | 快速确认、选服务、一键签到 |
| 客户档案 | `/customer/:id` | 完整表单查看/编辑 + 来访历史 |
| 管理后台 | `/admin` | 门店数据、客户列表（仅 manager/admin） |
| 门店设置 | `/settings` | 首次配置当前门店 |

### 关键组件

| 组件 | 功能 |
|------|------|
| `NumPad` | 自定义大号数字键盘，手机号输入专用，不调起系统键盘 |
| `FormWizard` | 多步骤表单容器，管理步骤状态、进度条、前后导航 |
| `AutoSave` | 表单变更后 500ms 防抖保存草稿到 API + localStorage |
| `CustomerCard` | 老客户信息摘要卡片，显示关键健康注意事项 |
| `VisitHistory` | 来访记录列表，时间线样式 |
| `SignaturePad` | 电子签名画布组件 |

---

## 六、API 设计

后端运行在 Cloudflare Workers，使用 Hono 框架提供 REST API。前端通过 `fetch` 调用，TanStack Query 管理缓存。

### 接口总览

| Method | Path | 描述 |
|--------|------|------|
| `GET` | `/api/customers/search?phone=` | 按手机号查找客户（老客户识别入口） |
| `POST` | `/api/customers` | 创建新客户 |
| `GET` | `/api/customers/:id` | 获取客户详情（含表单 + 来访统计） |
| `PUT` | `/api/customers/:id` | 更新客户基本信息 |
| `GET` | `/api/customers/:id/intake` | 获取表单数据 |
| `PUT` | `/api/customers/:id/intake` | 保存/更新表单（支持草稿） |
| `POST` | `/api/customers/:id/visits` | 记录一次来访（签到核心操作） |
| `GET` | `/api/customers/:id/visits` | 获取来访历史 |
| `GET` | `/api/stores` | 门店列表 |
| `GET` | `/api/stores/:id/customers` | 某门店客户列表（分页） |

### 关键接口示例

#### 老客户查找
```
GET /api/customers/search?phone=13800138000

200 OK:
{
  "customer": {
    "id": "a1b2c3d4e5f6",
    "firstName": "张",
    "lastName": "三",
    "phone": "13800138000",
    "lastVisit": "2026-03-15T14:30:00Z",
    "totalVisits": 8,
    "intakeStatus": "completed"
  }
}

404: { "error": "Customer not found" }
```

#### 记录来访（签到）
```
POST /api/customers/a1b2c3d4/visits
{
  "storeId": "store_abc",
  "serviceType": "深层推拿",
  "therapistName": "李师傅"
}

201 Created:
{ "visitId": "v_xyz", "visitDate": "2026-03-29T10:00:00Z" }
```

#### 保存表单草稿（自动保存）
```
PUT /api/customers/a1b2c3d4/intake
{
  "formVersion": 1,
  "status": "draft",
  "formData": { ... }
}

200 OK: { "updatedAt": "2026-03-29T10:01:23Z" }
```

### Workers 路由结构（Hono）

```typescript
// packages/api/src/index.ts
const app = new Hono<{ Bindings: { DB: D1Database } }>()

app.use('*', cors())
app.use('/api/*', authMiddleware)

app.route('/api/customers', customersRouter)
app.route('/api/stores',    storesRouter)

export default app
```

---

## 七、认证与权限

### 认证方案

使用 **JWT Token** 方案，员工以邮箱 + 密码登录，Workers 颁发短期 JWT（24小时有效）。

iPad 日常使用支持 **PIN 快速解锁**（4-6位数字），避免每次输完整密码。

```
首次设置：
  管理员在后台创建员工账号（邮箱 + 初始密码 + PIN）

日常使用：
  iPad 解锁 → 输入 PIN → Workers 验证 → 返回 token → 存入内存
  token 过期 → 提示重新输入 PIN
```

### 角色权限

| 角色 | 权限范围 |
|------|---------|
| `staff` | 查找客户、新客户填表、老客户签到 |
| `manager` | 以上全部 + 本店数据查看与导出 |
| `admin` | 全部权限 + 跨店管理、员工账号管理 |

### Workers 权限中间件

```typescript
// packages/api/src/middleware/auth.ts
export const authMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const payload = verifyJWT(token, c.env.JWT_SECRET)
  if (!payload) return c.json({ error: 'Invalid token' }, 401)

  c.set('staff', payload)   // { staffId, storeId, role }
  await next()
}
```

---

## 八、PWA 配置

### manifest.json
```json
{
  "name": "客户管理系统",
  "short_name": "客户管理",
  "display": "standalone",
  "orientation": "landscape",
  "start_url": "/",
  "background_color": "#ffffff",
  "theme_color": "#1a1a2e",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker 缓存策略

| 资源类型 | 策略 | 说明 |
|---------|------|------|
| HTML / JS / CSS | Cache First（预缓存） | 离线可打开 App |
| API 请求 | Network First | 优先实时数据，失败时用缓存 |
| 表单草稿 | localStorage 双写 | 断网时不丢失，恢复后自动 sync |

### iPad 安装步骤（员工操作手册内容）
1. Safari 打开系统 URL
2. 底部工具栏分享按钮 → "添加到主屏幕"
3. 桌面出现图标，点击即为全屏 App 模式，无浏览器地址栏

### iPad 锁定（生产推荐）
- **Apple Guided Access**（设置 → 辅助功能 → 引导式访问）锁定 iPad 只运行此 App
- 多台 iPad 统一管理可使用 MDM（如 Apple Business Manager）

---

## 九、项目目录结构

采用 **npm workspaces monorepo**，前后端共用 TypeScript 类型和 Zod schema，避免重复定义。

```
customer-management/
├── DESIGN.md
├── package.json              # Workspace 根，定义 workspaces
│
├── packages/
│   │
│   ├── shared/               # 前后端共用代码
│   │   ├── package.json
│   │   └── src/
│   │       ├── types.ts      # Customer, Visit, IntakeFormData 等 TS 类型
│   │       ├── schemas.ts    # Zod 验证 schema（表单字段填入后补充）
│   │       └── constants.ts  # 服务类型列表、角色枚举等常量
│   │
│   ├── api/                  # Cloudflare Workers 后端
│   │   ├── package.json
│   │   ├── wrangler.toml     # D1 绑定、Workers 配置、环境变量
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts      # Hono app 入口，注册路由和中间件
│   │       ├── routes/
│   │       │   ├── customers.ts
│   │       │   ├── intake.ts
│   │       │   ├── visits.ts
│   │       │   └── stores.ts
│   │       ├── middleware/
│   │       │   ├── auth.ts   # JWT 验证
│   │       │   └── cors.ts
│   │       ├── db/
│   │       │   ├── schema.sql    # 所有 CREATE TABLE 语句
│   │       │   └── seed.sql      # 初始门店数据
│   │       └── lib/
│   │           ├── jwt.ts        # JWT 签发与验证
│   │           └── hash.ts       # PIN hash 工具
│   │
│   └── web/                  # React PWA 前端
│       ├── package.json
│       ├── vite.config.ts    # 含 vite-plugin-pwa 配置
│       ├── tsconfig.json
│       ├── index.html
│       ├── public/
│       │   ├── manifest.json
│       │   ├── icon-192.png
│       │   └── icon-512.png
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── api/
│           │   └── client.ts     # fetch 封装 + 统一错误处理
│           ├── hooks/
│           │   ├── useCustomer.ts
│           │   ├── useVisit.ts
│           │   └── useAutoSave.ts
│           ├── store/
│           │   └── appStore.ts   # Zustand：当前门店、当前员工 context
│           ├── components/
│           │   ├── ui/           # Button, Input, Card, Badge 等基础组件
│           │   ├── NumPad.tsx
│           │   ├── FormWizard.tsx
│           │   ├── CustomerCard.tsx
│           │   ├── VisitHistory.tsx
│           │   └── SignaturePad.tsx
│           ├── pages/
│           │   ├── CustomerLookup.tsx
│           │   ├── IntakeForm.tsx
│           │   ├── QuickCheckin.tsx
│           │   ├── CustomerProfile.tsx
│           │   ├── Admin.tsx
│           │   └── StoreSetup.tsx
│           └── styles/
│               └── global.css    # Tailwind directives
```

---

## 十、部署配置

### wrangler.toml（api 包）

```toml
name = "massage-api"
main = "src/index.ts"
compatibility_date = "2026-03-29"

[[d1_databases]]
binding = "DB"
database_name = "massage-db"
database_id = "<执行 wrangler d1 create 后填入>"

[vars]
JWT_SECRET = "<生产环境在 Cloudflare Dashboard 设置>"

# 开发环境
[env.dev]
name = "massage-api-dev"

[[env.dev.d1_databases]]
binding = "DB"
database_name = "massage-db-dev"
database_id = "<dev 环境 DB ID>"
```

### 部署命令

```bash
# 一次性初始化
wrangler d1 create massage-db
wrangler d1 create massage-db-dev
wrangler d1 execute massage-db --file=./packages/api/src/db/schema.sql
wrangler d1 execute massage-db --file=./packages/api/src/db/seed.sql

# 本地开发
cd packages/api  && wrangler dev          # Workers 本地模拟
cd packages/web  && npm run dev           # Vite dev server

# 部署
cd packages/api  && wrangler deploy
cd packages/web  && npm run build && wrangler pages deploy dist --project-name=massage-web
```

### CORS 配置

Workers 的 CORS 中间件允许 Cloudflare Pages 的域名访问，开发时允许 `localhost:5173`。

---

## 十一、实施路线图

### Phase 1 — 项目基础（前置条件）
- [ ] 确认表单字段内容（等待实际纸质文件）
- [ ] 初始化 monorepo（npm workspaces）
- [ ] 在 `shared` 包定义 TypeScript 类型和 Zod schema 占位
- [ ] 创建 Cloudflare D1 数据库（dev + production）
- [ ] 执行 schema.sql 建表，执行 seed.sql 录入门店

### Phase 2 — 后端 API（Cloudflare Workers + Hono）
- [ ] 搭建 Hono 应用骨架，配置 CORS 和 JWT 中间件
- [ ] 实现客户路由（search / create / get / update）
- [ ] 实现表单路由（get / upsert / complete）
- [ ] 实现来访路由（create / list）
- [ ] 实现门店路由（list / customers）
- [ ] `wrangler dev` 本地验证所有接口

### Phase 3 — 核心前端页面
- [ ] 搭建 Vite + React + TailwindCSS + React Router
- [ ] 配置 TanStack Query，实现 API client
- [ ] `NumPad` 组件（大号触摸数字键盘）
- [ ] 客户查找页（主界面）
- [ ] 老客户签到页（QuickCheckin）
- [ ] 新客户填表向导基础结构（FormWizard + useAutoSave）
- [ ] **[等待] 填入实际表单字段后完成向导所有步骤**
- [ ] 同意书 + 电子签名步骤

### Phase 4 — 完善功能
- [ ] 客户档案页（表单查看/编辑 + 来访历史）
- [ ] 管理后台（门店数据、客户列表、数据导出）
- [ ] 门店初始配置页
- [ ] PIN 登录流程

### Phase 5 — 上线准备
- [ ] iPad 全机型触摸测试（横屏/竖屏）
- [ ] 离线功能测试（断网填表 → 重连同步）
- [ ] 配置 PWA（manifest + service worker）
- [ ] 部署 Workers API + Pages 前端
- [ ] 配置自定义域名（可选）
- [ ] 员工操作手册

---

## 十二、待定事项

| 事项 | 状态 | 说明 |
|------|------|------|
| 表单字段内容（来自实际纸质文件） | **待提供** | 确认后填入第四节，完成 Zod schema |
| 门店数量及初始数据 | 待确认 | 用于 seed.sql |
| 服务类型列表 | 待确认 | 填入 `shared/constants.ts` |
| 技师管理方式（固定列表 or 自由输入） | 待确认 | 影响签到页 UI 设计 |
| 是否需要电子签名 | 待确认 | 影响是否引入签名画布库 |
| 是否需要客户照片 | 待确认 | 影响存储方案（需用 Cloudflare R2） |

---

## 十三、技术风险与对策

| 风险 | 概率 | 对策 |
|------|------|------|
| D1 免费层 5GB 用完 | 极低（数十年内难触碰） | 升级 D1 付费，$0.75/GB 按量计费 |
| Workers 免费层 10万请求/天 用完 | 低（需日均 5000+ 客户来访） | 升级 Workers Paid，$5/月 含 1000万次 |
| iPad Safari 兼容性问题 | 低 | 开发阶段每个组件在真机测试 |
| 表单字段大幅变更 | 中 | JSON + form_version 机制保障历史数据兼容 |
| 网络中断时数据丢失 | 低 | localStorage 双写，恢复后自动同步 |
| JWT 密钥泄露 | 低 | 密钥存 Cloudflare 环境变量，代码中不出现 |
