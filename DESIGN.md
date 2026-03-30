# 按摩店客户管理系统 — 设计概念文档

> 版本：v1.1（三级角色 + staff 常驻 + 营业中免 PIN + 全店 session 同步 + 开关店状态机）
> 更新日期：2026-03-29
> 状态：开发就绪 — 可进入 Phase 1

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
5. 单台 iPad 安全地在客户/员工之间流转；支持多台 iPad 协作
6. 管理员账号体系：邀请码注册，一个账号管理多门店、多设备
7. 员工与管理员职责分离：员工负责日常运营，管理员负责数据查询与店铺管理

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
| Zustand | 4+ | 全局状态（session + accessLevel） |
| React Router | 6+ | 路由 |
| vite-plugin-pwa | 最新 | Service Worker |
| react-signature-canvas | 最新 | 电子签名 |
| @react-pdf/renderer | 最新 | 客户端 PDF 生成（同意书导出） |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Cloudflare Workers | — | 无服务器运行环境 |
| Hono | 4+ | 轻量 API 框架 |
| Cloudflare D1 | — | SQLite 数据库 |
| Zod | 3+ | 请求体验证 |

---

## 三、认证设计 — 双层认证模型

本系统采用两层认证：**管理员账号**（全局身份）+ **店铺 PIN**（店内日常操作）。

### 3.1 管理员账号（Account Layer）

管理员是系统的"店主"角色，通过邀请码注册，拥有对店铺的完全管理权限。

```
[Landing Page] → 输入邀请码 + 邮箱 + 密码 → 创建管理员账号
                → 登录 → 管理员面板（创建/管理店铺、查询数据）
```

| 维度 | 设计 |
|------|------|
| 注册 | 邀请码（invite_codes 表）+ 邮箱 + 密码，邀请码一次性使用 |
| 登录 | 邮箱 + 密码 → JWT（adminId, exp +7d） |
| 权限 | 创建店铺、管理店铺设置、查询/导出数据、修改 PIN |
| 多店 | 一个管理员账号可创建并管理多个店铺 |
| 多设备 | 管理员可在任意设备登录，不限数量 |

### 3.2 店铺 PIN（Store Layer）

店铺内有两套 PIN，分别控制员工和管理员在店内设备上的操作权限。

```
[店铺设备] → 员工 PIN → 员工 Session（日常运营）
           → 管理员 PIN → 管理员 Session（店内数据查询）
```

| PIN 类型 | 用途 | 存储 |
|----------|------|------|
| 员工 PIN（staff_pin） | 开班、签到、技师队列、清算 | stores.staff_pin_hash（PBKDF2） |
| 管理员 PIN（admin_pin） | 店内快捷访问管理功能（数据查询/导出） | stores.admin_pin_hash（PBKDF2） |

> 员工 PIN 和管理员 PIN 由管理员在创建店铺时设定，后续可在管理员面板中修改。

### 3.3 Session 模型

系统中存在两种 JWT：

#### 管理员 JWT（Account Session）

```
登录 → JWT { adminId, type: 'admin', exp: +7d }
```

- 长期有效（7天），用于管理员面板
- 可管理所有关联店铺
- 不绑定具体门店或日期

#### 店铺 JWT（Store Session）

```
员工 PIN → JWT { storeId, role: 'staff', sessionId, sessionStartAt, exp: +36h }
管理员 PIN → JWT { storeId, role: 'store_admin', sessionId, sessionStartAt, exp: +36h }
```

- 绑定具体门店和当前 session
- role 字段区分员工和管理员访问级别
- 员工 Session 需要 Close Out 结束；管理员 Session 独立
- `sessionId` 对应 `store_sessions.id`，标识当前营业周期

### 3.4 Session 边界

店铺 session 不与日历日期绑定。Open（输入员工 PIN）到 Close Out 之间为一个 session。
未 Close Out 的 session 持续有效，直到任一设备发起 Close Out。不存在"跨日"问题 — 未关店就继续营业。

### 3.5 Session 中间件

```typescript
// 店铺操作中间件（员工 + 管理员 PIN session）
export const storeSessionMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'No active session' }, 401)
  const payload = verifyJWT(token, c.env.JWT_SECRET)
  if (!payload) return c.json({ error: 'Session expired' }, 401)

  // 检查该店是否仍有 active session（店铺级 session 同步）
  const activeSession = await c.env.DB.prepare(
    'SELECT id FROM store_sessions WHERE store_id = ? AND closed_at IS NULL'
  ).bind(payload.storeId).first()
  if (!activeSession) {
    return c.json({ error: 'Store closed' }, 410)  // 410 Gone → 前端清空 session
  }

  c.set('session', {
    storeId: payload.storeId,
    role: payload.role,            // 'staff' | 'store_admin'
    sessionId: payload.sessionId,
    sessionStartAt: payload.sessionStartAt,
  })
  await next()
}

// 注：store_session 同时控制 session 有效性。
// Close Out 关闭 store_session 后，所有设备的后续请求收到 410 → 自动退出。
// JWT 36h 过期是第二道保障。

// 管理员账号中间件（管理员面板）
export const adminAuthMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Not authenticated' }, 401)
  const payload = verifyJWT(token, c.env.JWT_SECRET)
  if (!payload || payload.type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)
  c.set('admin', { adminId: payload.adminId })
  await next()
}
```

### 3.6 认证流程总览

```
┌─────────────────────────────────────────────────────────┐
│                    Landing Page                          │
│                                                         │
│   [管理员注册（邀请码）]     [管理员登录]    [进入店铺]   │
└────────┬──────────────────────┬──────────────┬──────────┘
         │                      │              │
         v                      v              v
   注册成功 → 登录        管理员面板      选择店铺
                          │                    │
                     ┌────┴────┐          ┌────┴────┐
                     │ 店铺管理 │          │ 客户领地 │（默认）
                     │ 数据查询 │          │         │
                     │ 导出/设置│          │ 员工PIN → 员工领地
                     └─────────┘          │ 管理PIN → 管理领地
                                          └─────────┘
```

---

## 四、设备与交互模型

### 核心问题

一台 iPad 在三种角色之间流转：客户（填表签名）、员工（日常运营）、管理员（数据查询）。
客户使用 iPad 时不应看到系统其他功能；员工和管理员通过各自的 PIN 访问对应功能区。

### 解决方案：三级访问控制

**一个枚举 `accessLevel` 控制设备当前状态。**

| accessLevel | 含义 | 持续性 | 可访问页面 |
|-------------|------|--------|-----------|
| `staff` | 员工操作中 | **常驻**（默认状态） | 员工操作页面（开班、签到、技师队列、清算） |
| `customer` | 设备在客户手中 | **临时** — 填表完成后需员工 PIN 回到 staff | 仅填表相关页面 |
| `admin` | 管理员操作中 | **临时** — 离开管理页面自动回到 staff | 管理页面（数据查询、导出） |

**核心规则：**
- **员工 PIN** → accessLevel = `staff`（常驻默认状态）
- **发起填表**（"New Client" / "Update Health Form"）→ accessLevel = `customer`（临时）
- **管理员 PIN** → accessLevel = `admin`（临时，离开管理页面自动 → `staff`）
- **`staff` 是安全回落状态**：admin 和 customer 都回到 staff，不需要反复输 PIN

### 页面分区

```
┌── 公共领地（无需认证）────────────────────────────────────┐
│  /landing                 Landing Page（入口）             │
│  /admin/register          管理员注册（邀请码）              │
│  /admin/login             管理员登录                       │
└─────────────────────────────────────────────────────────────┘

┌── 客户领地（accessLevel = customer 可访问）─────────────────┐
│  /s/:storeId/intake/new              新客户4步向导          │
│  /s/:storeId/intake/:customerId/edit 老客户健康编辑         │
│  /s/:storeId/intake/thankyou         提交成功               │
└─────────────────────────────────────────────────────────────┘

┌── 员工领地（需 accessLevel = staff，否则弹 PIN 输入）──────┐
│  /s/:storeId/                     主界面（客户查找 + 待签名）│
│  /s/:storeId/customer/:id/checkin 老客户签到                │
│  /s/:storeId/therapist-queue      技师签名队列              │
│  /s/:storeId/visits/:id/therapist 技师记录填写              │
│  /s/:storeId/customer/:id         客户档案                  │
└─────────────────────────────────────────────────────────────┘

┌── 管理员面板（需管理员账号登录）───────────────────────────┐
│  /admin/dashboard                 管理员首页（店铺列表）     │
│  /admin/stores/new                新建店铺                  │
│  /admin/stores/:id                店铺管理                  │
│  /admin/stores/:id/customers      客户查询                  │
│  /admin/stores/:id/visits         来访记录查询              │
│  /admin/stores/:id/export         数据导出                  │
│  /admin/stores/:id/settings       店铺设置（PIN 修改等）     │
│  /admin/account                   账号设置                  │
│  /admin/general-settings          通用设置（语言/时区/日期） │
└─────────────────────────────────────────────────────────────┘

┌── 店内管理领地（需 accessLevel = admin）──────────────────┐
│  /s/:storeId/manage               店内管理首页              │
│  /s/:storeId/manage/customers     客户数据查询              │
│  /s/:storeId/manage/visits        来访记录查询              │
│  /s/:storeId/manage/export        数据导出                  │
└─────────────────────────────────────────────────────────────┘
```

> **店内管理领地** 是管理员面板的轻量版，通过管理员 PIN 在店铺设备上快捷访问，无需登录管理员账号。
> 功能是管理员面板对应店铺的子集（查询 + 导出），不包含店铺创建和设置修改。

