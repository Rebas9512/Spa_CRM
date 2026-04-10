# Loyalty Points (Punch Card) — Acceptance Criteria

## Background

每位顾客完成一次完整消费（顾客签到 + 技师签名）后积累 1 分。
积满 10 分后，下次消费时可选择兑换 10 积分换取一次优惠。
积分跨店共享（绑定 customer，不绑定 store）。

---

## Database Layer

| ID | Criteria | Expected |
|----|----------|----------|
| DB-01 | `customers` 表包含 `loyalty_points` 字段 | `INTEGER NOT NULL DEFAULT 0` |
| DB-02 | `visits` 表包含 `points_redeemed` 字段 | `INTEGER NOT NULL DEFAULT 0` |

## Backend — 积分累加

| ID | Criteria | Expected |
|----|----------|----------|
| BE-01 | 技师签名完成 visit 后，customer.loyalty_points += 1 | 签名前 0 → 签名后 1 |
| BE-02 | 连续完成 N 次消费后，loyalty_points = N | 10 次 → 10 分 |
| BE-03 | visit 被取消（cancel）时，不产生积分变动 | loyalty_points 保持不变 |
| BE-04 | 仅签到未完成（pending visit）时，不产生积分 | loyalty_points 保持不变 |

## Backend — 积分兑换

| ID | Criteria | Expected |
|----|----------|----------|
| BE-05 | `PATCH /api/visits/:id/therapist` 接受可选参数 `redeemPoints: boolean` | schema 验证通过 |
| BE-06 | `redeemPoints=true` 且积分 ≥ 10：扣除 10 分，visit.points_redeemed = 10 | 10 分 → +1 -10 = 1 分 |
| BE-07 | `redeemPoints=true` 且积分 < 10：返回 400，visit 不被签名 | 错误信息 + 数据不变 |
| BE-08 | `redeemPoints=false` 或未传：正常签名 +1，不扣分 | 积分只增不减 |
| BE-09 | 兑换后 visit 记录的 `points_redeemed = 10` | 可审计追溯 |

## Backend — 积分查询

| ID | Criteria | Expected |
|----|----------|----------|
| BE-10 | `GET /api/visits/:id` 返回 `customerLoyaltyPoints` | 技师签名页可读取 |
| BE-11 | `GET /api/customers/:id` 返回 `loyaltyPoints` | Staff 端客户 profile 可读取 |
| BE-12 | `GET /api/admin/customers/:id` 返回 `loyaltyPoints` | Admin 端客户详情可读取 |

## Backend — 跨店共享

| ID | Criteria | Expected |
|----|----------|----------|
| BE-13 | 在 Store A 积累的分数，在 Store B 签名页可见且可兑换 | loyalty_points 绑定 customer 而非 store |
| BE-14 | 在 Store A 兑换后，Store B 看到的积分同步减少 | 数据一致性 |

## Frontend — 技师签名页 (TherapistRecordPage)

| ID | Criteria | Expected |
|----|----------|----------|
| FE-01 | 显示客户当前积分 | 在客户信息区域可见 |
| FE-02 | 积分 < 10 时不显示兑换选项 | 无 toggle/checkbox |
| FE-03 | 积分 ≥ 10 时显示兑换询问（toggle/checkbox） | "是否使用积分优惠？" |
| FE-04 | 选中兑换后提交，发送 `redeemPoints: true` | 请求体包含该字段 |
| FE-05 | 未选中兑换时提交，发送 `redeemPoints: false` 或不传 | 正常签名流程 |

## Frontend — 客户 Profile（Staff 端）

| ID | Criteria | Expected |
|----|----------|----------|
| FE-06 | CustomerProfile 页面展示客户积分 | loyaltyPoints 可见 |

## Frontend — 客户详情（Admin 端）

| ID | Criteria | Expected |
|----|----------|----------|
| FE-07 | AdminCustomerDetail 页面展示客户积分 | loyaltyPoints 可见 |

## Edge Cases

| ID | Criteria | Expected |
|----|----------|----------|
| EDGE-01 | 新客户首次完成消费 → 积分从 0 到 1 | 正常累加 |
| EDGE-02 | 积分恰好 10 分时兑换 → 剩余 1 分（+1 -10） | 净结果 1 分 |
| EDGE-03 | 积分 > 10（如 15）时选择不兑换 → 保留 16 分 | 客户可自由选择 |
| EDGE-04 | 积分 > 10 时兑换 → 剩余 N+1-10 | 正确扣减 |
| EDGE-05 | 已签名的 visit 无法重复触发积分变动 | 重复签名返回 409 |
