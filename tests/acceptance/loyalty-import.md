# Loyalty Points Import — Acceptance Criteria

## Background

已有大量老客户持有实体积分卡，需要一次性将实体积分导入系统。
- 员工侧：一次性导入，导入后不可再次操作（防止重复）
- 管理员侧：可手动修改积分，需 admin PIN 验证（安全性）

---

## Database Layer

| ID | Criteria | Expected |
|----|----------|----------|
| DB-01 | `customers` 表包含 `loyalty_imported_at` 字段 | `TEXT DEFAULT NULL`，记录导入时间，NULL 表示未导入过 |

## Backend — 员工侧一次性导入

| ID | Criteria | Expected |
|----|----------|----------|
| BE-01 | `POST /api/customers/:id/import-points` 接受 `{ points: number }` | schema 验证通过 |
| BE-02 | points 必须为正整数 | points=0 或负数 → 400 |
| BE-03 | 首次导入成功 → customer.loyalty_points += points | 例如原有 2 分，导入 8 → 10 分 |
| BE-04 | 导入成功后设置 `loyalty_imported_at = datetime('now')` | 记录导入时间 |
| BE-05 | 同一客户第二次导入 → 400，积分不变 | 错误信息"已导入过" |
| BE-06 | 返回 `{ loyaltyPoints, loyaltyImportedAt }` | 包含更新后的积分和导入时间 |
| BE-07 | 客户不存在 → 404 | 标准错误处理 |

## Backend — 管理员侧手动修改

| ID | Criteria | Expected |
|----|----------|----------|
| BE-08 | `PATCH /api/admin/customers/:id/loyalty-points` 接受 `{ loyaltyPoints: number, pin: string }` | schema 验证通过 |
| BE-09 | loyaltyPoints 必须为非负整数 | 负数 → 400 |
| BE-10 | PIN 正确（匹配该 admin 所属任一 store 的 admin_pin_hash）→ 200 | 积分被设为指定值 |
| BE-11 | PIN 错误 → 401，积分不变 | 错误信息"PIN incorrect" |
| BE-12 | PIN 缺失 → 400 | 必填参数 |
| BE-13 | 可多次修改，无次数限制 | 区别于员工侧的一次性导入 |
| BE-14 | 返回 `{ loyaltyPoints }` | 包含修改后的积分 |

## Backend — 查询接口

| ID | Criteria | Expected |
|----|----------|----------|
| BE-15 | `GET /api/customers/:id` 返回 `loyaltyImportedAt` | 员工侧可据此判断是否已导入 |
| BE-16 | `GET /api/admin/customers/:id` 返回 `loyaltyImportedAt` | 管理员侧可看到导入记录 |

## Frontend — 员工侧 (CustomerProfile)

| ID | Criteria | Expected |
|----|----------|----------|
| FE-01 | 未导入过：显示"导入积分"按钮/入口 | loyaltyImportedAt 为 null |
| FE-02 | 点击后展示输入框，输入积分数量并确认 | 输入正整数 |
| FE-03 | 导入成功后刷新积分显示 | 即时反馈 |
| FE-04 | 已导入过：不再显示导入入口 | loyaltyImportedAt 非 null |
| FE-05 | 提交时发送 `POST /api/customers/:id/import-points` | 请求体包含 points |

## Frontend — 管理员侧 (AdminCustomerDetail)

| ID | Criteria | Expected |
|----|----------|----------|
| FE-06 | 显示"修改积分"按钮 | 始终可见（无次数限制） |
| FE-07 | 点击后展示输入框 + PIN 输入 | 需要积分值和 admin PIN |
| FE-08 | PIN 错误时显示错误提示 | 不关闭弹窗，可重试 |
| FE-09 | 修改成功后刷新积分显示 | 即时反馈 |
| FE-10 | 提交时发送 `PATCH /api/admin/customers/:id/loyalty-points` | 请求体包含 loyaltyPoints + pin |

## Edge Cases

| ID | Criteria | Expected |
|----|----------|----------|
| EDGE-01 | 员工导入 0 分 → 400 | 无意义操作，拒绝 |
| EDGE-02 | 员工导入小数（如 3.5）→ 400 | 积分必须为正整数 |
| EDGE-03 | 管理员设积分为 0 → 200 | 合法操作（清零） |
| EDGE-04 | 管理员设积分为 100 → 200 | 允许任意非负整数 |
| EDGE-05 | 导入后积分正常累加（技师签名 +1）| 导入不影响后续正常流程 |
| EDGE-06 | 跨店：Store A 员工导入后，Store B 看到更新后的积分 | 积分绑定 customer，跨店共享 |