### `accessLevel` 状态机

```
    [进入店铺 /s/:storeId]
              ↓
    店铺已开门？（active store_session）
    ├── 是 → store-join（免 PIN）→ accessLevel = staff
    └── 否 → PIN 页 → 员工 PIN → 开班 → accessLevel = staff
              ↓
       accessLevel = staff（常驻默认）
              │
    ┌─────────┼──────────────────────────────────┐
    │         │                                  │
  正常员工操作  │                            输入管理员 PIN
  查找/签到   │                                  │
  技师队列    │                                  v
  清算        │                           accessLevel = admin（临时）
    │         │                                  │
    │         │                           管理操作（查询/导出）
    │         │                                  │
    │         │                           离开管理页面（导航到非 /manage/* 路由）
    │         │                                  ↓
    │         │                           accessLevel = staff（自动回落）
    │         │
    ├── "New Client" 或 "Update Health Form"
    │         ↓
    │    accessLevel = customer（临时，设备递给客户）
    │         │
    │    客户填表 → 提交 → ThankYou
    │    → Next Client → 继续填（保持 customer）
    │         │
    │    员工拿回 iPad → 输入员工 PIN
    │         ↓
    └──── accessLevel = staff（回到常驻状态）
```

**状态切换规则汇总：**

| 触发 | 从 | 到 | 说明 |
|------|----|----|------|
| 输入员工 PIN | 任意 | `staff` | 唯一进入 staff 的方式 |
| "New Client" / "Update Health Form" | `staff` | `customer` | 设备递给客户 |
| 点击 [Manage 🔒] → 输入管理员 PIN | `staff` | `admin` | 进入管理模式，跳转 `/manage` |
| 离开 `/manage/*` 路由 | `admin` | `staff` | **自动回落**，无需输 PIN |
| Close Out | `staff` | — | 清空 session → PIN 页 |

> **`admin` 不能直接到 `customer`**：管理员不发起填表，必须先回到 staff 再操作。
> **`customer` 不能直接到 `admin`**：客户填完表只能通过员工 PIN 回到 staff。
> **技师操作不触发 accessLevel 变更**，因为技师是员工，使用的是员工领地页面。

### Staff → Admin 导航入口

**Staff Header** 包含 [Manage 🔒] 按钮，点击后弹出 PinPrompt：
```
[Store Name]    [Customers] [Manage 🔒] [Close Out]
```
- 输入管理员 PIN → accessLevel = admin → 跳转 `/s/:storeId/manage`
- 在管理页面点 [← Back] → 导航回 staff 页面 → accessLevel 自动回落 staff
- 下次进管理需重新输入 admin PIN

### 前端实现

```typescript
// Zustand store
type AccessLevel = 'customer' | 'staff' | 'admin'

interface AppState {
  // 管理员账号 session（登录管理员面板用）
  adminSession: { token: string; adminId: string } | null
  setAdminSession: (s: AppState['adminSession']) => void

  // 店铺 session（店内 PIN 操作用）
  storeSession: {
    token: string
    storeId: string
    role: 'staff' | 'store_admin'
    sessionId: string
    sessionStartAt: string
  } | null
  setStoreSession: (s: AppState['storeSession']) => void

  // 设备访问级别（员工 PIN 后默认 'staff'）
  accessLevel: AccessLevel
  setAccessLevel: (v: AccessLevel) => void

  // 员工在递 iPad 前预选，客户提交时一并发送
  pendingAssignment: { serviceType: string; therapistName: string } | null
  setPendingAssignment: (v: { serviceType: string; therapistName: string } | null) => void

  // PIN 回归后跳转目标（客户交还 iPad → PIN → 跳转此路径）
  // 客户领地提交时设为 '/customers'（客户列表），PIN 消费后清空
  returnAfterPin: string | null
  setReturnAfterPin: (v: string | null) => void
}

// 路由守卫组件
function StaffGuard({ children }: { children: ReactNode }) {
  const { accessLevel, storeSession } = useAppStore()
  if (!storeSession) {
    // 无 session → 尝试 store-join（免 PIN），失败则跳转 PIN 页
    // 具体实现：在 StoreLayout 中统一处理（见下方）
    return <Navigate to={`/s/${storeId}/pin`} />
  }
  if (accessLevel === 'customer') return <PinPrompt />  // 客户领地 → 需输 PIN 回到 staff
  // accessLevel === 'staff' 或 'admin' 均可访问员工页面
  return children
}

function StoreAdminGuard({ children }: { children: ReactNode }) {
  const { accessLevel, storeSession } = useAppStore()
  if (!storeSession) return <Navigate to={`/s/${storeId}/pin`} />
  if (accessLevel !== 'admin') return <PinPrompt requiredRole="store_admin" />
  return children
}

function AdminGuard({ children }: { children: ReactNode }) {
  const { adminSession } = useAppStore()
  if (!adminSession) return <Navigate to="/admin/login" />
  return children
}

// StoreLayout：进入店铺时自动获取 session
function StoreLayout() {
  const { storeSession, setStoreSession, setAccessLevel } = useAppStore()
  const { storeId } = useParams()

  useEffect(() => {
    if (storeSession) return  // 已有 session，跳过
    // 尝试免 PIN 加入（营业中）
    fetch(`/api/auth/store-join`, { method: 'POST', body: JSON.stringify({ storeId }) })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setStoreSession(data)
          setAccessLevel('staff')
        }
        // data 为 null → 店未开门 → PIN 页会处理
      })
  }, [storeId, storeSession])

  return <Outlet />
}

// admin accessLevel 自动回落：离开 /manage/* 路由时回到 staff
function useAdminAutoExit() {
  const location = useLocation()
  const { accessLevel, setAccessLevel } = useAppStore()
  useEffect(() => {
    if (accessLevel === 'admin' && !location.pathname.includes('/manage')) {
      setAccessLevel('staff')
    }
  }, [location.pathname, accessLevel])
}

// 路由定义
// 公共
<Route path="/landing" element={<Landing />} />
<Route path="/admin/register" element={<AdminRegister />} />
<Route path="/admin/login" element={<AdminLogin />} />

// 管理员面板（需管理员账号登录）
<Route path="/admin/*" element={<AdminGuard>...</AdminGuard>} />

// PIN 页（入口，不需要 session）
<Route path="/s/:storeId/pin" element={<PinPage />} />

// 客户领地（无守卫 — 客户随时可填表，JWT 在 API 层校验）
<Route path="/s/:storeId/intake/*" element={children} />

// 员工领地（需 staff accessLevel）
<Route path="/s/:storeId/" element={<StaffGuard><Main/></StaffGuard>} />
<Route path="/s/:storeId/customers" element={<StaffGuard><CustomerList/></StaffGuard>} />
<Route path="/s/:storeId/customer/:id" element={<StaffGuard><CustomerProfile/></StaffGuard>} />
<Route path="/s/:storeId/customer/:id/checkin" element={<StaffGuard><Checkin/></StaffGuard>} />
<Route path="/s/:storeId/therapist-queue" element={<StaffGuard>...</StaffGuard>} />

// 店内管理领地（需 admin accessLevel）
<Route path="/s/:storeId/manage/*" element={<StoreAdminGuard>...</StoreAdminGuard>} />
```

### 多设备协作

同一家门店可以有多台 iPad 同时运行。所有设置（PIN、店铺信息）存在 D1 服务端，设备无需单独注册或同步。

#### 设备接入

| 维度 | 设计 |
|------|------|
| 接入方式 | 管理员创建店铺后获得 storeId，任意设备访问 `/s/:storeId` 即可使用。可通过书签/PWA 快捷方式固定到 iPad 桌面。 |
| 无需设备注册 | 不跟踪设备身份。任何知道 storeId 的设备都能使用。 |
| 营业中免 PIN | 店铺已开门时，新设备通过 `store-join` API 免 PIN 直接获得 staff JWT。无需逐台输 PIN。 |
| PIN 自动同步 | PIN 存储在 D1，管理员面板修改后即时生效，所有设备下次输 PIN 时自动使用新密码。 |
| 设置同步 | 店铺名称、地址等信息同理，全部服务端存储，无需设备端同步。 |

#### 开关店管理（店铺级别）

**每家店同时只有一个 active store_session**，代表"开门/关门"状态。所有设备共享同一个 session。
Session 不与日历日期绑定 — 纯粹的开/关状态机。

```
输入员工 PIN
    → 后端检查：该店铺有 active 的 store_session（closed_at IS NULL）吗？
    ├── 有   → 加入该 session（不管它是哪天创建的），返回 JWT
    └── 没有 → 创建新 store_session（opened_at = now），返回 JWT

任一设备发起 Close Out
    → 后端检查：全店待签名队列为空？
    ├── 不为空 → 拒绝，提示 "N visits awaiting therapist signature"
    └── 为空   → store_session.closed_at = now()
               → 所有设备的 JWT 在下次 API 调用时收到 410 Gone
               → 前端收到 410 → 清空本地 session → 跳转 PIN 页
```

**关键行为：**

| 场景 | 行为 |
|------|------|
| iPad A 先到，输 PIN 开班 | 无 active store_session → 创建，iPad A 获得 JWT |
| iPad B 后到 | active store_session 存在 → store-join 免 PIN 获得 JWT |
| iPad A 发起 Close Out | 检查**全店**待签名队列（含 iPad B 创建的 visit） |
| Close Out 成功 | store_session 关闭，全店设备下次请求收到 410，各自清理 session |
| 关闭后输 PIN | 无 active session → 创建新 session |
| 忘记 Close Out 再来 | active session 仍在 → 加入 → 员工先 Close Out 再重开 |
| 管理员改了 PIN | 已有 JWT 不受影响（PIN 只在登录时验证） |

