---
title: 订单超时自动取消：从「15 分钟未支付」到百万级可靠关单
date: 2026-10-20
type: note
category: Java八股文 / 后端场景题
tags: Java八股文, 后端场景题
summary: 用 RocketMQ 延迟消息、订单状态机与定时对账，设计百万级订单的 15 分钟未支付自动取消链路。
---

> **一句话答案**
> 用 **RocketMQ 延迟消息**拿到弹性，用**订单状态机 + 条件更新**拿到正确性，用**定时对账任务**拿到确定性。
> MQ 是闹钟，订单表是真相，对账是保险。

---

## 目录

- [0. 结论先看](#0-结论先看)
- [1. 需求分析（15%）](#1-需求分析15)
- [2. 六种方案，逐个说死在哪（30%）](#2-六种方案逐个说死在哪30)
- [3. RocketMQ 方案完整设计（40%）](#3-rocketmq-方案完整设计40)
- [4. 高可用、监控与秒杀联动（15%）](#4-高可用监控与秒杀联动15)
- [5. 面试官可能的 5 个追问](#5-面试官可能的-5-个追问)
- [6. 补充：几个容易被追问的细节](#6-补充几个容易被追问的细节)
- [7. 一页纸速记](#7-一页纸速记)

---

## 0. 结论先看

| 角色 | 由谁承担 | 负责什么 | 可能出的问题 |
|---|---|---|---|
| **闹钟** | RocketMQ 延迟消息 | 15 分钟后叫你一次 | 可能不准、可能重复、可能不响 |
| **裁判** | 订单表 + 条件更新 | 判定 PAID / CLOSED 谁是赢家 | 无（数据库行锁兜底） |
| **保险** | 定时对账任务 | 把漏掉的订单全部捞回来 | 无（最终一定关） |

**核心思路**：不要把「定时」和「正确性」绑在同一个组件上。

- 定时能力可以不准（晚几十秒无所谓），所以交给 MQ 这种「尽力准时」的组件；
- 正确性必须 100%，所以交给数据库的原子条件更新；
- 万一前两者都失效，用对账任务兜底。

### 0.1 技术选型速览

| 方案 | 时效精度 | 可靠性 | 可支撑量级 | 复杂度 | 裁决 |
|---|---|---|---|---|---|
| `@Scheduled` 扫表 | 分钟级（=扫描周期） | 高（DB 为准） | 日百万勉强 | ★ | ✅ 兜底 |
| `DelayQueue` / `ScheduledExecutorService` | 毫秒级 | **极低**（重启即丢） | 单机万级 | ★ | ❌ 否决 |
| Redis 过期监听 | **不可控**（可能永不触发） | **极低**（无 ACK） | 不可用于核心 | ★ | ❌ 否决 |
| Redis ZSet 延迟队列 | 百毫秒级 | 中（需自建 ACK/重投） | 十万级 QPS | ★★★ | ⭕ 备选 |
| **RocketMQ 延迟消息** | 秒级 | **高**（持久化+重试+死信） | 百万～千万级 | ★★★ | ✅ **推荐** |
| RabbitMQ TTL+DLX | 秒级 | 中高（队首阻塞） | 十万级 | ★★ | ⭕ 可选 |
| Kafka 变通 | 取决于外部调度 | 中（全靠自建） | 非其所长 | ★★★★ | ❌ 不推荐 |
| 时间轮 | 毫秒～百毫秒 | **极低**（单机内存） | 单机 | ★★ | ⭕ 内部实现 |

### 0.2 术语速查（零并发经验可先读这）

| 术语 | 一句大白话 |
|---|---|
| **幂等** | 同一个操作做 1 次和做 10 次，结果一样。像电梯按钮，按 1 下和按 10 下都是来一趟。 |
| **乐观锁** | 改的时候带上「我看到的版本号」，如果别人改过就失败重来。像抢车位：看到空位就冲，到了发现被占就换一个。 |
| **CAS** | Compare And Swap，「如果还是我看到的那个值，就改成新值」，一步完成、不可被打断。 |
| **TOCTOU** | 先检查、后使用，中间被插队。像「看冰箱有蛋糕 → 去拿盘子 → 回来蛋糕没了」。 |
| **at-least-once** | 消息至少投递一次，可能重复，但不会丢。绝大多数 MQ 的默认语义。 |
| **ACK** | 确认收到。消费者告诉 broker「我处理完了，可以删了」。 |
| **死信队列** | 处理失败且重试耗尽的消息，扔进一个专门的队列等人处理（DLQ）。 |
| **消费者组 / rebalance** | 一组消费者分摊队列；有人上下线时重新分配谁消费哪些队列。 |
| **行锁** | 数据库在某一行上加的锁，别人要改这一行必须排队。 |
| **延迟消息** | 发出去不立刻投递，等指定时间后才让消费者收到。 |
| **最终一致** | 不要求同一瞬间全都改完，只要求过一会儿都对。 |
| **本地消息表 (Outbox)** | 把「要发的消息」和业务数据写在同一个本地事务里，再异步发，保证不丢。 |
| **时间轮** | 一个环形钟表，指针转一圈处理一格里的任务。 |
| **当前读** | MySQL 的 `UPDATE ... WHERE` 读的是最新已提交数据，不走快照，所以不会读到旧状态。 |

---

## 1. 需求分析（15%）

### 1.1 维度一：时效精度——先确定「误差往哪边偏」

这个维度很多人一句话带过，其实它决定了后面所有方案的评价标准。

| 误差方向 | 后果 | 可接受度 |
|---|---|---|
| **晚关**（超过 15 分钟才关） | 库存、优惠券被多占用一会儿，少卖一点 | ✅ 可接受，用兜底收敛 |
| **早关**（不到 15 分钟就关） | 用户正在支付却被关单，付了钱订单没了 | ❌ **不可接受，P0 事故** |

由此得出三条评价标尺，后面每套方案都用它打分：

1. **不早**：绝不能在用户支付窗口内关单。
2. **准时**：尽量贴近 15 分钟，秒级精度足够，分钟级误差可容忍。
3. **不漏**：最终 100% 关闭。哪怕晚 1 小时，也不能有订单永远挂在「待支付」。

> 面试话术：「这道题的精度要求不是『准到秒』，而是『**宁可晚，不可早，且必须不漏**』。这三句话决定了技术选型。」

### 1.2 维度二：数据量级——先把账算清楚

先算数。这一步很多候选人会跳过，但面试官很看重「**你对量的感觉**」。

| 指标 | 计算 | 结果 |
|---|---|---|
| 平均下单 QPS | 1,000,000 / 86,400 | ≈ **11.6 /s** |
| 峰值下单 QPS（按 5 倍） | 11.6 × 5 | ≈ **58 /s** |
| 大促瞬时 QPS | 再 ×10 | ≈ **600 /s** |
| 15 分钟窗口内滞留的待支付订单 | 11.6 × 900 | ≈ **1.04 万** |
| 每天真正需要关单的数量（按 20% 未支付） | 100 万 × 20% | **20 万 /天 ≈ 2.3 /s** |
| 每天延迟消息量 | 每单一条 | **100 万 ≈ 11.6 条/s** |

看清这张表，会得到一个**反直觉**的结论：

> **日均百万这个量级，其实不大。** 峰值每秒几十单，关单每秒个位数，连最简单的扫表方案都扛得住。

那为什么还要认真设计？三个真实原因：

1. **峰值**：秒杀场景 10 万单在 1 分钟内涌入，15 分钟后同时到期，瞬时关单压力是均值的**几百倍**（几万单要在几分钟内消化完）。
2. **增长**：业务翻 10 倍、100 倍时，方案能不能平滑扩？还是必须推倒重来？
3. **正确性**：量级再小，一次「关掉已支付订单」就是事故。**可靠性永远优先于性能。**

> 这一节的价值在于：**敢说「百万级其实不大」的候选人，比上来就堆「分库分表 + 多级缓存」的候选人更可信。** 架构师的第一能力是判断量级，不是堆技术。

### 1.3 关单时要做的完整业务动作

| # | 动作 | 数据源 | 失败后果 |
|---|---|---|---|
| 1 | 订单状态：待支付 → 已关闭 | `t_order` | —— |
| 2 | 释放库存（预占 → 可用） | 库存服务（DB + Redis） | **少卖**（货压在预占里） |
| 3 | 释放优惠券（锁定 → 可用） | 券服务 | 用户券过期、客诉 |
| 4 | 释放已扣的积分/余额 | 账户服务 | **资损** |
| 5 | 通知用户「订单已关闭」 | 短信 / 推送 / 站内信 | 客诉、重复咨询 |
| 6 | 写关单流水 + 发领域事件 | 日志表 / MQ | 无法审计、下游不同步 |

**为什么 5 和 6 不能放进主事务**：短信服务挂了不该导致关单失败。通知必须「尽力而为 + 异步重试」，绝不能成为主链路的强依赖。

### 1.4 为什么必须谈事务和幂等

#### 事务：1 和 2 必须同生共死

| 故障 | 后果 | 严重性 |
|---|---|---|
| 订单关了，库存没释放 | 库存被永久占用，**少卖** | 收入损失 |
| 库存释放了，订单没关 | 用户还能继续支付，**超卖** | **资损 + 履约事故** |

但 1～6 跨了 4 个服务，**做不到一个本地事务**。取舍：

- **1 + 6（本地）**：同一个数据库事务，强一致。
- **2、3、4（跨服务）**：本地消息表 + 最终一致（或事务消息），保证「要么都成功、要么补偿」。
- **5（通知）**：事务提交后再发（`AFTER_COMMIT`），允许失败重试。

#### 幂等：这笔单一定会被处理不止一次

原因有四个，而且都无法消除：

| 原因 | 说明 |
|---|---|
| at-least-once 语义 | 消费者处理成功但 ACK 丢失，broker 重投 |
| 生产端重发 | `syncSend` 超时但实际已送达，outbox 补偿又发一次 |
| 兜底对账 | 对账任务与延迟消息撞车，处理同一订单 |
| 人工重放 | 死信队列消息被运维重放 |

**不幂等的后果**：库存被回补两次 → 超卖 1 件 → 真实资损。

> **这是本题唯一不能妥协的地方。** 性能可以优化，方案可以换，幂等错了就是事故。

### 1.5 先把状态机定下来

后面所有并发问题的答案都在这张图里：

```
                    ┌──────────────┐
     下单成功 ────► │ PENDING_PAY  │  待支付
                    └──────┬───────┘
              支付成功     │   超时 / 用户取消 / 风控拦截
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌────────────┐            ┌────────────┐
       │    PAID    │            │   CLOSED   │
       └──────┬─────┘            └────────────┘
              │ 退款                    ▲
              ▼                         │
       ┌────────────┐                   │
       │  REFUNDED  │───────────────────┘   （不可回流）
       └────────────┘
```

**三条铁律**：

1. **`PAID` 和 `CLOSED` 是互斥终态**，同一时刻只能有一个赢。
2. **状态只能沿箭头走**，不能跳、不能回。`CLOSED` 之后不能改回 `PAID`。
3. **每次跃迁都必须是「带条件的更新」**，条件就是「当前状态」。

第 3 条是全文的地基：**它让「状态机」同时变成了「并发锁」和「幂等键」。** 后文所有正确性论证都从这里出发。

---

## 2. 六种方案，逐个说死在哪（30%）

### 2.1 定时任务轮询数据库

**原理**

```java
@Scheduled(cron = "0 */1 * * * ?")          // 每分钟扫一次
public void closeTimeoutOrders() {
    // status=0(待支付) 且 create_time < now-15min
    List<Long> ids = orderMapper.selectTimeoutIds(500);
    ids.forEach(orderCloseService::closeTimeoutOrder);
}
```

配套索引：

```sql
ALTER TABLE t_order ADD INDEX idx_status_create (status, create_time);
```

**优点**

- 实现成本最低，几十行代码。
- **数据库是唯一真相**，天然不存在「消息丢了」这回事。
- 条件更新天然幂等。
- 不引入任何中间件，运维零负担。

**为什么百万级会顶到天花板**

1. **精度和压力被绑死。** 想让误差 ≤ 1 秒，就得每秒扫一次；每秒扫一次，DB 就要每秒做一次「索引区间定位 + 回表 + 批量更新」。这是**用数据库的 IO 换定时精度**，性价比极低。
2. **扫的不是「到期的 10 个」，而是「待支付的 1 万个」。** 走 `(status, create_time)` 索引做范围扫描时，15 分钟窗口内**所有**待支付订单都在扫描区间里（哪怕只有几条真正到期）。秒杀后窗口内可能有 10 万单，扫一次就是 10 万行。
3. **深分页陷阱。** 一批处理不完就要 `LIMIT offset, size`，offset 越大越慢，必须改成游标 `WHERE id > lastId`。
4. **多实例重复。** 要么加分布式锁串行（吞吐上限 = 单机），要么手动按 id 分片（复杂度陡增）。
5. **和在线业务抢行锁。** 批量 `UPDATE ... WHERE status=0` 会持有大量行锁，与用户支付事务争抢，支付 RT 抖动。
6. **数据增长非线性恶化。** 表从 1 亿到 10 亿，B+ 树变深、索引页缓存命中率下降，扫描成本会缓慢但确定性地变差。

**索引优化后的天花板**

单机 MySQL 用 `(status, create_time)` 索引 + 游标分页 + 每批 500 行 + 批量 `UPDATE`，大约能稳定做到 **每秒几千行** 的关单吞吐（瓶颈是 redo log 写入 + 行锁 + binlog）。

- 对日均百万（峰值关单 2.3 单/秒）：**绰绰有余**。
- 对「秒杀后 15 分钟一次性关 2 万单」：会形成几分钟的关单延迟尖峰。

> **死穴一句话**：**扫描周期就是精度上限，想更准就得更频繁地扫，而数据库扛不住用 IO 换精度——精度和容量被锁死在同一根绳上。**

**裁决：不否定，降级为兜底。**

在日均百万且无 MQ 运维能力的团队，它就是**正确解**。在本题里它退居二线当「对账任务」，价值反而更大——**它是唯一不依赖任何中间件的最终保险**。

> 面试加分点：主动说出「这个量级扫表其实够用，我选 MQ 是为了弹性和峰值，不是为了炫技」，比硬吹 MQ 高级更让面试官信服。

---

### 2.2 DelayQueue / ScheduledExecutorService

**原理**

```java
// DelayQueue 内部：PriorityQueue（按到期时间的小顶堆）+ Leader-Follower 模式
// 元素必须实现 Delayed，getDelay() 返回剩余时间，<= 0 才能被 take 出来
DelayQueue<DelayedOrder> queue = new DelayQueue<>();
queue.put(new DelayedOrder(orderId, 15, TimeUnit.MINUTES));

// 一个线程阻塞在 take() 上，拿到就处理
while (true) {
    DelayedOrder task = queue.take();   // 阻塞直到有任务到期
    closeService.close(task.getOrderId());
}
```

`ScheduledExecutorService.schedule(task, 15, MINUTES)` 内部是 `DelayedWorkQueue`，同样是小顶堆，工作线程用 `available.awaitNanos(delay)` 等待。

**优点**

- 纯内存、零依赖、毫秒级精度。
- 单机性能极好（堆操作 `O(log n)`）。

**三个致命伤**

1. **进程重启 = 任务全丢。**
   堆里的 1 万个待取消任务**没有任何持久化**。JVM 一挂、发布重启、机器宕机，这些订单**永远不会被自动关闭**，库存和券被永久占用。这是「数据丢失」级别的缺陷，不是「可用性」问题。
2. **多实例无法协同。**
   N 台机器各有各的队列，互相看不见：
   - 订单被路由到 A 机器入队，A 挂了 → 任务丢；
   - 请求分散到 N 台，每台都塞一份 → **重复关单**。
3. **内存与 GC 压力。**
   任务对象要在堆里活满 15 分钟，正好跨过年轻代晋升阈值 → 直接进老年代。秒杀峰值瞬间涌入 10 万个任务 ≈ 几十 MB 老年代对象，叠加 Full GC 风险；且队列长度、堆积情况**完全不可观测**。

**补充坑（说出来是加分项）**

- `scheduleAtFixedRate` 的任务抛异常会**静默终止后续调度**（不打印、不报警），变成「定时任务莫名其妙不跑了」。
- `System.currentTimeMillis()` 受 NTP 校时影响会跳变，`ScheduledExecutorService` 内部用 `nanoTime` 相对安全，但**跨机器时间不一致依旧无解**。

> **死穴一句话**：**任务只活在当前 JVM 的堆里，进程一死任务全丢，天生无法多实例协同——它解决的是「单机定时」，不是「分布式延迟任务」。**

**裁决：否决。**

仅适合单机、可丢、非核心的短延迟场景（接口超时、缓存刷新、连接空闲检测）。

---

### 2.3 Redis 过期监听（Keyspace Notification）

**原理**

```bash
# 开启过期事件通知
CONFIG SET notify-keyspace-events Ex      # E = keyspace 事件，x = 过期事件

# 订阅
SUBSCRIBE __keyevent@0__:expired

# 下单时
SET order:delay:{orderId} 1 EX 900         # 15 分钟后过期
```

看起来很美，**实际上不能用于资金相关业务**。四个不可靠点：

#### ① 过期不是「到点就删」

Redis 的过期删除是 **惰性删除 + 定期删除**：

- **惰性删除**：key 到期后不主动删，等有人访问它时才删。
- **定期删除**：后台每 100ms 随机抽 20 个带 TTL 的 key 检查，删掉过期的；若这批里过期比例 > 25% 就再抽一轮（限时 25ms）。

**后果**：一个到期的 key 可能**几小时都没被抽到**，事件就一直不发。只要没人访问它，它就一直躺在那里。所谓「15 分钟到期」，可能变成 16 分钟、1 小时、甚至**永不触发**。

#### ② 事件是 fire-and-forget 的 pub/sub

没有 ACK、没有持久化、没有重投。订阅端断线重连的那几秒，**所有事件永久丢失**。Redis 不承诺「至少一次」，更不承诺「恰好一次」。

#### ③ 主从/集群下事件来源不可控

过期事件只在**真正删除 key 的那个节点**发出。从库不主动过期（靠主库同步 DEL），**主从切换、故障转移期间的事件就丢了**。

#### ④ 无法反解业务、无法削峰

事件体只有 key 名，你得从 key 里解析订单号；大量 key 同时过期会让 Redis 单线程卡顿（定期删除的循环会挤占命令执行，表现为其他命令 RT 抖动）。

> **死穴一句话**：**过期事件是「尽力而为的广播」，Redis 既不承诺它一定发、也不承诺只发一次，拿它做关单就是拿资损赌运气。**

**裁决：否决。**

可用于缓存预热、临时数据清理等**非关键**场景，绝不能用于订单、支付、库存。

---

### 2.4 Redis ZSet 延迟队列

**原理**：用 ZSet 当「按时间排序的待办清单」。

```java
// 投递：score = 到期时间戳（毫秒）
redis.opsForZSet().add("delay:order:close", orderId, expireAtMs);

// 拉取：取 score <= now 的最多 10 条
Set<String> due = redis.opsForZSet()
        .rangeByScore("delay:order:close", 0, System.currentTimeMillis(), 0, 10);
```

**优点**

- 实现简单、**完全可控**，不依赖 MQ 团队的排期和运维。
- 精度可达百毫秒（取决于轮询间隔），远好于扫表。
- ZSet 操作 `O(log N)`，单集群十万级 QPS 无压力。
- 内存占用极小：1 万待支付订单 × 约 100B ≈ **1MB**，忽略不计。

**必须自己解决的 7 个问题**（这就是「自建 MQ」的代价）

#### ① 取 + 删不原子 → 重复消费

`ZRANGEBYSCORE` 之后 `ZREM` 是两个操作，两个消费者会取到同一条。解决：

```lua
-- KEYS[1]=delay:order:close  ARGV[1]=now  ARGV[2]=limit
-- 取和删合成一个原子操作
local due = redis.call('ZRANGEBYSCORE', KEYS[1], 0, ARGV[1], 'LIMIT', 0, ARGV[2])
for i, v in ipairs(due) do
    redis.call('ZREM', KEYS[1], v)
end
return due
```

或者利用 `ZREM` 的返回值做 CAS：**返回 1 才算抢到**，返回 0 说明被别人抢走了，跳过这条。

#### ② 删了但没处理完 → 任务丢失

`ZREM` 成功后消费者崩了，任务从 Redis 消失而业务没做 → **永久丢失**。

解决：**两阶段 ACK**（和 RabbitMQ 的 unacked 一个思路）：

```
ZREM 主队列 → 写入 processing ZSet（score = 处理超时时间）
            → 业务执行成功 → ZREM processing
            → 定时任务扫 processing 中 score < now 的（超时未确认）
               → ZADD 回主队列重试
```

#### ③ 空轮询浪费 QPS

没到期也每秒查一次。解决：取最小的 score，算出还需等多久再睡（`minScore - now`），或用 `BLPOP` 阻塞等待一个「有新任务」的信号 key。

#### ④ 持久化强度不够

Redis 主从是**异步复制**，主挂了可能丢最近写入；AOF `everysec` 最多丢 1 秒。对「可补偿」的关单可接受（有对账兜底），对「必须精确」的不行。

#### ⑤ 单 key 热点

10 万个 member 挤在一个 ZSet，落在一个 slot / 一个节点。解决：按 `orderId % N` 拆成 N 个 ZSet，消费者分别轮询。

#### ⑥ 定时到期洪峰

秒杀后 15 分钟，几万条同时到期，一次取 10 条要取几千轮。解决：按到期时间再分桶（`delay:order:close:{分钟}`）、扩批量、多消费者。

#### ⑦ 可观测性全靠自己

积压量 = `ZCARD`，最早到期时间 = `ZRANGE ... WITHSCORES LIMIT 0 1`，都要自己接监控。

**适用量级**：单 Redis 集群可撑十万级 QPS 的 ZADD/ZREM，**日百万单完全够用**。

> **死穴一句话**：**它把「可靠性」押在 Redis 的持久化上，本质是自己重写一个 MQ——ACK、重投、积压、死信、顺序，每一样都得自己再实现一遍。**

**裁决：备选。**

适合「不想引入 MQ、量级中等、能接受最终一致」的团队。设计正确的话，它是除 MQ 外**最实用**的方案。

---

### 2.5 消息队列延迟消息（推荐）

#### 2.5.1 RocketMQ

**4.x 原理**：延迟消息不直接进业务 topic，而是先写入内部 topic `SCHEDULE_TOPIC_XXXX`（按延迟级别分 18 个队列）。后台服务 `ScheduleMessageService` 为每个 level 起一个定时器，每秒扫描该队列，把到期消息的 topic/queueId **改回真实值**，重新投递到业务 topic，消费者这时才看到。

**4.x 的硬限制**：延迟级别是**固定的 18 档**，写死在 broker 配置 `messageDelayLevel`：

```
1s 5s 10s 30s 1m 2m 3m 4m 5m 6m 7m 8m 9m 10m 20m 30m 1h 2h
```

**没有 15 分钟。** 这是本题第一个真实的工程细节，处理方式见 [3.2](#32-15-分钟这个非标延迟怎么发)。

**5.x 原理**：改用**时间轮 + timerLog 持久化**，支持任意延迟（`setDelayTimeMs`），精度更高，不受 18 档限制，延迟消息与普通消息的存储分离更彻底。

**优点**

- 天然持久化（刷盘 + 主从同步复制）。
- 消费失败**自动重试**（默认 16 次，间隔递增）。
- **死信队列**、消费进度管理、水平扩容、积压监控。
- 削峰：瞬时几万条到期消息不会直接打穿下游。

> **你不需要自己实现 ACK、重投、积压、死信——这正是它比 ZSet 强的地方。**

**缺点**

- 4.x 延迟级别固定、精度受 1s 扫描周期影响。
- 同一时刻大量消息到期，会在 `SCHEDULE_TOPIC` 形成堆积，可能拖慢扫描线程（建议延迟消息用独立 broker 或独立集群）。
- 运维成本高于 Redis。

#### 2.5.2 RabbitMQ

两条路，各有死穴。

**路子 A：TTL + DLX（死信交换机）**

```
生产者 → order.delay.queue（x-message-ttl=900000，故意不设消费者）
              ↓ 消息过期
       x-dead-letter-exchange → order.cancel.queue → 消费者
```

> **死穴：队首阻塞（head-of-line blocking）。**
> RabbitMQ **只检查队头消息是否过期**。如果队头是 TTL=30 分钟的消息，后面 TTL=15 分钟的全都堵着，直到队头过期才一起「泄洪」。
> 所以这条路**只适用于所有消息 TTL 相同**的场景。本题恰好都是 15 分钟，勉强可用；但一旦有「30 分钟未支付关单」「7 天自动确认收货」等不同延迟，就必须换方案。
> 另外：消息实际延迟 = TTL + 排队时间，不是精确 TTL。

**路子 B：`rabbitmq_delayed_message_exchange` 插件**

- 声明 `x-delayed-type=direct` 的交换机，发消息时加 header `x-delay: 900000`，插件内部用 Mnesia 表 + Erlang 定时器投递，支持任意延迟、精度良好。
- **死穴：延迟消息存在单节点的 Mnesia 里，不参与镜像队列复制。**
  节点挂了，该节点上的延迟消息就丢了；集群扩容时也无法自动迁移。且大量延迟消息时内存/磁盘压力大、性能明显下降。

**裁决**：RabbitMQ 更适合「中小量级 + TTL 统一」的场景；本题要弹性扩展 + 多种延迟混杂，不如 RocketMQ 直接。

#### 2.5.3 Kafka

**Kafka 没有原生延迟消息**（3.x 也没有；Confluent 和 Pulsar 有）。三种变通，都很别扭：

1. **多级 topic 转发**：按延迟时长分 topic（`delay-1m`、`delay-5m`、`delay-15m`），消费后判断是否到期，未到期转发到下一级。→ 一条消息被放大 N 倍、topic 数量爆炸、流转逻辑全要自己维护。
2. **外部索引 + 定时扫**：把 `(到期时间, orderId)` 写 Redis/DB，另起调度器扫到期后投递到 Kafka。→ 延迟能力其实在外部，Kafka 只做最终投递，等于没用它的延迟。
3. **换 Pulsar**：原生 `deliverAfter(Duration)`，但要引入新中间件。

> **死穴一句话**：**Kafka 的设计目标是「高吞吐的顺序日志流」，不是「定时调度」；硬做延迟消息是逆着它的模型走，成本远高于收益。**

**裁决：不推荐。**

如果公司只有 Kafka，正确做法是「Kafka + Redis ZSet 调度」组合，而不是硬改造 Kafka。

---

### 2.6 时间轮（HashedWheelTimer）

**原理**：一个环形数组（像钟表），指针按固定 tick 前进，每个格子挂一个任务链表。

```
wheelSize = 8, tickDuration = 1s

插入：
  slot   = (expireTime / tickDuration) & (wheelSize - 1)
  rounds = (expireTime / tickDuration) >> 3          // 还要转几圈

指针每秒走一格，取出该格所有任务：
  rounds > 0  → rounds--，重新挂回
  rounds == 0 → 执行
```

**插入 `O(1)`，执行均摊 `O(1)`** —— 这是它比小顶堆（`O(log n)`）强的地方，任务量越大优势越明显。

**分层时间轮**（Kafka / Linux 内核使用）：像钟表的秒针、分针、时针，低级轮转满一圈就往高级轮推一格，避免「圈数」过大导致的无效遍历。Kafka 的 `TimingWheel` 是 `wheelSize=20`、`tickMs=1ms` 的多层结构，支撑毫秒到天级的延迟。

**局限**

- 同 `DelayQueue`：**纯内存，重启即丢，无法分布式**。
- Netty 的 `HashedWheelTimer` 默认 `tickDuration=100ms`、**单线程驱动**，任务多时单线程成瓶颈；`maxPendingTimeouts` 有上限。
- 精度受 tick 限制，不做持久化、不做重试。

> **死穴一句话**：**`O(1)` 是「单机 CPU 层面」的最优解，但「任务存哪、谁来执行、宕机怎么办」它一个都不管。**

**裁决：不直接用于跨实例业务。**

它是 **MQ 和 Redis 内部实现延迟能力的底层算法**。面试时说出「RocketMQ 5.x 的 timerWheel、Kafka 的 TimingWheel 就是它，Netty 的 HashedWheelTimer 是单层简化版」，是明显的加分项。

---

### 2.7 选型对比与最终选择

| 方案 | 时效精度 | 可靠性（不丢/不重） | 可支撑量级 | 复杂度 | 裁决 |
|---|---|---|---|---|---|
| `@Scheduled` 扫表 | 分钟级（=扫描周期） | 高（DB 为准，天然幂等） | 日百万勉强，千万级吃力 | ★ | ✅ **兜底** |
| `DelayQueue` / `ScheduledExecutor` | 毫秒级 | **极低**（重启即丢、多实例重复） | 单机万级 | ★ | ❌ 否决 |
| Redis 过期监听 | **不可控**（可能永不触发） | **极低**（无 ACK、无持久化承诺） | 不可用于核心 | ★ | ❌ 否决 |
| Redis ZSet 延迟队列 | 百毫秒级 | 中（需自建 ACK/重投/死信） | 十万级 QPS | ★★★ | ⭕ 备选 |
| **RocketMQ 延迟消息** | 秒级（5.x 更准） | **高**（持久化 + 重试 + 死信） | 百万～千万级 | ★★★ | ✅ **推荐** |
| RabbitMQ TTL+DLX | 秒级 | 中高（队首阻塞、TTL 须一致） | 十万级 | ★★ | ⭕ 可选 |
| RabbitMQ 延迟插件 | 秒级 | 中（节点故障丢消息） | 十万级 | ★★★ | ⭕ 可选 |
| Kafka 变通 | 取决于外部调度 | 中（全靠自建） | 高吞吐但非其所长 | ★★★★ | ❌ 不推荐 |
| 时间轮 | 毫秒～百毫秒 | **极低**（单机内存） | 单机 | ★★ | ⭕ 内部实现 |

**最终选择：三层结构**

```
主链路：RocketMQ 延迟消息  → 拿到弹性、削峰、重试、死信
正确性：订单状态机条件更新 → 拿到幂等、并发安全、单一真相
兜底  ：定时对账扫表       → 拿到「永不遗漏」的确定性
```

---

## 3. RocketMQ 方案完整设计（40%）

### 3.1 全链路时序

```
┌──────┐  ①下单   ┌──────────┐  ②本地事务   ┌──────────────┐
│ 用户 │────────►│ 订单服务 │────────────►│ MySQL        │
└──────┘         └────┬─────┘ order+outbox │ t_order      │
                      │                    │ outbox       │
                      │ ③异步发延迟消息    └──────────────┘
                      ▼                    (10 分钟)
                 ┌──────────┐
                 │ RocketMQ │
                 └────┬─────┘
                      │ ④10 分钟后投递
                      ▼
                 ┌──────────────┐  ⑤查订单状态
                 │ 关单消费者   │──────────────► MySQL
                 └──────┬───────┘
          ┌─────────────┼──────────────┐
          │未满 15min   │已支付/已关闭  │待支付且已满 15min
          ▼             ▼              ▼
    ⑥补发剩余延迟   ⑦直接 ACK 丢弃   ⑧条件更新关单
                                          │
                              ┌───────────┼───────────┐
                              ▼           ▼           ▼
                          释放库存    释放优惠券   通知用户
                              │
                              ▼
                     回补 Redis 库存分片

┌──────────────────────────────────────────────────────┐
│ ⑨兜底对账：每 5 分钟扫 create_time < now-20min 且     │
│   status=待支付 → 走同一套关单逻辑（幂等，可重复执行）│
└──────────────────────────────────────────────────────┘
```

### 3.2 「15 分钟」这个非标延迟怎么发

RocketMQ 4.x 的 18 档里**没有 15 分钟**（只有 10m 和 20m）。三种解法，按推荐度排序：

#### 方案 A（推荐）：10 分钟 + 消费时按剩余时长补发

```
下单 → 发 level=14（10 分钟）
10 分钟后消费 → 计算 elapsed = now - createTime
    elapsed >= 15min → 关单
    elapsed <  15min → 补发一条「剩余时长」的延迟消息
```

> **绝对不能 `Thread.sleep(remaining)` 等 5 分钟。**
> 那会占住消费线程，整个消费组被拖死，消息积压雪崩。必须「补发消息，立即返回」。

补发时把 `remaining` 映射到**不小于它的最小延迟级别**，保证「不会提前触发」：

```java
/** 18 档：1s 5s 10s 30s 1m 2m 3m 4m 5m 6m 7m 8m 9m 10m 20m 30m 1h 2h */
private static final long[] LEVELS_MS = {
        1_000L, 5_000L, 10_000L, 30_000L,
        60_000L, 120_000L, 180_000L, 240_000L, 300_000L,
        360_000L, 420_000L, 480_000L, 540_000L, 600_000L,
        1_200_000L, 1_800_000L, 3_600_000L, 7_200_000L
};

/**
 * 找到「不小于 remainingMs 的最小级别」。
 * 保证补发后不会提前触发（宁可晚一点点）。
 */
private int mapToDelayLevel(long remainingMs) {
    for (int i = 0; i < LEVELS_MS.length; i++) {
        if (LEVELS_MS[i] >= remainingMs) {
            return i + 1;              // 级别从 1 开始
        }
    }
    return LEVELS_MS.length;           // 兜底：最大级别 2h
}
```

典型情况：剩余 5 分钟 → 命中 level=9（5m），**一次补发就够**。

#### 方案 B：升级 RocketMQ 5.x，直接任意延迟

```java
msg.setDelayTimeMs(900_000L);   // 15 分钟，一次到位，最干净
```

#### 方案 C（不推荐）：发 level=15（20 分钟）

消费时一定已超 15 分钟，但关单晚了 5 分钟。虽然符合「宁可晚不可早」，但大促时库存多占用 5 分钟直接影响转化。

> **面试话术**：「4.x 的延迟级别是固定的 18 档，没有 15 分钟。我会发 10 分钟，消费时判断剩余时长再补发一次 5 分钟；如果上 5.x 就直接用任意延迟。**这个细节能区分『用过』和『看过文档』。**」

### 3.3 代码：发送端

**先解决一个容易忽略的问题**：下单和发消息是两个动作，必须保证「订单建成 → 消息一定发出去」。

| 做法 | 说明 | 取舍 |
|---|---|---|
| 先建订单，再同步发消息 | 发失败就抛异常回滚订单 | 简单；但「消息发成功、响应超时」会导致订单回滚而消息已发（无害，消费时查不到订单直接丢） |
| RocketMQ **事务消息** | 半消息 → 执行本地事务 → commit/rollback | 最标准，但接入成本高、绑定 RocketMQ |
| **本地消息表（Outbox）** | 订单与「待发送消息」同本地事务落库，异步发送 + 定时补偿 | 通用、最稳、可审计、可重放 ✅ |

**我推荐本地消息表**：不绑定 MQ 实现，且天然支持「手工重放」。

#### ① 下单事务：订单 + Outbox 一起落库

```java
@Service
public class OrderCreateService {

    @Resource private OrderMapper orderMapper;
    @Resource private DelayMessageOutboxMapper outboxMapper;
    @Resource private StockService stockService;
    @Resource private CouponService couponService;
    @Resource private TransactionTemplate txTemplate;
    @Resource private DelayMessageSender delayMessageSender;

    public Order createOrder(CreateOrderCmd cmd) {
        Order order = txTemplate.execute(status -> {
            // 1) 建订单（状态 = 待支付）
            Order o = Order.create(cmd);              // createTime = now
            orderMapper.insert(o);

            // 2) 预占库存、锁定优惠券
            stockService.preOccupy(o.getOrderId(), cmd.getSkuId(), cmd.getCount());
            couponService.lock(o.getOrderId(), cmd.getCouponId());

            // 3) 同一个本地事务里写「待发送」记录
            //    这样「订单存在」和「消息会被发」是原子的
            outboxMapper.insert(DelayMessageOutbox.pending(
                    o.getOrderId(),
                    "ORDER_DELAY_TOPIC",
                    "close",
                    o.getCreateTime().plusMinutes(15)));

            return o;
        });

        // 4) 事务提交后再异步投递，不阻塞下单 RT
        delayMessageSender.sendAsync(order.getOrderId());
        return order;
    }
}
```

#### ② 投递 Outbox + 定时补偿

```java
@Component
public class DelayMessageSender {

    private static final Logger log = LoggerFactory.getLogger(DelayMessageSender.class);

    private static final String TOPIC = "ORDER_DELAY_TOPIC";
    private static final String TAG   = "close";

    /** RocketMQ 4.x 的 18 档：1s 5s 10s 30s 1m 2m 3m 4m 5m 6m 7m 8m 9m 10m 20m 30m 1h 2h */
    private static final int DELAY_LEVEL_10MIN = 14;

    @Resource private RocketMQTemplate rocketMQTemplate;
    @Resource private DelayMessageOutboxMapper outboxMapper;

    /** 下单后立即尝试投递（异步，不阻塞下单 RT） */
    @Async("delayMsgExecutor")
    public void sendAsync(String orderId) {
        DelayMessageOutbox record = outboxMapper.selectByBizId(orderId);
        if (record == null || record.getStatus() != OutboxStatus.PENDING) {
            return;
        }
        doSend(record);
    }

    /** 兜底：扫描 30 秒前仍为「待发送」的记录，重发（解决进程崩溃/发送失败） */
    @Scheduled(fixedDelay = 30_000)
    public void retryPending() {
        List<DelayMessageOutbox> list = outboxMapper.selectPending(100);   // create_time < now - 30s
        for (DelayMessageOutbox record : list) {
            doSend(record);
        }
    }

    /** 补发：消费端发现未满 15 分钟时调用 */
    public void sendRemaining(String orderId, long remainingMs) {
        int level = mapToDelayLevel(remainingMs);
        Message<OrderClosePayload> msg = MessageBuilder
                .withPayload(new OrderClosePayload(orderId))
                .setHeader(RocketMQHeaders.KEYS, orderId)
                .build();
        rocketMQTemplate.syncSend(TOPIC + ":" + TAG, msg, 3_000, level);
    }

    private void doSend(DelayMessageOutbox record) {
        try {
            Message<OrderClosePayload> msg = MessageBuilder
                    .withPayload(new OrderClosePayload(record.getBizId()))
                    .setHeader(RocketMQHeaders.KEYS, record.getBizId())   // 业务 key，便于排查
                    .build();

            // 同步发送：拿到 broker 明确 ACK 才认为成功
            SendResult result = rocketMQTemplate.syncSend(
                    TOPIC + ":" + TAG, msg, 3_000, DELAY_LEVEL_10MIN);

            if (result.getSendStatus() == SendStatus.SEND_OK) {
                // 幂等：update ... where status = 'PENDING'
                outboxMapper.markSent(record.getId());
            } else {
                log.warn("延迟消息发送未确认, outboxId={}, status={}",
                        record.getId(), result.getSendStatus());
            }
        } catch (Exception e) {
            // 不往外抛：交给定时补偿重试，避免把 @Scheduled 线程打挂
            log.error("延迟消息发送失败, outboxId={}", record.getId(), e);
        }
    }
}
```

**几个设计取舍要说清楚：**

- **为什么用 `syncSend` 而不是 `asyncSend`**：要让「发送成功」有明确回执，才能更新 outbox 状态；`asyncSend` 回调丢失时无法区分成功与失败。3 秒超时后交给定时补偿。
- **为什么消息体要带 `expectTime`（或让消费端用 `createTime`）**：消费端**不信任消息到达时间**，用订单自己的 `createTime + 15min` 判断是否真到期，这是防「早关」的第二道保险。
- **为什么 outbox 记录要带 `expectTime`**：便于运维直接 SQL 查出「哪些订单的消息本该发了却没发」。

### 3.4 代码：消费者

```java
@Component
@RocketMQMessageListener(
        topic = "ORDER_DELAY_TOPIC",
        consumerGroup = "order-close-consumer-group",
        selectorExpression = "close",
        consumeMode = ConsumeMode.CONCURRENTLY,   // 并发消费，追求吞吐
        messageModel = MessageModel.CLUSTERING    // 集群消费：同组内一条消息只被一个实例消费
)
public class OrderCloseConsumer implements RocketMQListener<OrderClosePayload> {

    private static final Logger log = LoggerFactory.getLogger(OrderCloseConsumer.class);

    /** 15 分钟 = 900_000 ms */
    private static final long CLOSE_AFTER_MS = 15 * 60 * 1000L;

    @Resource private OrderMapper orderMapper;
    @Resource private OrderCloseService orderCloseService;
    @Resource private DelayMessageSender delayMessageSender;

    @Override
    public void onMessage(OrderClosePayload payload) {
        String orderId = payload.getOrderId();
        try {
            // ① 查订单：延迟消息只是「闹钟」，订单表才是「真相」
            Order order = orderMapper.selectById(orderId);
            if (order == null) {
                log.info("订单不存在，丢弃延迟消息, orderId={}", orderId);
                return;                                    // 正常 ACK
            }

            // ② 状态校验：已支付 / 已关闭 / 已退款 → 直接丢弃
            if (!OrderStatus.PENDING_PAY.getCode().equals(order.getStatus())) {
                log.info("订单状态已变更，丢弃延迟消息, orderId={}, status={}",
                        orderId, order.getStatus());
                return;
            }

            // ③ 时间校验：4.x 只有 10 分钟档，这里判断是否真到 15 分钟
            long elapsed = System.currentTimeMillis() - order.getCreateTime().getTime();
            if (elapsed < CLOSE_AFTER_MS) {
                long remaining = CLOSE_AFTER_MS - elapsed;
                log.info("未到关单时间，补发延迟消息, orderId={}, remaining={}ms",
                        orderId, remaining);
                delayMessageSender.sendRemaining(orderId, remaining);   // 立即返回，绝不 sleep
                return;
            }

            // ④ 执行关单（内部保证幂等 + 并发安全）
            boolean closed = orderCloseService.closeTimeoutOrder(orderId);
            log.info("超时关单处理完成, orderId={}, closed={}", orderId, closed);

        } catch (Exception e) {
            // 抛出异常 → RocketMQ 按重试策略重投（默认 16 次，间隔递增）
            // 重试耗尽 → 进入 %DLQ%order-close-consumer-group 死信队列
            log.error("关单消费失败, orderId={}", orderId, e);
            throw e;
        }
    }
}
```

**为什么 `catch` 之后还要 `throw e`**：这是 RocketMQ 的重试语义依赖。吞掉异常 = 告诉 broker「我处理成功了」= 消息被丢弃。**必须抛，才能触发重试和死信。**

### 3.5 代码：关单服务（幂等 + 事务 + 并发安全的核心）

```java
@Service
public class OrderCloseService {

    private static final Logger log = LoggerFactory.getLogger(OrderCloseService.class);

    @Resource private OrderMapper orderMapper;
    @Resource private StockService stockService;
    @Resource private CouponService couponService;
    @Resource private OrderCloseLogMapper closeLogMapper;
    @Resource private ApplicationEventPublisher eventPublisher;
    @Resource private TransactionTemplate txTemplate;

    /**
     * 超时关单。
     *
     * 幂等性：条件更新 + 唯一索引 + 下游 bizNo（三重）
     * 并发安全：数据库行锁 + 状态机条件（由数据库保证原子）
     *
     * @return true  = 本次真正关闭了订单
     *         false = 已被支付 / 已被关闭 / 重复执行
     */
    public boolean closeTimeoutOrder(String orderId) {
        Boolean closed = txTemplate.execute(status -> {

            // ── step 1: 状态机条件更新（唯一的「真相裁决」）───────────────
            // 一条 SQL 同时完成：状态校验 + 状态跃迁 + 乐观锁（version）
            // 并发下 InnoDB 行锁让两个事务串行，只有一个能 affected = 1
            int affected = orderMapper.closeIfPendingPay(
                    orderId,
                    OrderStatus.PENDING_PAY.getCode(),
                    OrderStatus.CLOSED.getCode(),
                    CloseReason.TIMEOUT.getCode());

            if (affected == 0) {
                // 已被支付 / 已被其他消费者关闭 / 订单不存在 → 幂等退出
                return false;
            }

            // ── step 2: 写关单流水（唯一索引 order_id 做二次幂等）───────
            int logRows = closeLogMapper.insertIgnore(orderId, CloseReason.TIMEOUT.getCode());
            if (logRows == 0) {
                // 状态刚才是待支付，但流水已存在 → 数据异常，属于需要人工介入的脏数据
                log.error("关单流水已存在但订单状态为待支付，疑似数据不一致, orderId={}", orderId);
            }

            // ── step 3: 释放库存（DB 账本 + Redis 缓存回补）──────────────
            // 下游用 bizNo = "CLOSE_" + orderId 做幂等
            stockService.releaseByOrder(orderId, "CLOSE_" + orderId);

            // ── step 4: 释放优惠券 ────────────────────────────────────
            couponService.releaseByOrder(orderId, "CLOSE_" + orderId);

            // ── step 5: 发领域事件（事务提交后异步通知用户）────────────
            eventPublisher.publishEvent(new OrderClosedEvent(orderId, CloseReason.TIMEOUT));

            return true;
        });
        return Boolean.TRUE.equals(closed);
    }
}
```

**关键 SQL：把「状态校验」写进 WHERE**

```xml
<!-- OrderMapper.xml -->
<update id="closeIfPendingPay">
    UPDATE `t_order`
       SET status       = #{toStatus},
           close_reason = #{reason},
           close_time   = NOW(3),
           update_time  = NOW(3),
           version      = version + 1
     WHERE id = #{orderId}
       AND status = #{fromStatus}
       <!-- 双保险：即使消息提前到达，也绝不可能关掉未满 15 分钟的订单 -->
       AND create_time &lt;= DATE_SUB(NOW(3), INTERVAL 15 MINUTE)
</update>
```

**通知用「事务提交后」触发**

```java
@Component
public class OrderClosedNotifier {

    private static final Logger log = LoggerFactory.getLogger(OrderClosedNotifier.class);

    @Resource private SmsService smsService;
    @Resource private PushService pushService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Async("notifyExecutor")
    public void onOrderClosed(OrderClosedEvent event) {
        try {
            smsService.sendOrderClosed(event.getOrderId());
            pushService.push(event.getOrderId(), "订单已超时关闭，库存已释放");
        } catch (Exception e) {
            // 通知失败不影响关单结果，记录后由通知中心重试
            log.error("关单通知失败, orderId={}", event.getOrderId(), e);
        }
    }
}
```

> **为什么一定要 `AFTER_COMMIT`**：如果事务最终回滚了，用户却收到了「订单已关闭」的短信，就是不折不扣的客诉。**外部副作用必须在事务确认成功之后才发出。**

### 3.6 为什么消费者必须「先查状态再决定」

**延迟消息只表达一个时间事实：「15 分钟过去了」。它不表达任何业务事实。**

从「消息发出」到「消息被消费」，订单可能已经：

- 被用户支付了（最常见）
- 被用户主动取消
- 被风控 / 运营关闭
- 被另一个消费者关掉了（重复投递）
- 走过退款流程

所以正确的心智模型是：

> **MQ 是闹钟，订单表是真相。闹钟响了，你得先看一眼自己起没起。**

如果消费者直接 `UPDATE t_order SET status='CLOSED' WHERE id=?`（不带状态条件）：

| 场景 | 后果 |
|---|---|
| 用户已支付 | 付了钱的订单被关掉 → **P0 事故**：钱收了、货不发、库存还回补了 → **超卖** |
| 已被别的消费者关过 | 库存回补两次 → **超卖** |
| 订单已退款 | 状态被改回 CLOSED → **状态机错乱**，对账永久不平 |

**这条规则可以泛化**：

> **任何由「定时 / 异步 / 延迟」触发的状态变更，都必须以「重新读取当前真相 + 条件更新」为前提。**
> **消息是触发源（trigger），不是事实源（source of truth）。**

这是分布式系统的通用原则，不只是订单。缓存失效、任务调度、事件驱动架构，全部适用。

### 3.7 幂等设计：四道防线

**先问：为什么会重复？**

| 原因 | 说明 |
|---|---|
| at-least-once | 消费者处理成功但 ACK 丢失，broker 重投 |
| 生产端重发 | `syncSend` 超时但实际已送达，outbox 补偿又发一次 |
| 兜底对账 | 对账任务与延迟消息同时处理同一订单 |
| 人工重放 | 死信队列消息被运维重放 |

**四道防线（从强到弱，可叠加）**

#### ① 状态机条件更新（最强，必选）

```sql
UPDATE t_order SET status = 'CLOSED' WHERE id = ? AND status = 'PENDING_PAY'
```

第二次执行 `affected = 0`，天然幂等。**用数据库的原子性做幂等**，不需要额外存储，也不会被并发击穿。

#### ② 唯一索引（兜住外部副作用）

```sql
CREATE TABLE t_order_close_log (
    id        BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id  VARCHAR(32) NOT NULL,
    reason    VARCHAR(16) NOT NULL,
    UNIQUE KEY uk_order_id (order_id)      -- 同一订单只能有一条关单流水
);
```

即使 ① 因某种原因失效（比如手工改库），② 也能拦住重复写流水。

#### ③ 下游幂等键（跨服务必备）

调库存服务时带 `bizNo = "CLOSE_" + orderId`，库存服务建 `(biz_no)` 唯一索引，重复请求直接返回「已处理」。

> 这样即使订单侧重试 10 次，库存也只回补 1 次。**跨服务的幂等责任，永远由被调用方用自己的唯一键承担。**

#### ④ 分布式锁（可选，只是优化）

```java
// 拿不到锁直接跳过，减少无效重试
// 但绝不能「只靠锁」做幂等：锁会过期、会失效、Redis 会抖
Boolean ok = redis.opsForValue()
        .setIfAbsent("lock:close:" + orderId, "1", 30, TimeUnit.SECONDS);
if (!Boolean.TRUE.equals(ok)) {
    return;
}
```

#### ⚠️ 必须强调的反面教材：不要「先查后改」

```java
// ❌ 错误：check-then-act，并发下必然失效（TOCTOU 问题）
Order order = orderMapper.selectById(orderId);
if (OrderStatus.PENDING_PAY.getCode().equals(order.getStatus())) {
    // 两个线程可能同时走到这里，都看到「待支付」
    orderMapper.updateStatus(orderId, OrderStatus.CLOSED.getCode());
    // → 库存被回补两次 → 超卖
}
```

**正确姿势是 CAS：把判断条件放进 SQL 的 WHERE 里，用影响行数判断是否抢到。**

```java
// ✅ 正确
int affected = orderMapper.closeIfPendingPay(...);
if (affected == 0) {
    return false;          // 没抢到，说明别人已经改了，本次什么都不做
}
```

> 一句话记忆：**「查」和「改」必须发生在同一条 SQL 里，中间不能有任何缝隙。**

### 3.8 消息丢失的三层兜底

| 层级 | 手段 | 防的是什么 |
|---|---|---|
| **生产端** | 本地消息表 + 定时重发 + `syncSend` | 订单建了但消息没发出去 |
| **Broker** | `SYNC_FLUSH`（同步刷盘）+ `SYNC_MASTER`（主从同步复制） | broker 宕机丢消息 |
| **消费端** | 消费失败抛异常 → 重试 16 次 → 死信队列 + 告警 | 业务处理失败导致丢失 |
| **业务层（最终保险）** | **对账任务扫 `status=待支付 AND create_time < now-20min`** | **以上全部失效时的最后一道防线** |

```java
/**
 * 兜底对账：捞「创建超过 20 分钟仍是待支付」的订单。
 *
 * 为什么是 20 分钟而不是 15？
 *   1. 15 分钟是主链路的正常关单时间
 *   2. 留 5 分钟缓冲，避免对账任务和正常延迟消息抢同一批订单
 *   3. 也避开 broker 短暂堆积造成的正常延迟
 */
@Component
public class OrderCloseReconcileJob {

    private static final Logger log = LoggerFactory.getLogger(OrderCloseReconcileJob.class);

    private static final int  PAGE_SIZE = 500;
    /** 20 分钟 */
    private static final long RECONCILE_AFTER_MS = 20 * 60 * 1000L;

    @Resource private OrderMapper orderMapper;
    @Resource private OrderCloseService orderCloseService;
    @Resource private RedissonClient redisson;

    @Scheduled(cron = "0 */5 * * * ?")        // 每 5 分钟
    public void reconcile() {
        RLock lock = redisson.getLock("job:order-close-reconcile");

        // 多实例部署必须加锁，否则 N 个实例重复扫（虽然后续幂等，但浪费 DB）
        if (!lock.tryLock()) {
            return;
        }
        try {
            long lastId = 0L;
            long deadline = System.currentTimeMillis() - RECONCILE_AFTER_MS;

            while (true) {
                // 游标分页，避免 offset 深分页
                List<Long> ids = orderMapper.selectPendingPayBefore(
                        lastId, new Date(deadline), PAGE_SIZE);
                if (ids.isEmpty()) {
                    break;
                }

                for (Long id : ids) {
                    try {
                        orderCloseService.closeTimeoutOrder(String.valueOf(id));
                    } catch (Exception e) {
                        // 单条失败不影响整批
                        log.error("对账关单失败, orderId={}", id, e);
                    }
                }

                lastId = ids.get(ids.size() - 1);
                if (ids.size() < PAGE_SIZE) {
                    break;
                }
            }
        } finally {
            lock.unlock();
        }
    }
}
```

**对账任务的三个注意点**

1. **必须限流。** 它是「兜底」，不能变成「主力」。加令牌桶，或夜间低峰放大批量。
2. **必须分片。** 订单表分库分表后，按分片号并行跑，每个分片一把锁。
3. **必须监控「捞回量」。** 这个数应该≈0；一旦持续 > 0.1%，说明主链路有 bug（消息大面积丢失/消费失败），要立刻查。

### 3.9 并发安全：支付和关单的竞态

**场景**：T=15:00.000 延迟消息到达，T=15:00.001 用户点了支付。两条链路同时想改同一行。

**根本原因**：状态机只有一个 `PENDING_PAY` 入口，却有两个出口（`PAID` / `CLOSED`），且两个出口可能同时发生。

**解法：让数据库行锁做裁判，让条件更新做裁决。**

```
时刻   关单事务 (T1)                                   支付回调事务 (T2)
────────────────────────────────────────────────────────────────────────
t0     BEGIN
t1     UPDATE t_order SET status='CLOSED'
       WHERE id=1 AND status='PENDING_PAY'
       → 拿到 id=1 的行锁（X 锁）
t2                                                     BEGIN
t3                                                     UPDATE t_order SET status='PAID'
                                                       WHERE id=1 AND status='PENDING_PAY'
                                                       → 阻塞，等 T1 释放行锁
t4     COMMIT（释放行锁，status = CLOSED）
t5                                                     → 拿到锁，重新评估 WHERE
                                                       → status 已是 CLOSED ≠ PENDING_PAY
                                                       → affected = 0
t6                                                     COMMIT
                                                       → 支付服务判定「订单已关闭」
                                                       → 触发自动退款 + 通知用户
```

反过来（支付先赢）：

```
支付 UPDATE 成功 → status=PAID → 关单 UPDATE affected=0 → 直接 ACK 丢弃，不释放库存
```

**四个关键点**

1. **两个方向都必须带 `WHERE status='PENDING_PAY'`。**
   只有一边加，后执行的一方会无条件覆盖。

2. **不需要显式 `SELECT ... FOR UPDATE`。**
   MySQL 的 `UPDATE ... WHERE` 是**当前读**（读最新已提交版本），不走 MVCC 快照。在 RR 隔离级别下也不会读到旧状态。**单条条件 UPDATE 就够了。** 这一点很多人会答错，答对是加分项。

3. **`affected = 0` 必须被当作「正常分支」，不能当异常，更不能盲目重试。**
   支付侧看到 `affected = 0` 要：
   - 记录「支付成功但订单已关闭」
   - 调退款接口原路退回
   - 通知用户「订单已超时关闭，款项将在 1-3 个工作日退回」

4. **支付回调本身也必须幂等。**
   用支付流水号 `out_trade_no` 建唯一索引，防第三方重复回调。

**设计哲学一句话**：

> **谁先完成状态跃迁，谁就是事实；另一条路径必须能识别失败并走补偿。**
> 这叫「**宁可退款，不可丢单**」——退款是可逆操作，订单状态错乱是不可逆的。

**极端情况：支付成功但订单已关闭，能不能「救回来」？**

**不能。** `CLOSED` 是终态，硬改回 `PAID` 会让库存账、券账、财务报表全部错位。正确做法是把钱退回去，让用户重新下单（此时库存已回补，大概率还能买到）。

### 3.10 事务边界与最终一致

关单涉及 3 个不同数据源，必须拆成「**本地强一致 + 跨服务最终一致**」：

```
┌──────────────────────────────────────────────┐
│ 本地事务（订单库）                             │
│   1. UPDATE t_order status=CLOSED（CAS）      │
│   2. INSERT t_order_close_log（唯一索引）      │
│   3. INSERT outbox（库存释放待办）             │
└──────────────────────────────────────────────┘
                    ↓ 事务提交后异步
┌──────────────────────────────────────────────┐
│ 库存服务（幂等键 bizNo）                       │
│   DB:    available_stock += n                │
│   Redis: 回补到原分片                          │
│   成功 → 标记 outbox 完成；失败 → 定时重试     │
└──────────────────────────────────────────────┘
```

**为什么不用分布式事务（Seata / XA）？**

- XA 需要所有参与方支持两阶段提交，**锁要持有到全局提交**，性能损耗大。
- 库存、券服务未必支持 XA 协议。
- 关单这个业务**允许最终一致**：库存晚 1 秒回补，业务完全无感。

**用 outbox + 幂等 + 重试，比 XA 简单得多，也更快。**

**什么时候必须强一致？**

| 操作 | 一致性要求 | 原因 |
|---|---|---|
| **扣减**（下单预占库存） | 强一致 | 扣错了会**超卖** |
| **释放**（关单回补库存） | 最终一致 | 释放晚了只是**少卖一会儿** |

> **方向不同，一致性要求不同。** 这个判断是架构师的基本功：不要一上来就上分布式事务，也不要对扣减放松要求。

---

## 4. 高可用、监控与秒杀联动（15%）

### 4.1 消费者宕机与消息积压

#### 宕机：消息不丢

- RocketMQ 集群消费模式下，消费者组通过 **rebalance** 把宕机实例负责的队列分给存活实例。
- 消费进度（offset）存在 broker，新实例从上次位置继续。
- **前提：消费逻辑必须幂等**（3.7 已保证），因为 rebalance 瞬间可能有少量重复投递。

#### 积压：分层处理

| 阶段 | 手段 | 说明 |
|---|---|---|
| **预防** | **topic 队列数要足够** | 一个队列只能被一个消费者消费，**队列数 = 并行度上限**。建 topic 时给 16/32 个队列，别用默认 4 个。**这是最容易被忽略的坑：消费者加到 8 台，topic 只有 4 个队列，4 台在空转。** |
| 应急 | 扩容消费者实例 | 实例数 ≤ 队列数，否则多的实例闲着 |
| 提速 | 批量拉取 + 批量关单 | `pullBatchSize=32`，一次 `UPDATE ... WHERE id IN (...)` 处理 32 单，减少 DB 往返 |
| 提速 | 非核心动作异步化 | 短信/推送/日志拆到独立线程池或另一个 topic，主链路只做「改状态 + 放库存」 |
| 降级 | 积压超阈值时跳过通知 | 优先保证「关单 + 放库存」，通知延后补发 |
| 兜底 | 对账任务接管 | 积压再严重，20 分钟后对账也会把单关掉 |
| 死信 | 死信队列 + 告警 + 重放工具 | 重试 16 次仍失败的消息进 `%DLQ%group`，必须有人看 |

#### 消息过期（最隐蔽的故障）

RocketMQ 默认消息保留 72 小时，超时未消费会进死信。**必须有死信积压告警**，否则「消息悄悄过期」是最难发现、影响最大的故障。

### 4.2 与秒杀库存联动：释放的库存怎么回补 Redis

**前置背景**（秒杀库存设计）：库存被拆成 N 个分片放在 Redis，`stock:{skuId}:{shard}`，下单时用 Lua 原子扣减，异步落 DB。这样避免单 key 热点。

**关单回补的五个原则**

#### ① 回补到原分片，不要随便挑一个

下单时记录 `shard = hash(userId) % N`（或 `orderId % N`），回补时回同一片。

> 否则某个分片被扣光、另一个分片却堆着库存 → 用户看到「明明有库存却抢不到」。

#### ② 回补必须幂等

重复回补 = 超卖。用 Lua 把「检查 + 回补」做成原子：

```lua
-- KEYS[1] = stock:{skuId}:{shard}
-- KEYS[2] = stock:released:{orderId}      幂等标记
-- ARGV[1] = 回补数量
if redis.call('EXISTS', KEYS[2]) == 1 then
    return 0                                 -- 已回补过，直接返回
end
redis.call('SET', KEYS[2], '1', 'EX', 86400)
redis.call('INCRBY', KEYS[1], ARGV[1])
return 1
```

#### ③ Redis 只是缓存，DB 才是账本

更稳的做法：**不要直接 INCR Redis**，而是先写「库存回补流水」到 DB（`biz_no` 唯一索引），再由同步器把 DB 可用库存刷到 Redis。

```
关单
 → 写 stock_release_log(biz_no='CLOSE_'+orderId, sku, shard, qty)   [唯一索引]
 → DB: available_stock += qty
 → 发「库存变更」消息 → 库存同步器 → INCRBY Redis 分片
```

**好处**：Redis 挂了/数据丢了，可以随时从 DB 全量重建；Redis 与 DB 短暂不一致时，以 DB 为准。

#### ④ 注意活动状态

秒杀活动已结束就**不该**回补（否则活动结束后突然多出库存，被黄牛捡漏）。回补前判断 `activity.status == ONGOING`；已结束则只回补 DB 的逻辑库存，不刷新 Redis 可售库存。

#### ⑤ 注意「预占」与「实扣」的关系

秒杀下单是「预占」（Redis 扣、DB 不扣或少扣），支付成功才「实扣」。关单回补的是**预占量**。

所以要有一致性校验：

```
Redis 已扣总量  ==  DB 已售数量 + 未支付订单预占量
```

不平就告警。**这是库存对账，和订单关单是同一套思路：缓存在前，账本在后，定时校准。**

### 4.3 监控指标

| 指标 | 定义 | 告警阈值 | 说明 |
|---|---|---|---|
| **关单成功率** | 成功关单数 / 应关单数（15 分钟前创建的待支付订单数） | < 99.9% | 最核心的业务指标 |
| **延迟消息准时率** | 到期后 60 秒内被消费的比例 | < 99% | 反映 broker 健康度 |
| **消费延迟 P99** | `消费时间 - 期望到期时间` 的 P99 | > 60s | 比「准时率」更敏感 |
| **消息积压量** | `DiffTotal`（未消费消息数） | > 10 万，或 5 分钟持续增长 | 积压初期就要发现 |
| **死信队列数量** | `%DLQ%order-close-consumer-group` 消息数 | **> 0 立即告警** | 每条死信都是一个没关掉的订单 |
| **对账捞回量** | 兜底任务扫到并关掉的订单数 | > 日单量 0.1% | 应≈0，涨了就说明主链路坏了 |
| **关单耗时 P99** | 单笔关单事务耗时 | > 500ms | 慢 SQL 预警 |
| **支付-关单竞态率** | 关单时发现订单已支付的比例 | 突增 3 倍 | 说明延迟消息普遍偏晚 |
| **库存回补失败数** | Redis/DB 回补失败次数 | > 0 | 直接影响超卖 |
| **延迟消息发送失败率** | 生产端 `syncSend` 失败率 | > 0.01% | outbox 补偿量会激增 |
| **outbox 积压** | 状态为「待发送」的记录数 | > 1000 | 发送链路故障 |

**大盘设计建议**：按「订单创建时间的小时」做维度下钻，一眼看出「哪个时间段的订单没被正常关掉」。

---

## 5. 面试官可能的 5 个追问

### Q1：延迟消息不准时怎么办？

> **答**：不准时只会「晚关」，不会「错关」。因为消费端做了两道保险：**状态校验**（已支付就丢弃）+ **时间校验**（`create_time <= now - 15min` 才允许关，SQL 里也带了）。
> 晚关的代价是库存多占用一会儿，用「对账兜底 + 缩小延迟级别 + 消费时按剩余时长补发」来收敛。
> **核心原则是「宁可晚，不可早」**——早关是事故，晚关只是体验问题。

### Q2：订单量再翻 10 倍（日均千万）怎么办？

> **答**：瓶颈不在 MQ（RocketMQ 单集群百万 TPS 量级），在 **DB 的关单 UPDATE 和库存回补**。四个动作：
> ① **topic 按 orderId 取模分片**成多个 topic / 队列，并行消费（队列数必须提前建够）；
> ② 消费者水平扩容，消费逻辑改**批量关单**（32/64 条一次 UPDATE），减少 DB 往返；
> ③ 订单表**分库分表**（按 userId 或 createTime），对账任务按分片并行；
> ④ 库存回补**全异步化**（写流水 + 消息驱动），把同步调用从关单事务里摘出去。
> 另外，延迟消息建议用**独立 broker 集群**，避免延迟消息堆积影响正常业务消息。

### Q3：不用 MQ，只用 Redis 怎么设计？

> **答**：ZSet 延迟队列 + 三个补丁。
> ① **投递**：`ZADD delay:close {expireAtMs} {orderId}`；
> ② **取任务**：Lua 脚本原子地 `ZRANGEBYSCORE ... LIMIT 0 32` + `ZREM`，避免多消费者重复取；
> ③ **防丢**：取出后先写 `delay:processing`（score = 处理超时时间），业务成功再删；定时任务扫 `processing` 中超时的，`ZADD` 回主队列（**Redis 版 ACK + 可见性超时**）；
> ④ **防丢（最终）**：DB 对账任务兜底扫「创建超 20 分钟仍待支付」的订单；
> ⑤ **分片**：按 `orderId % N` 拆成 N 个 ZSet，避免单 key 热点。
> 要接受一个事实：**Redis 主从异步复制，主挂了可能丢最近 1 秒数据**，所以必须有 DB 兜底。这套方案适合不想引入 MQ 的中小团队，日百万完全够用。

### Q4：用户正在支付，同时关单任务到了，钱扣了单关了怎么办？

> **答**：数据库行锁 + 条件更新保证**只有一个赢家**，不会出现「两个都成功」。
> 关单先赢 → 状态变 `CLOSED` → 支付回调的 `UPDATE ... WHERE status='PENDING_PAY'` 返回 `affected=0` → 支付服务识别「订单已关闭」→ **触发自动退款**并通知用户。
> 支付先赢 → 状态变 `PAID` → 关单 `affected=0` → 直接 ACK 丢弃消息，不释放库存。
> 设计哲学是「**宁可退款，不可丢单**」：退款可逆，订单状态错乱不可逆。同时支付回调本身要幂等（支付流水号唯一索引），防第三方重复通知。

### Q5：消息重复消费、重试 16 次还是失败怎么办？

> **答**：重复消费**无副作用**，因为幂等靠「状态机条件更新 + 唯一索引 + 下游 bizNo」三重保证，第二次执行 `affected=0` 直接返回。
> 重试耗尽进死信队列 `%DLQ%order-close-consumer-group`，做三件事：
> ① **立即告警**（每条死信都是一个没关掉的订单）；
> ② **死信重放工具**（按 orderId 批量重新投递）；
> ③ **等对账兜底**——20 分钟后对账任务一定会把这批单关掉。
> 所以「**最终一定关**」，死信只影响时效，不影响正确性。

---

## 6. 补充：几个容易被追问的细节

**Q：为什么不用 MySQL 的 `event_scheduler`（定时事件）？**

> 单点、无高可用、执行失败无重试、SQL 里写业务逻辑难维护难测试。它适合「清理临时表」这类运维任务，不适合业务状态流转。

**Q：延迟消息堆积在 broker 里，会不会影响正常业务消息？**

> 4.x 的延迟消息存在内部 topic `SCHEDULE_TOPIC_XXXX`，与业务 topic 物理隔离；但**定时扫描线程是 broker 共享的**，大量到期消息会占用扫描线程和重新投递的 IO。
> 所以：① 延迟消息单独建 topic；② 大促时考虑独立 broker 集群；③ 监控 `SCHEDULE_TOPIC` 的堆积量。

**Q：为什么不用 `SELECT ... FOR UPDATE`？**

> 单条 `UPDATE ... WHERE status=?` 本身就是原子的当前读 + 行锁，已经完成了「读-判-写」，比 `SELECT FOR UPDATE` + `UPDATE` 少一次往返、少一半持锁时间。
> `FOR UPDATE` 只在你需要「先读出来做复杂业务判断、再写」时才需要。

**Q：订单表数据量大了，`UPDATE ... WHERE id=?` 会不会慢？**

> 不会，主键更新 `O(log n)`，只锁一行。真正的风险在**对账任务的范围扫描**（`WHERE status=? AND create_time<?`），所以必须游标分页 + 强制走索引 + 限流。

**Q：如果 Redis 库存回补失败了呢？**

> DB 是账本，Redis 是缓存。回补失败就重试（outbox 保证至少一次），重试仍失败则告警 + 等「库存校准任务」从 DB 全量重建 Redis。
> **永远不要让 Redis 成为唯一真相。**

**Q：能不能就用「订单表加字段 + 定时扫」代替 MQ？**

> 能，而且在小量级这是**更简单**的选择（少一个中间件）。但它把「精度」和「DB 压力」绑死了，秒杀峰值时会有明显的关单延迟尖峰。
> **我的建议是：主链路 MQ + 兜底扫表。如果团队没有 MQ 运维能力，纯扫表在日百万量级就是正确解——不要为了架构漂亮而过度设计。**

**Q：为什么不直接用「本地延迟队列 + 分布式锁」让一台机器处理？**

> 单点。这台机器挂了全部停止；就算加主备，切换期间的订单也漏。而且锁本身有 TTL、有续期问题，可靠性并不比 MQ 高，复杂度却更高。

---

## 7. 一页纸速记

```
【选型】
  RocketMQ 延迟消息（主）+ 定时对账（兜底）+ 状态机条件更新（正确性）

【三个角色】
  MQ        = 闹钟，负责「准时提醒」   （可能不准 / 可能重复 / 可能不响）
  订单表    = 真相，负责「裁决赢家」   （条件更新 + 行锁，绝不撒谎）
  对账任务  = 保险，负责「永不遗漏」   （20 分钟兜底，最终一定关）

【四道幂等防线】
  1. 状态机条件更新：UPDATE ... WHERE status='PENDING_PAY'   ← 最强，必选
  2. 唯一索引：      t_order_close_log(order_id)
  3. 下游 bizNo：    库存/券服务按 bizNo 去重
  4. 分布式锁：      只是优化，绝不能靠它做幂等

【并发竞态】
  两个 UPDATE 抢同一行 → InnoDB 行锁排队 → 只有一个 affected=1
  输的一方必须补偿：关单输了 → 丢弃消息；支付输了 → 自动退款

【精度兜底】
  消费时校验 now - createTime >= 15min（SQL 里也带）
  → 保证「绝不早关」，允许「稍晚关」

【监控四件套】
  关单成功率 / 延迟准时率 / 积压量 / 死信数
  外加：对账捞回量（应≈0，涨了就说明主链路坏了）

【一句话总结】
  用 MQ 拿弹性，用状态机拿正确性，用对账拿确定性。
```

---

### 附：本文涉及的技术栈

| 组件 | 版本 / 说明 |
|---|---|
| Spring Boot | 3.x |
| RocketMQ | 4.9（延迟级别）/ 5.x（任意延迟） |
| MyBatis-Plus | 3.5+ |
| MySQL | 8.0（`NOW(3)` 毫秒精度） |
| Redisson | 分布式锁 |
| Redis | 6.x+（Lua 原子脚本） |

> 示例代码省略了参数校验、日志脱敏、异常码、监控埋点等工程细节，重点在**方案取舍**与**关键逻辑**。真实项目中请补充：统一异常处理、TraceId 透传、幂等键的统一生成规则、以及死信重放的后台工具。