#### 数据同步

| 维度 | 设计 |
|------|------|
| 唯一数据源 | D1 数据库。所有设备读写同一份数据，无本地数据库。 |
| 轮询机制 | TanStack Query `refetchInterval: 30000`（30秒）自动刷新关键数据（待签名计数、客户列表）。 |
| 手动刷新 | 关键页面提供下拉刷新（pull-to-refresh），立即获取最新数据。 |
| 实时性 | 无 WebSocket。iPad A 创建的来访记录，iPad B 在 ≤30 秒内可见。对小型门店足够。 |
| accessLevel | 每台设备独立（Zustand + localStorage）。iPad A 在客户领地不影响 iPad B。 |

#### 并发处理（轻量级）

| 场景 | 处理方式 |
|------|---------|
| 两台设备同时为同一手机号创建客户 | `customers.phone` UNIQUE 约束，第二个写入返回 `{ existing: true }`，前端提示 |
| 两台设备同时为同一客户创建 visit | 允许。极端情况下同一客户可能有两条 visit，员工可手动取消多余的 |
| 两台设备同时签同一个技师记录 | `therapist_signed_at IS NULL` 作为前置条件，第二个 PATCH 返回 409 |
| 两台设备同时 Close Out | 第一个成功，第二个收到 410（store_session 已关闭） |
| Close Out 时另一台设备客户正在填表 | 客户提交时收到 410 → AutoSave 草稿已在 localStorage → 跳转 PIN 页并提示 "Store closed. Draft saved." → 重新开店后可恢复 |
| 管理员面板和店铺 iPad 同时操作 | 互不干扰。管理员面板走 Admin JWT，店铺走 Store JWT，不同中间件 |

> **设计哲学**：不做分布式锁或乐观锁，依赖 DB 约束 + 幂等设计 + 前端友好提示。
> 小型门店（2-4 台 iPad）并发冲突概率极低，人工介入成本也低。

#### 典型多设备分工（软分配，非强制）

| 设备 | 主要角色 | 场景 |
|------|---------|------|
| iPad A（前台柜台） | 员工操作 | 开班、查客户、老客户签到、分配技师、清算 |
| iPad B（候客区）| 客户填表 | 长期在客户领地，连续多人填表 |
| iPad C（技师休息区）| 技师签名 | 主要在 `/therapist-queue`，批量签名 |
| 老板手机/电脑 | 管理员面板 | 随时查看数据、导出报表、修改 PIN |

---

## 五、数据库设计

### 表结构总览

```
admins ──→ stores ←── store_sessions
             ↑
             └── visits ──→ customers ←── intake_forms

invite_codes ──→ admins（used_by）
```

> 无 `staff` 表。技师身份以 `visits.therapist_name` 自由文本为准。
> 管理员通过 `admins` 表管理，店铺归属于管理员。
> `store_sessions` 跟踪店铺开关店状态，支持多设备统一开班/清算。

### 详细表结构

#### `admins`

```sql
CREATE TABLE admins (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER admins_updated_at AFTER UPDATE ON admins
  BEGIN UPDATE admins SET updated_at = datetime('now') WHERE id = NEW.id; END;
```

#### `invite_codes`

```sql
CREATE TABLE invite_codes (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  code       TEXT NOT NULL UNIQUE,
  used_by    TEXT REFERENCES admins(id),
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_invite_codes_code ON invite_codes(code);
```

> 邀请码一次性使用。`used_by` 为 NULL 表示未使用。
> 初始邀请码由 seed.sql 插入，后续可由系统管理员生成。

#### `stores`

```sql
CREATE TABLE stores (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  admin_id        TEXT NOT NULL REFERENCES admins(id),
  name            TEXT NOT NULL,
  address         TEXT,
  phone           TEXT,
  timezone        TEXT NOT NULL DEFAULT 'America/Chicago',
  staff_pin_hash  TEXT NOT NULL,
  admin_pin_hash  TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_stores_admin ON stores(admin_id);

CREATE TRIGGER stores_updated_at AFTER UPDATE ON stores
  BEGIN UPDATE stores SET updated_at = datetime('now') WHERE id = NEW.id; END;
```

> `admin_id` 标识店铺归属的管理员。一个管理员可拥有多个店铺。
> `staff_pin_hash` 和 `admin_pin_hash` 分别控制员工和管理员在店内设备上的访问。

#### `store_sessions`

```sql
CREATE TABLE store_sessions (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  store_id   TEXT NOT NULL REFERENCES stores(id),
  opened_at  TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at  TEXT
);

CREATE INDEX idx_store_sessions_store ON store_sessions(store_id);
```

> 纯开关店状态机，不绑定日历日期。
> `closed_at` 为 NULL 表示营业中。Close Out 时写入 `closed_at`。
> 每家店同时最多一个 active session（`closed_at IS NULL`），由应用逻辑保证。
> 员工输入 PIN 时：若无 active session 则创建；若已有则加入。

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
  staff_notes             TEXT DEFAULT '',
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name  ON customers(last_name, first_name);

CREATE TRIGGER customers_updated_at AFTER UPDATE ON customers
  BEGIN UPDATE customers SET updated_at = datetime('now') WHERE id = NEW.id; END;
```

> **`customers` 表无 `store_id`**：客户按手机号全局去重，跨门店共享。
> 查询"某店的客户"通过 `visits` 表 JOIN 实现（客户在哪个店有 visit 就属于哪个店）。
> 设计意图：同一客户可去同一管理员的不同门店，无需重复填表。

#### `intake_forms`

```sql
CREATE TABLE intake_forms (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  form_version     INTEGER NOT NULL DEFAULT 1,
  form_data        TEXT NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'client_signed',
    -- 'client_signed' 客户已提交并签名（INSERT 时直接设为此状态）
    -- 'completed'     客户签名 + 首次技师记录完成
    -- 注：草稿（draft）纯客户端保存（localStorage），不写入 DB
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

> **`UNIQUE(customer_id)`**：每个客户只有一份 intake_form，老客户更新（UPDATE）而非新建。
> 如未来需要表单版本历史，可改为保留历史记录 + `is_current` 标志。
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

### Landing Page

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│              Foot Spa CRM                                    │
│              Device & Store Management                       │
│                                                              │
│  ┌───────────────────────┐  ┌──────────────────────────┐    │
│  │                       │  │                          │    │
│  │   Sync Device         │  │   Admin Portal           │    │
│  │   Enter an existing   │  │   (Management)           │    │
│  │   store ID to sync    │  │                          │    │
│  │   [____________]      │  │   [Login →]              │    │
│  │   [Sync]              │  │   [Register with Code →] │    │
│  └───────────────────────┘  └──────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

> "Sync Device" → 输入 store ID → 同步设备到该店铺（store-join 或 PIN 页）
> "Admin Portal" → 管理员登录/注册 → 管理员面板

### 管理员面板

```
┌──────────────────────────────────────────────────────────────┐
│  Admin Dashboard                          [Account] [Logout] │
│                                                              │
│  My Stores                                   [+ New Store]   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Clif's Foot Spa (Plano)        12 visits today      │   │
│  │  6505 W Park Blvd #338          [Manage →]           │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Clif's Foot Spa (Carrollton)   8 visits today       │   │
│  │  2625 Old Denton Rd #558        [Manage →]           │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘

→ [Manage] → 店铺管理页面：
  - Customers Tab: 客户列表搜索、过滤、查看
  - Visits Tab: 来访记录过滤（日期/技师/服务类型）
  - Export Tab: CSV 导出（客户 + 来访）
  - Settings Tab: 店铺信息、员工 PIN 修改、管理员 PIN 修改
```

### 员工主界面

```
┌──────────────────────────────────────────────────────────────┐
│  Clif's Foot Spa (Plano)                          [Close Out]│
│                                                              │
│  ┌── 待签名（技师服务后补签）──────────────────────────┐     │
│  │  3 visits awaiting therapist signature               │     │
│  │                                    [Sign Now →]     │     │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ 客户查找 ─────────────────────────────────────────┐     │
│  │  [  输入手机号  ]         [New Client]              │     │
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
[Landing Page]
    │
    ├── "Enter Store" → 选择店铺
    │       │
    │       ├── 店铺已开门（active store_session）→ 免 PIN 直接进入 staff
    │       │
    │       └── 店铺未开门 → [PIN 输入页] → 员工 PIN → 开班 → staff
    │
    │   [员工主界面]（accessLevel = staff，常驻）
    │       │
    │       ├── "New Client" → 选技师 → accessLevel = customer（临时）
    │       │       → [客户填表] → 提交 → [ThankYou]
    │       │       → 员工 PIN → accessLevel = staff
    │       │
    │       ├── 手机号找到 → [老客户签到]
    │       │       ├── 无变更 → [一键签到]（全程 staff）
    │       │       └── 有变更 → accessLevel = customer → [编辑] → PIN → staff
    │       │
    │       ├── 待签名横幅 → [技师签名队列] → [Sign & Next]
    │       │
    │       ├── 管理员 PIN → accessLevel = admin（临时）→ [店内管理]
    │       │       → 离开管理页面 → 自动回到 staff
    │       │
    │       └── Close Out → PIN 确认 → 检查全店队列 → 关店 → 全店 410
    │
    └── "Admin Portal" → 登录/注册 → [管理员面板]
            （店铺管理、数据查询、导出、设置）
```

**PIN 使用时机：**

| 场景 | PIN？ | 说明 |
|------|-------|------|
| 开班（店铺未开门） | 员工 PIN | 创建 store_session，确认开门 |
| 营业中设备加入 | 免 PIN | store-join API，店已开直接进 staff |
| 客户 → 员工切换 | 员工 PIN | 防止客户看到员工页面 |
| 进入管理模式 | 管理员 PIN | 访问数据查询/导出 |
| Close Out | 员工 PIN | 确认关店，防止误操作 |
| 营业中正常操作 | 免 PIN | staff 是常驻状态，无需反复验证 |

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
  → accessLevel = customer（临时）
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
  • [Next Client] → 清空表单 → 回到 Step 1，accessLevel 仍为 customer（临时）
    （新客户使用上一次相同的 serviceType + therapistName，员工也可以在递 iPad 前改）
  • 员工拿回 iPad → PIN → accessLevel = staff → 自动跳转 /s/:storeId/customers（客户列表）
    → 列表顶部就是刚刚填表的客户（按最近 visit 排序）
    → 点击可查看健康提醒、添加备注
```

> **表单提交即完成签到：** 客户提交后 visit 已创建，技师已分配。
> 技师不需要立即在前端签名 — 忙的时候可以通过待签名队列补签。
> **"Next Client" 连续填表** 仍支持多人连续填，所有 visit 自动创建。
> **PIN 回归后跳转客户列表**：无论单人还是多人填表，PIN 后都跳转客户列表页，
> Staff 可以立即看到刚才提交的所有客户，逐一查看或添加备注。

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

**路径 B-2：有变更（iPad 交给客户完整复核）**

```
员工点击 [Update Health Form]
  → accessLevel = customer（临时）
  → 员工把 iPad 递给客户
    ↓
[客户领地：/intake/:customerId/edit — "Review & Update Your Information"]
  完整 4 区域滚动页面，所有内容预填：
    Section 1: 个人信息（只读摘要 + Edit 链接，快速确认即可跳过）
    Section 2: 健康状况（8 复选框 + 怀孕 + 医疗备注，变更项黄色高亮）
    Section 3: 按摩偏好（服务类型 + 疼痛/避开区域，变更项黄色高亮）
    Section 4: 同意书全文（4 段法律文本完整展示）+ 确认复选框 + 重签（SignaturePad）
    ↓ 客户点击 [Save & Sign]
  PUT /api/customers/:id/intake → 更新 form_data + client_signed_at
    ↓
[客户领地：/intake/thankyou]
  "Changes saved! Please return the iPad to our staff."
  [Next Client →]  ← 如果其他客户也要填/改
    ↓ 员工拿回 iPad → PIN
[员工领地：/customers — 客户列表]
  列表顶部显示该客户（刚更新过）→ 点击进入 Checkin 页 → 走 B-1 签到（创建 visit）
```

---

### 流程 C：技师签名队列

全程在员工领地，不涉及 accessLevel 变更。

**技师队列页 `/therapist-queue`：**
```
待签名（store_id = current，therapist_signed_at IS NULL，cancelled_at IS NULL）

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

### 流程 E：结账（Close Out Day）— 全店同步

Close Out 是**店铺级别**操作，任一设备发起，全店所有设备同步关闭。

```
[员工主界面] → [Close Out Day]
  → 后端检查：全店待签名队列（排除已取消 visit）
  ├── 不为空 → "N visits awaiting therapist signature. Please complete or cancel first."
  └── 全部清空 →
        → 后端：store_sessions.closed_at = now()
        → 当前设备：清空 session → /s/:storeId/pin
        → 其他设备：下次 API 请求（≤30s 轮询触发）
          → storeSessionMiddleware 检测 store_session 已关闭 → 返回 410
          → 前端收到 410 → 清空 session → /s/:storeId/pin
```

> **开班同步**：第一台设备输 PIN → 创建 store_session → 后续设备输 PIN 或 store-join 加入同一 session。
> **关店同步**：Close Out 关闭 store_session → 全店 session 失效 → 30s 内所有设备自动退出。
> 不需要 WebSocket，TanStack Query 30s 轮询自然触发 410 检查。

---

### 流程 F：管理员面板操作

管理员通过邮箱密码登录后进入管理员面板，管理所有关联店铺。

```
[管理员面板：/admin/dashboard]
  → 店铺列表 → 选择店铺 → [/admin/stores/:id]

[店铺管理页]
┌──────────────────────────────────────────────────────────────┐
│  ← Stores    Clif's Foot Spa (Plano)                        │
│                                                              │
│  [Customers]  [Visits]  [Export]  [Settings]                 │
│                                                              │
│  ┌─ Customers Tab ─────────────────────────────────────┐    │
│  │  Search: [_____________]  Date range: [__] ~ [__]   │    │
│  │                                                     │    │
│  │  Name         Phone         Last Visit   Visits     │    │
│  │  Jane Smith   214-555-1234  2026-03-28   12         │    │
│  │  Bob Jones    972-555-6789  2026-03-27   5          │    │
│  │  ...                                                │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

**① Customers Tab：** 搜索（姓名/手机）、过滤（来访日期区间）、列：姓名/手机/最近来访/技师/次数

**② Visits Tab：** 过滤（日期/技师/服务类型）、列：日期/客户/服务/技师/签名状态

**③ Export Tab：** 客户 CSV + 来访 CSV（签名字段导出为 Yes/No，不含 base64）

**④ Settings Tab：** 店铺名称/地址/电话、员工 PIN 修改、管理员 PIN 修改

---

### 流程 G：店内管理员 PIN 快捷访问

管理员也可以不登录账号，直接在店内 iPad 输入管理员 PIN 访问轻量管理功能。

```
[店铺 PIN 页] → 输入管理员 PIN → accessLevel = admin
    ↓
[/s/:storeId/manage]
┌──────────────────────────────────────────────────────────────┐
│  Store Management (Plano)                          [← Back]  │
│                                                              │
│  [Customers]  [Visits]  [Export]                              │
│                                                              │
│  （功能与管理员面板中对应店铺的前三个 Tab 一致）                 │
└──────────────────────────────────────────────────────────────┘
```

> 店内管理领地不包含 Settings Tab（PIN 修改等敏感操作需通过管理员面板）。

---

### 流程 H：同意书 PDF 导出

员工或管理员在查看客户档案时，可将该客户的完整同意书导出为 PDF。

```
[客户档案页 / 管理员客户详情]
  点击 [Export PDF]
  → 前端读取 GET /api/customers/:id/intake （已有端点）
  → @react-pdf/renderer 客户端生成 PDF
  → 自动下载 ConsentForm_JaneSmith_20260329.pdf
```

**PDF 内容（模拟纸质表单）：**

```
┌──────────────────────────────────────────────────┐
│  Clif's Foot Spa — Massage Therapy               │
│  Consultation Document                           │
│                                                  │
│  ── Personal Information ──────────────────────  │
│  Name: Jane Smith        Phone: 214-555-1234     │
│  Email: jane@example.com DOB: 1990-05-20         │
│  Address: 123 Main St    Gender: Female          │
│  Emergency: John Smith / 214-555-9999            │
│                                                  │
│  ── Health Conditions ─────────────────────────  │
│  ☐ Spinal Problems    ☐ Allergies                │
│  ☑ High Blood Pressure ☐ Bruise Easily           │
│  ☐ Varicose Veins     ☐ Migraines               │
│  ☐ Heart Conditions   ☐ Injuries                │
│  Pregnant: No                                    │
│  Medical Notes: ___________________________      │
│                                                  │
│  ── Massage Preferences ──────────────────────   │
│  Preferred: Deep Tissue                          │
│  Areas of pain/tension: upper back, shoulders    │
│  Areas to avoid: lower back area                 │
│                                                  │
│  ── Consent ──────────────────────────────────   │
│  [完整4段法律文本]                                │
│                                                  │
│  ☑ I acknowledge and agree to the above terms    │
│                                                  │
│  Client Signature:  [签名图片]                    │
│  Signed at: 2026-03-29 14:30                     │
│                                                  │
│  ── Form Status ─────────────────────────────    │
│  Status: Completed                               │
│  First submitted: 2026-03-15                     │
│  Last reviewed: 2026-03-29                       │
│  Total visits: 8                                 │
│                                                  │
│  Generated: 2026-03-29 16:00 CST                 │
└──────────────────────────────────────────────────┘
```

**实现要点：**
- 使用 `@react-pdf/renderer` 纯客户端生成，不需要新的后端 API
- 复用 `GET /api/customers/:id/intake` 已有端点获取数据
- 签名图片：base64 data URL 直接嵌入 PDF（`<Image src={signatureDataUrl} />`）
- 文件名格式：`ConsentForm_{lastName}{firstName}_{YYYYMMDD}.pdf`
- 按钮位置：管理版客户详情页（店内管理 + 管理员面板），员工版不含此功能
- 若客户无 intake_form（如迁移数据），隐藏 Export PDF 按钮

---

### 页面清单

| 页面 | 路由 | 领地 | 功能 |
|------|------|------|------|
| **公共** | | | |
| Landing Page | `/landing` | 公共 | Sync Device（输入 store ID）/ 管理员登录 |
| 管理员注册 | `/admin/register` | 公共 | 邀请码 + 邮箱 + 密码 |
| 管理员登录 | `/admin/login` | 公共 | 邮箱 + 密码 |
| **管理员面板** | | | |
| 管理员首页 | `/admin/dashboard` | 管理员 | 店铺列表 + 今日概览 |
| 新建店铺 | `/admin/stores/new` | 管理员 | 店铺信息 + 设置初始 PIN |
| 店铺管理 | `/admin/stores/:id` | 管理员 | 数据查询 + 导出 + 设置 |
| 客户详情（管理版） | `/admin/stores/:id/customers/:cid` | 管理员 | 完整资料 + 全部来访（含门店） + PDF 导出 |
| 账号设置 | `/admin/account` | 管理员 | 修改密码、邮箱、姓名 |
| 通用设置 | `/admin/general-settings` | 管理员 | 语言、时区、日期格式 |
| **店铺客户领地** | | | |
| PIN 输入 | `/s/:storeId/pin` | — | 开班/客户→员工/Close Out/管理员 PIN |
| 新客户填表 | `/s/:storeId/intake/new` | 客户 | 4步向导 |
| 老客户完整复核 | `/s/:storeId/intake/:customerId/edit` | 客户 | 4 区域滚动页：个人信息(只读)+健康+偏好+同意书全文+重签 |
| 提交成功 | `/s/:storeId/intake/thankyou` | 客户 | "Next Client" 或 "请交回 iPad" |
| **店铺员工领地** | | | |
| 员工主界面 | `/s/:storeId/` | 员工 | 客户查找 + 待签名横幅 + 客户列表入口 |
| 客户列表（员工版） | `/s/:storeId/customers` | 员工 | 按最近 visit 排序 + 搜索，PIN 从客户领地回来后默认跳转此页 |
| 老客户签到 | `/s/:storeId/customer/:id/checkin` | 员工 | 健康摘要 + 一键签到 |
| 技师签名队列 | `/s/:storeId/therapist-queue` | 员工 | 今日待签列表 |
| 技师记录 | `/s/:storeId/visits/:id/therapist` | 员工 | 技师填写 + Sign & Next |
| 客户档案（员工版） | `/s/:storeId/customer/:id` | 员工 | 健康提醒 + 员工备注 + 近期来访 |
| **店内管理领地** | | | |
| 店内管理 | `/s/:storeId/manage` | 管理 | 客户/来访查询 + 导出 |
| 客户详情（管理版） | `/s/:storeId/manage/customers/:id` | 管理 | 完整资料 + 全部来访（含门店） + PDF 导出 |

### 关键组件

| 组件 | 说明 |
|------|------|
| `StaffGuard` | 路由守卫：accessLevel !== 'staff' 时弹出 PinPrompt |
| `StoreAdminGuard` | 路由守卫：accessLevel !== 'admin' 时弹出 PinPrompt |
| `AdminGuard` | 路由守卫：无 adminSession 时跳转 /admin/login |
| `PinPrompt` | 弹窗式 PIN 输入，后端返回 role → 设置 accessLevel |
| `PinPad` | 全屏 PIN 输入页面（/s/:storeId/pin 使用） |
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
| `AdminTable` | 可过滤可排序表格（管理员面板 + 店内管理共用） |
| `CsvExportButton` | CSV 下载触发 |
| `ConsentFormPdf` | 客户同意书 PDF 生成（@react-pdf/renderer，客户端渲染） |
| `StoreCard` | 管理员面板店铺卡片 |
| `StoreIdInput` | Landing Page store ID 输入（Sync Device） |

---

## 八、API 设计

### 接口总览

#### 公共接口（无认证）

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/auth/register` | 管理员注册（邀请码 + 邮箱 + 密码） |
| `POST` | `/api/auth/login` | 管理员登录（邮箱 + 密码） |
| `POST` | `/api/auth/store-pin` | 店铺 PIN 验证（开班/客户→员工/Close Out/管理员） |
| `POST` | `/api/auth/store-join` | 营业中免 PIN 加入（仅当 active store_session 存在） |
| `GET` | `/api/stores/:id/info` | 店铺公开信息（name + isOpen，Sync Device 验证用） |

#### 店铺操作接口（需 Store Session JWT）

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/auth/closeout` | 结账（员工 role） |
| `GET` | `/api/customers/search?phone=` | 手机号查找（含健康摘要） |
| `GET` | `/api/customers/recent?limit=` | 当前店铺最近来访客户列表（按 visit 时间倒序，含健康摘要） |
| `POST` | `/api/customers` | 创建新客户 + intake_form + **visit**（一个事务） |
| `GET` | `/api/customers/:id` | 客户详情 |
| `PUT` | `/api/customers/:id` | 更新基本信息 |
| `GET` | `/api/customers/:id/intake` | 获取完整表单 |
| `PUT` | `/api/customers/:id/intake` | 有变更重签 |
| `PATCH` | `/api/customers/:id/intake/review` | 无变更 proceed |
| `PATCH` | `/api/customers/:id/notes` | 更新员工备注（`customers.staff_notes`） |
| `POST` | `/api/customers/:id/visits` | 创建 visit（老客户签到时调用） |
| `GET` | `/api/customers/:id/visits` | 来访历史（含各 visit 的 store name） |
| `GET` | `/api/visits/:id` | 单条来访详情 |
| `PATCH` | `/api/visits/:id/therapist` | 技师记录 + 签名 |
| `PATCH` | `/api/visits/:id/cancel` | **取消 visit** |
| `GET` | `/api/stores/:id/visits/pending-therapist` | 待签名列表（排除已取消，全店未签名 visit） |

#### 店内管理接口（需 Store Session JWT，role = store_admin）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/manage/customers` | 当前店铺客户查询 |
| `GET` | `/api/manage/visits` | 当前店铺来访查询 |
| `GET` | `/api/manage/export/customers` | CSV 客户 |
| `GET` | `/api/manage/export/visits` | CSV 来访 |

#### 管理员面板接口（需 Admin JWT）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/admin/me` | 当前管理员信息 |
| `PUT` | `/api/admin/me` | 更新管理员信息（密码等） |
| `POST` | `/api/admin/stores` | 创建店铺 |
| `GET` | `/api/admin/stores` | 管理员的店铺列表 |
| `GET` | `/api/admin/stores/:id` | 店铺详情 |
| `PUT` | `/api/admin/stores/:id` | 更新店铺信息 |
| `PUT` | `/api/admin/stores/:id/pins` | 修改店铺 PIN（员工/管理员） |
| `GET` | `/api/admin/stores/:id/customers` | 店铺客户查询 |
| `GET` | `/api/admin/stores/:id/visits` | 店铺来访查询 |
| `GET` | `/api/admin/stores/:id/export/customers` | CSV 客户 |
| `GET` | `/api/admin/stores/:id/export/visits` | CSV 来访 |

### 关键接口

#### POST /api/auth/register（管理员注册）
```
{
  "inviteCode": "ABC12345",
  "email": "owner@example.com",
  "password": "securepass123",
  "name": "Clif"
}

→ 201: { "adminId": "a_new", "email": "owner@example.com" }
→ 400: { "error": "Invalid or used invite code" }
→ 409: { "error": "Email already registered" }
```

#### POST /api/auth/login（管理员登录）
```
{ "email": "owner@example.com", "password": "securepass123" }

→ 200: { "token": "<Admin JWT>", "adminId": "a_123", "name": "Clif" }
→ 401: { "error": "Invalid credentials" }
```

#### POST /api/auth/store-pin（PIN 验证 — 开班/切换/关店/管理员）
```
{ "storeId": "store_plano", "pin": "1234" }

→ 200: {
    "token": "<Store JWT>",
    "role": "staff",              // 或 "store_admin"
    "storeName": "Clif's Foot Spa (Plano)",
    "sessionId": "ss_123",
    "isNewSession": true           // 本次 PIN 是否创建了新 session
  }
→ 401: { "error": "Invalid PIN" }
```

> 后端先匹配 staff_pin_hash，再匹配 admin_pin_hash（详见 14.7）。
> **session 联动**：查找 active store_session（`closed_at IS NULL`），有则加入，无则创建。
> **使用场景**：开班（无 active session）、客户→员工切换、Close Out 确认、进入管理员模式。

#### POST /api/auth/store-join（营业中免 PIN 加入）
```
{ "storeId": "store_plano" }

→ 200: {
    "token": "<Store JWT>",
    "role": "staff",
    "storeName": "Clif's Foot Spa (Plano)",
    "sessionId": "ss_123"
  }
→ 403: { "error": "Store is not open" }   // 无 active store_session
```

> **仅当 active store_session 存在时成功**，否则返回 403（需要 PIN 开班）。
> 无需 PIN，直接签发 staff role JWT。
> 用于营业时间内新设备加入、设备刷新页面等场景。
>
> **安全模型**：storeId（16 位随机 hex）本身即凭证。
> 信任链：邀请码 → 管理员账号 → 创建店铺 → 分发 storeId 给店内设备。
> 知道 storeId = 被管理员授权使用该店铺。

#### POST /api/auth/closeout（全店清算，需 PIN 确认）
```
{ "pin": "1234" }

→ 200: { "closedAt": "2026-03-29T22:00:00Z", "sessionId": "ss_123" }
→ 401: { "error": "Invalid PIN" }
→ 409: { "error": "3 visits awaiting therapist signature", "pendingCount": 3 }
→ 410: { "error": "Store already closed" }
```

> **需要 Store JWT + 员工 PIN 双重验证**：
> 1. storeSessionMiddleware 先验证 JWT（获取 storeId）→ 失败返回 401/410
> 2. handler 再验证 PIN（防止误操作）→ 失败返回 401
> storeId 来自 JWT，body 只需 pin。
> 检查全店待签名队列（排除已取消 visit）。
> 成功后 `store_sessions.closed_at = now()` → 全店设备后续请求收到 410 → 自动退出。

#### POST /api/admin/stores（创建店铺）
```
{
  "name": "Clif's Foot Spa (Plano)",
  "address": "6505 W Park Blvd #338, Plano, TX 75093",
  "phone": "(972) 473-3337",
  "staffPin": "1234",
  "adminPin": "5678"
}

→ 201: { "storeId": "s_new", "name": "Clif's Foot Spa (Plano)" }
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
    "totalVisits": 8, "intakeStatus": "completed",
    "lastVisit": "2026-03-15T14:30:00Z", "lastTherapist": "Mike",
    "lastStore": "Clif's Foot Spa (Plano)",
    "staffNotes": "偏好女性技师",
    "preferredMassageType": "deep_tissue",
    "healthAlerts": { "hasHighBloodPressure": true, ... , "areasToAvoid": "lower back" }
  }
}
→ 404: { "error": "Customer not found" }
```

#### GET /api/admin/stores/:id/customers + visits
```
GET /api/admin/stores/:id/customers?search=jane&lastVisitAfter=2026-01-01&page=1&pageSize=20
GET /api/admin/stores/:id/visits?dateFrom=2026-03-01&dateTo=2026-03-29&therapistName=Mike&page=1&pageSize=50
GET /api/admin/stores/:id/export/customers  → CSV
GET /api/admin/stores/:id/export/visits?dateFrom=&dateTo=  → CSV
```

### Workers 路由

```typescript
const app = new Hono<{ Bindings: { DB: D1Database; JWT_SECRET: string } }>()

app.use('*', cors())

// 公共接口（无认证）
app.post('/api/auth/register', registerHandler)
app.post('/api/auth/login', loginHandler)
app.post('/api/auth/store-pin', storePinHandler)
app.post('/api/auth/store-join', storeJoinHandler)
app.get('/api/stores/:id/info', storeInfoHandler)

// 店铺操作接口（Store Session JWT）
const storeApi = new Hono()
storeApi.use('*', storeSessionMiddleware)
storeApi.post('/auth/closeout', closeoutHandler)
storeApi.route('/customers', customersRouter)
storeApi.route('/visits', visitsRouter)
storeApi.route('/stores', storesRouter)
app.route('/api', storeApi)

// 店内管理接口（Store Session JWT, role = store_admin）
const manageApi = new Hono()
manageApi.use('*', storeSessionMiddleware)
manageApi.use('*', requireRole('store_admin'))
manageApi.route('/manage', manageRouter)
app.route('/api', manageApi)

// 管理员面板接口（Admin JWT）
const adminApi = new Hono()
adminApi.use('*', adminAuthMiddleware)
adminApi.route('/admin', adminRouter)
app.route('/api', adminApi)

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
  "start_url": "/landing",
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
│   │   │   ├── auth.ts         # register, login, store-pin, closeout
│   │   │   ├── customers.ts    # search, create, get, update
│   │   │   ├── intake.ts       # get, put, patch/review
│   │   │   ├── visits.ts       # create, list, get/:id, PATCH therapist, cancel
│   │   │   ├── stores.ts       # pending-therapist, public list
│   │   │   ├── manage.ts       # 店内管理（客户/来访查询 + 导出）
│   │   │   └── admin.ts        # 管理员面板（店铺 CRUD + 数据查询 + 导出）
│   │   ├── middleware/
│   │   │   ├── storeSession.ts # 店铺 JWT 验证
│   │   │   ├── adminAuth.ts    # 管理员 JWT 验证
│   │   │   ├── requireRole.ts  # role 权限守卫
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
│       ├── store/appStore.ts   # Zustand: adminSession + storeSession + accessLevel
│       ├── components/
│       │   ├── ui/
│       │   ├── guards/
│       │   │   ├── StaffGuard.tsx
│       │   │   ├── StoreAdminGuard.tsx
│       │   │   └── AdminGuard.tsx
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
│       │   ├── CsvExportButton.tsx
│       │   ├── StoreCard.tsx
│       │   └── StoreIdInput.tsx
│       └── pages/
│           ├── public/
│           │   ├── LandingPage.tsx
│           │   ├── AdminRegister.tsx
│           │   └── AdminLogin.tsx
│           ├── admin/
│           │   ├── AdminDashboard.tsx
│           │   ├── StoreCreate.tsx
│           │   ├── StoreManage.tsx
│           │   └── AccountSettings.tsx
│           │   ├── GeneralSettings.tsx
│           ├── store/
│           │   ├── PinPage.tsx
│           │   ├── CustomerLookup.tsx
│           │   ├── IntakeForm.tsx
│           │   ├── IntakeEdit.tsx
│           │   ├── IntakeThankYou.tsx
│           │   ├── ReturnCheckin.tsx
│           │   ├── TherapistQueuePage.tsx
│           │   ├── TherapistRecordPage.tsx
│           │   ├── CustomerProfile.tsx
│           │   └── StoreManagePage.tsx  # 店内管理（PIN 访问）
│           └── layout/
│               ├── StoreLayout.tsx
│               └── AdminLayout.tsx
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
-- 初始邀请码（用于注册第一个管理员账号）
INSERT INTO invite_codes (id, code) VALUES
  ('ic_init_001', 'CLIFSPA2026'),
  ('ic_init_002', 'SPAWELCOME01');

-- 注意：不再预置 stores 和 admins
-- 管理员通过邀请码注册后，在管理员面板中创建店铺
-- 开发测试时可手动插入测试数据
```

> **生产部署**：只需 seed 邀请码。管理员注册后自行创建店铺。
> **开发测试**：可额外 seed 一个测试管理员和测试店铺。

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

### Phase 1 — 项目骨架 + 数据层

**目标：monorepo 跑通，数据库就绪，共享类型可用。**

```
packages/
├── shared/src/
│   ├── types.ts          — Customer, Visit, IntakeForm, Store 等 TS 类型
│   ├── schemas.ts        — Zod schemas（phoneSchema, intakeFormDataSchema 等）
│   └── constants.ts      — MASSAGE_TYPES, HEALTH_CONDITIONS, HIGH_RISK_CONDITIONS, CONSENT_TEXT
├── api/src/
│   ├── index.ts          — Hono app 入口（空路由 + CORS）
│   └── db/
│       ├── schema.sql    — 7 张表（admins, invite_codes, stores, store_sessions, customers, intake_forms, visits）
│       └── seed.sql      — 初始邀请码 + 开发测试数据
└── web/src/
    └── main.tsx          — Vite + React 空壳跑通
```

- [x] 所有设计决策已确认
- [ ] 初始化 npm workspaces monorepo（packages/shared, packages/api, packages/web）
- [ ] `shared`：types.ts + schemas.ts + constants.ts
- [ ] `api`：Hono 空壳 + wrangler.toml + D1 binding
- [ ] `api/db`：schema.sql（7 张表 + 索引 + triggers）+ seed.sql
- [ ] `web`：Vite + React + TypeScript + TailwindCSS 空壳
- [ ] 本地开发环境验证：`wrangler dev` + `npm run dev` 均可运行

**交付物：** `npm run dev` 前后端均可启动，D1 表结构就绪，shared 包可被 api/web 导入。

---

### Phase 2 — 后端 API（全部）

**目标：所有 API 端点开发完成，可用 curl/Postman 测试。**

```
packages/api/src/
├── index.ts              — 路由挂载
├── middleware/
│   ├── foreignKeys.ts    — PRAGMA foreign_keys = ON
│   ├── storeSession.ts   — Store JWT 验证 + store_session 检查
│   ├── adminAuth.ts      — Admin JWT 验证
│   └── requireRole.ts    — role 权限守卫（store_admin）
├── routes/
│   ├── auth.ts           — register, login, store-pin, store-join, closeout
│   ├── customers.ts      — search, recent, create, get, update, notes
│   ├── intake.ts         — get, put, PATCH review
│   ├── visits.ts         — create, list, get/:id, PATCH therapist, PATCH cancel
│   ├── stores.ts         — pending-therapist, public info
│   ├── manage.ts         — 店内管理（客户查询、来访查询、CSV 导出）
│   └── admin.ts          — 管理员面板（店铺 CRUD、数据查询、CSV 导出、PIN 管理）
└── lib/
    ├── hash.ts           — PBKDF2 hashPassword / verifyHash
    ├── jwt.ts            — signJWT / verifyJWT
    └── csv.ts            — CSV 生成工具
```

**2a — 基础设施 + 认证**
- [ ] foreignKeys 中间件
- [ ] lib/hash.ts（PBKDF2-SHA256）
- [ ] lib/jwt.ts
- [ ] storeSessionMiddleware + adminAuthMiddleware + requireRole
- [ ] `POST /api/auth/register`（邀请码 + 邮箱 + 密码）
- [ ] `POST /api/auth/login`（邮箱 + 密码 → Admin JWT）
- [ ] `POST /api/auth/store-pin`（PIN → Store JWT + store_session 联动）
- [ ] `POST /api/auth/store-join`（营业中免 PIN）
- [ ] `POST /api/auth/closeout`（JWT + PIN 双重验证 + 待签名检查）
- [ ] `GET /api/stores/:id/info`（公开信息）

**2b — 客户 + 表单 + 来访**
- [ ] `GET /api/customers/search?phone=`（含健康摘要 + staffNotes + lastStore）
- [ ] `GET /api/customers/recent?limit=`（当前店铺最近来访客户）
- [ ] `POST /api/customers`（创建客户 + intake_form + visit，db.batch 原子事务）
- [ ] `GET /api/customers/:id` + `PUT /api/customers/:id`
- [ ] `PATCH /api/customers/:id/notes`（更新 staff_notes）
- [ ] `GET /api/customers/:id/intake` + `PUT /api/customers/:id/intake`
- [ ] `PATCH /api/customers/:id/intake/review`
- [ ] `POST /api/customers/:id/visits`（老客户签到）
- [ ] `GET /api/customers/:id/visits`（来访历史，含 store name）
- [ ] `GET /api/visits/:id`
- [ ] `PATCH /api/visits/:id/therapist`（技师签名 + intake_forms.status 联动）
- [ ] `PATCH /api/visits/:id/cancel`
- [ ] `GET /api/stores/:id/visits/pending-therapist`

**2c — 管理接口**
- [ ] manage 路由（requireRole store_admin）：客户查询、来访查询、CSV 导出
- [ ] admin 路由：店铺 CRUD、PIN 管理、数据查询、CSV 导出
- [ ] lib/csv.ts（客户 CSV + 来访 CSV）

**交付物：** 全部 API 端点可用 curl 测试，认证流程完整，数据 CRUD 正常。

---

### Phase 3 — 核心前端（员工 + 客户流程）

**目标：员工日常操作和客户填表全流程可用。**

```
packages/web/src/
├── lib/
│   └── apiClient.ts      — fetch 封装 + 401/410 处理
├── store/
│   └── appStore.ts       — Zustand（adminSession, storeSession, accessLevel, pendingAssignment, returnAfterPin）
├── components/
│   ├── guards/           — StaffGuard, StoreAdminGuard, AdminGuard
│   ├── PinPad.tsx        — 全屏 PIN 输入
│   ├── NumPad.tsx        — 手机号数字键盘
│   ├── SignaturePad.tsx  — 电子签名
│   ├── ConsentText.tsx   — 同意书全文
│   ├── AutoSave.tsx      — localStorage 草稿
│   └── PendingSignatureBanner.tsx
├── pages/
│   ├── public/
│   │   └── LandingPage.tsx
│   ├── store/
│   │   ├── PinPage.tsx
│   │   ├── StaffMain.tsx           — 手机号查找 + 待签名横幅 + [Customers] [Manage] [Close Out]
│   │   ├── CustomerList.tsx        — 最近来访客户列表 + 搜索
│   │   ├── IntakeForm.tsx          — 4 步向导（FormWizard）
│   │   ├── IntakeEdit.tsx          — 老客户健康复核（滚动长页）
│   │   ├── IntakeThankYou.tsx      — 提交成功 + Next Client
│   │   ├── ReturnCheckin.tsx       — 老客户签到（健康摘要 + 一键签到）
│   │   ├── CustomerProfile.tsx     — 员工版客户档案（健康 + 备注 + 近期来访）
│   │   ├── TherapistQueuePage.tsx  — 待签名队列
│   │   └── TherapistRecordPage.tsx — 技师记录 + Sign & Next
│   └── layout/
│       └── StoreLayout.tsx         — store-join 自动获取 session + useAdminAutoExit
```

**3a — 基础设施**
- [ ] Vite + React + TailwindCSS + React Router 配置
- [ ] Zustand store（5 个状态字段 + setter）
- [ ] apiClient.ts（fetch 封装 + 401/410 → 清空 session → PIN 页）
- [ ] TanStack Query 配置
- [ ] StoreLayout（store-join 自动获取 session + useAdminAutoExit）
- [ ] StaffGuard / StoreAdminGuard / AdminGuard 路由守卫
- [ ] 路由定义（所有 Route 注册）

**3b — 入口 + PIN**
- [ ] LandingPage（Sync Device 卡片 + Admin Portal 卡片）
- [ ] PinPage（店名 + 4 圆点 + 数字键盘 + PIN 验证 + store_session 联动）

**3c — 客户填表流程**
- [ ] NumPad 组件
- [ ] SignaturePad 组件（react-signature-canvas 封装）
- [ ] ConsentText 组件（4 段法律文本）
- [ ] AutoSave 组件（500ms 防抖 → localStorage）
- [ ] IntakeForm — 4 步向导（Step 1 个人信息 → Step 2 健康 → Step 3 偏好 → Step 4 同意书签名）
- [ ] IntakeEdit — 老客户健康复核（预填 + 变更高亮 + 重签）
- [ ] IntakeThankYou（Next Client 连续填表 + returnAfterPin 设置）

**3d — 员工日常操作**
- [ ] StaffMain（手机号查找 + [Customers] [Manage 🔒] [Close Out] header）
- [ ] CustomerList（最近来访排序 + 搜索 + 健康 badge）
- [ ] ReturnCheckin（健康摘要 + 服务选择 + 一键签到 / Update Health Form）
- [ ] CustomerProfile 员工版（基本信息 + Staff Notes 编辑 + 健康 badge + 近期来访）
- [ ] NewClientPreAssign 弹窗（serviceType + therapistName → Zustand）
- [ ] PendingSignatureBanner（待签名计数 + Sign Now 跳转）
- [ ] TherapistQueuePage（待签名列表 + Sign 按钮）
- [ ] TherapistRecordPage（客户信息 + 健康提醒 + 技师输入 + 签名 + Sign & Next）
- [ ] Close Out 流程（PIN 确认 + 待签名检查 + 全店 410）
- [ ] Visit 取消功能

**交付物：** 员工可以开班、查找客户、签到、递 iPad 给客户填表、技师签名、关店。完整日常操作闭环。

---

### Phase 4 — 管理层功能

**目标：管理员面板 + 店内管理 + PDF 导出全部可用。**

```
packages/web/src/pages/
├── public/
│   ├── AdminRegister.tsx
│   └── AdminLogin.tsx
├── admin/
│   ├── AdminDashboard.tsx      — 店铺列表 + General Settings 入口
│   ├── StoreCreate.tsx         — 新建店铺（信息 + 双 PIN）
│   ├── StoreManage.tsx         — 4 Tab（Customers/Visits/Export/Settings）
│   ├── AdminCustomerDetail.tsx — 管理版客户详情 + PDF 导出
│   ├── AccountSettings.tsx     — 密码/邮箱修改
│   └── GeneralSettings.tsx     — 语言/时区/日期格式
├── store/
│   └── StoreManagePage.tsx     — 店内管理（admin PIN，3 Tab + [← Staff]）
components/
├── AdminTable.tsx              — 可过滤可排序表格（共用）
├── CsvExportButton.tsx         — CSV 下载触发
└── ConsentFormPdf.tsx          — @react-pdf/renderer 客户端 PDF 生成
```

**4a — 管理员认证 + 面板**
- [ ] AdminRegister 页面（邀请码 + 邮箱 + 密码）
- [ ] AdminLogin 页面
- [ ] AdminDashboard（店铺列表卡片 + [+ New Store] + General Settings 链接）
- [ ] StoreCreate（店铺信息 + timezone 自动检测 + 双 PIN 配置）
- [ ] AccountSettings（修改密码/邮箱/姓名）
- [ ] GeneralSettings（语言/时区/日期格式）

**4b — 店铺管理（管理员面板 + 店内管理共用）**
- [ ] AdminTable 组件（搜索 + 日期过滤 + 排序 + 分页）
- [ ] StoreManage — Customers Tab（客户列表 + 搜索 → 点击行跳转详情）
- [ ] StoreManage — Visits Tab（来访列表 + 日期/技师过滤）
- [ ] StoreManage — Export Tab（CsvExportButton，客户 CSV + 来访 CSV）
- [ ] StoreManage — Settings Tab（店铺信息编辑 + PIN 修改）
- [ ] StoreManagePage（店内管理，admin PIN 入口，3 Tab 无 Settings，[← Staff] 导航）

**4c — 管理版客户详情 + PDF**
- [ ] AdminCustomerDetail（左栏：完整资料 + Staff Notes + Form Status，右栏：健康摘要 + 来访历史含 Location 列）
- [ ] ConsentFormPdf（@react-pdf/renderer，完整同意书 PDF 生成）
- [ ] Export PDF 按钮（前端生成 + 自动下载，无 intake_form 时隐藏）

**交付物：** 管理员可以注册登录、创建管理店铺、查询数据、导出 CSV/PDF。店内管理员可通过 PIN 快捷访问管理功能。

---

### Phase 5 — 质量保障 + 上线

**目标：iPad 真机验证，PWA 部署，交付使用。**

- [ ] PWA 配置（manifest.json + Service Worker + 缓存策略）
- [ ] iPad Safari 真机测试（触摸交互 + 签名 + 横屏）
- [ ] 多设备协作测试（2 台 iPad 同时操作 + 30s 轮询验证）
- [ ] 离线 + 重连测试（localStorage 草稿恢复）
- [ ] Close Out 全店 410 同步测试
- [ ] 并发场景测试（同时创建客户、同时签名、同时 Close Out）
- [ ] 生产环境部署（Cloudflare Workers + Pages + D1）
- [ ] 域名 + HTTPS 配置
- [ ] 员工操作手册（开班 → 日常操作 → 关店 完整流程图）

**交付物：** 生产环境上线，iPad 桌面 PWA 可用，员工培训完成。

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
| 邀请码泄露 | 低 | 一次性使用，已用即失效；可在 DB 中手动废弃 |
| 管理员密码弱 | 低 | 前端强制最低密码长度（8位）；后续可加 2FA |
| 员工/管理员 PIN 相同 | 低 | 创建店铺时前端校验不允许相同 PIN |

---

## 十四、实现约束与关键逻辑（v1.1）

> 以下为设计审查中发现的必须在开发阶段遵守的实现约束。

### 14.1 手机号归一化（P0）

所有涉及手机号的入口（创建、查询）必须先 strip 非数字字符。

```typescript
// packages/shared/schemas.ts
export const phoneSchema = z.string()
  .transform(v => v.replace(/\D/g, ''))       // strip non-digits
  .pipe(z.string().min(10).max(11))            // 10-11 位纯数字

// 应用场景：
// - POST /api/customers → body.phone
// - GET /api/customers/search?phone= → query param
// - POST /api/admin/stores/:id/customers → search param
```

### 14.2 D1 外键约束（P0）

D1 默认不启用外键。必须在每次请求开始时开启。

```typescript
// packages/api/src/middleware/foreignKeys.ts
export const foreignKeysMiddleware = async (c, next) => {
  await c.env.DB.exec('PRAGMA foreign_keys = ON')
  await next()
}

// 在 app 最外层注册，所有路由之前
app.use('/api/*', foreignKeysMiddleware)
```

### 14.3 原子事务 — db.batch()（P0）

以下操作必须使用 D1 batch API 保证原子性：

```typescript
// POST /api/customers — 创建新客户（3 条记录）
const results = await c.env.DB.batch([
  c.env.DB.prepare('INSERT INTO customers ...').bind(...),
  c.env.DB.prepare('INSERT INTO intake_forms ...').bind(...),
  c.env.DB.prepare('INSERT INTO visits ...').bind(...),
])

// PATCH /api/visits/:id/therapist — 技师签名 + 联动 intake_forms.status
const results = await c.env.DB.batch([
  c.env.DB.prepare('UPDATE visits SET therapist_signed_at = ... WHERE id = ?').bind(...),
  c.env.DB.prepare("UPDATE intake_forms SET status = 'completed', completed_at = datetime('now') WHERE customer_id = ? AND status = 'client_signed'").bind(...),
])
```

### 14.4 时区定义（P0）

**规则：创建店铺时读取设备当前时区写入 `stores.timezone`，后续所有时间记录以该时区为准。**

```typescript
// 创建店铺时（POST /api/admin/stores）：
// 前端读取设备时区：Intl.DateTimeFormat().resolvedOptions().timeZone
// 写入 stores.timezone（如 'America/Chicago'）

// 所有时间记录统一策略：
// - DB 存储：UTC（datetime('now')）
// - 前端显示：按 store.timezone 转换显示
// - 查询过滤：按店铺时区的日期边界转 UTC 区间

// 时区确定后不再变动，确保历史数据一致性
```

### 14.5 store_session 生命周期（P0）

**纯开关店状态机：每家店同时只有一个 active store_session（`closed_at IS NULL`）。**

```
场景 1：正常营业
  第一台设备输 PIN → 无 active session → 创建 → 开门
  Close Out → 清空待签名队列 → closed_at = now() → 关门 → 全店 410

场景 2：忘记 Close Out
  → 员工到店输 PIN → active session 仍在 → 加入
  → Close Out 关闭旧 session → 重新输 PIN → 创建新 session
```

```typescript
// POST /api/auth/store-pin 中的 session 逻辑：
async function getOrCreateSession(db: D1Database, storeId: string) {
  // 找当前 active session
  const active = await db.prepare(
    'SELECT * FROM store_sessions WHERE store_id = ? AND closed_at IS NULL'
  ).bind(storeId).first()

  if (active) return { session: active, isNewSession: false }

  // 没有 active → 创建新 session
  const newId = generateId()
  await db.prepare(
    'INSERT INTO store_sessions (id, store_id) VALUES (?, ?)'
  ).bind(newId, storeId).run()

  const created = await db.prepare(
    'SELECT * FROM store_sessions WHERE id = ?'
  ).bind(newId).first()

  return { session: created, isNewSession: true }
}
```

> **一店一 active**：忘记关就继续用，不存在"跨日"问题。
> **Close Out 是唯一关门方式**：必须清空队列才能关，确保员工不会遗漏签名。
> **中间件检查 session**：Close Out 后全店 410，session 同步关闭。

### 14.6 store_session 创建竞争（P0）

两台设备同时首次输 PIN 时，可能同时尝试创建 session。

```typescript
// 使用 INSERT + 再查 active 模式：
// 两个并发 INSERT 都会成功（无 UNIQUE 约束），但第二步 SELECT 只取一条。
// D1 单写者模型下实际不会并发，此处仅为防御性编码。
const newId = generateId()
await db.prepare(
  'INSERT INTO store_sessions (id, store_id) VALUES (?, ?)'
).bind(newId, storeId).run()

// 取最早的 active session（防止极端情况下有多条）
const session = await db.prepare(
  'SELECT * FROM store_sessions WHERE store_id = ? AND closed_at IS NULL ORDER BY opened_at ASC LIMIT 1'
).bind(storeId).first()
```

> D1 单写者模型下并发写极少见。ORDER BY + LIMIT 1 确保即使多条也只取一条。

### 14.7 PIN 匹配与 accessLevel 联动（P0）

```typescript
// POST /api/auth/store-pin 的 PIN 匹配逻辑：
const store = await db.prepare('SELECT * FROM stores WHERE id = ?').bind(storeId).first()
if (!store) return c.json({ error: 'Store not found' }, 404)

// 先匹配 staff PIN
if (await verifyHash(pin, store.staff_pin_hash)) {
  return issueStoreJWT({ storeId, role: 'staff', ... })
}

// 再匹配 admin PIN
if (await verifyHash(pin, store.admin_pin_hash)) {
  return issueStoreJWT({ storeId, role: 'store_admin', ... })
}

return c.json({ error: 'Invalid PIN' }, 401)
```

**前端 accessLevel 联动规则：**

```typescript
// 收到 store-pin 响应后：
if (response.role === 'staff') {
  setAccessLevel('staff')       // 常驻状态
}
if (response.role === 'store_admin') {
  setAccessLevel('admin')       // 临时状态，导航到 /manage/*
}

// admin accessLevel 自动回落：
// 离开 /s/:storeId/manage/* 路由 → 自动 setAccessLevel('staff')
// 无需重新输入员工 PIN（admin 是 staff 的超集）

// PinPrompt 弹窗场景（accessLevel = customer 时点击员工领地页面）：
// 输入员工 PIN → setAccessLevel('staff')
// 输入管理员 PIN → setAccessLevel('admin') → 导航到 /manage
```

> 创建店铺时**前端校验两个 PIN 不能相同**。
> 如果相同（绕过前端），staff_pin 优先匹配。

### 14.8 前端 401/410 错误处理（P1）

```typescript
// packages/web/src/lib/apiClient.ts
// TanStack Query 的 queryFn 统一使用 fetch，在 onError 中处理 401/410
async function apiFetch(url: string, options?: RequestInit) {
  const { storeSession } = useAppStore.getState()
  const res = await fetch(url, {
    ...options,
    headers: { ...options?.headers, Authorization: `Bearer ${storeSession?.token}` },
  })
  if (res.status === 401 || res.status === 410) {
    // 401: JWT 过期 | 410: 店铺已 Close Out
    const storeId = storeSession?.storeId
    useAppStore.getState().setStoreSession(null)
    // 不设 accessLevel — PIN 页会根据输入的 PIN 重新设置
    if (storeId) window.location.href = `/s/${storeId}/pin`
    throw new Error(res.status === 410 ? 'Store closed' : 'Session expired')
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}
```

> 401（JWT 过期）和 410（店铺 Close Out）统一处理：清空 session → PIN 页。
> 410 由 TanStack Query 30s 轮询自然触发，无需额外逻辑。

### 14.9 密码与 PIN 哈希（P0）

Cloudflare Workers 无 Node.js `crypto` 模块，不支持原生 bcrypt。统一使用 Web Crypto API 的 PBKDF2。

| 数据 | 算法 | 说明 |
|------|------|------|
| 管理员密码 (`admins.password_hash`) | PBKDF2-SHA256, 100k iterations | Web Crypto 原生支持 |
| 店铺 PIN (`staff_pin_hash`, `admin_pin_hash`) | PBKDF2-SHA256, 100k iterations | PIN 短但高迭代次数补偿 |

```typescript
// packages/api/src/lib/hash.ts
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256
  )
  return `${buf2hex(salt)}:${buf2hex(new Uint8Array(hash))}`
}

export async function verifyHash(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  const salt = hex2buf(saltHex)
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256
  )
  return buf2hex(new Uint8Array(hash)) === hashHex
}
```

> 存储格式：`salt_hex:hash_hex`。salt 16 字节随机，每条记录独立。
> 管理员密码和店铺 PIN 使用同一套函数，区别仅在于输入长度。

### 14.10 管理员数据隔离（P1）

```typescript
// 所有 /api/admin/* 路由必须用 adminId 过滤 store 归属

// GET /api/admin/stores
const stores = await db.prepare(
  'SELECT * FROM stores WHERE admin_id = ?'
).bind(adminId).all()

// GET /api/admin/stores/:id/* (customers, visits, export)
// 必须先验证 store 归属
const store = await db.prepare(
  'SELECT * FROM stores WHERE id = ? AND admin_id = ?'
).bind(storeId, adminId).first()
if (!store) return c.json({ error: 'Not found' }, 404)
```

> Admin A 永远看不到 Admin B 的店铺和数据。
