---
title: 秒杀系统设计：从 100 万请求到 1 万次写库
date: 2026-10-20
type: note
category: Java八股文 / 后端场景题
tags: Java八股文, 后端场景题
summary: 从流量漏斗、Redis Lua 原子扣减、MQ 异步下单到库存对账，梳理秒杀系统的完整设计与高频追问。
---

先说结论，整道题其实只在解决两件事：把 99% 的请求挡在数据库之外，保证 1 万件库存不被扣成 10001。其余所有设计——CDN、限流、Lua、MQ、对账——都是这两件事的展开。

## 第一部分：问题分析

### 1.1 两个硬目标

**目标一：绝不超卖，允许少卖。**

这句话看着像废话，但它是整个系统的“兜底方向”。少卖是少赚一笔钱，超卖是发不出货、赔付、差评、平台处罚——两者不是一个量级。所以后面每一个“拿不准”的异常分支，我都让它倒向少卖。

**目标二：数据库不被打垮。**

10 万 QPS 直接打 MySQL，结果不是“慢”，是连接池耗尽 → Tomcat 线程全部卡住 → 整个应用不可用。注意这个故障会外溢：秒杀往往和主站共用数据库，秒杀打挂了 DB，主站下单也会挂。所以 DB 必须是最后一道、也是被保护得最好的一道。

### 1.2 秒杀与普通下单的本质区别

大部分人答这题会背“高并发、读多写少”，但真正的区别在下面四点：

**流量形态是“脉冲”而不是“平稳”。** 100 万请求 ÷ 10 秒 ≈ 10 万 QPS，题目给的数字是自洽的：不是 100 万人同一毫秒按按钮，而是 10 万 QPS 持续 10 秒左右。

**读写比极端到 100:1。** 100 万人来“读”（查库存、看活动），只有 1 万人能“写”成功。这正是可以缓存的根本原因——读的部分几乎全部可以在 Redis 和 CDN 解决掉。

**库存是一行全局共享数据。** 普通商品的库存分散在上万个 SKU 上，天然没有热点；秒杀的 1 万件库存在 MySQL 里是同一行，在 Redis 里是同一个 Key。所有并发最终都收敛到一个点上，这是“热点”问题的来源。

**用户预期不同，这是最反直觉的一点。** 普通下单，系统目标是“让每个请求都成功”；秒杀的目标是“尽快、便宜地拒绝掉 99% 的请求”。所以秒杀系统的核心指标不是成功率，而是拒绝的成本——一次拒绝应该只消耗几微秒的 CPU 和一次内存读，而不是一次数据库往返。

### 1.3 核心问题清单

- **瞬时高并发：**10 万 QPS 在几秒内打到同一批接口，平时这套系统可能只有几百 QPS。
- **超卖：**两个请求同时读到库存 1，各自扣一次，就卖出了 2 件。
- **热点 Key：**1 万件库存是同一个 Redis Key，所有请求都打在这一个分片的一个核上。
- **黄牛刷单：**脚本可以每秒发几千次请求，真人抢不过机器。
- **服务雪崩：**下游一个环节变慢，上游线程全部卡住等待，最终整条链路一起挂。

这五个问题分别对应后面的五部分解法，可以当作阅读地图。

## 第二部分：整体架构

### 2.1 分层架构

秒杀系统分层架构：

```text
客户端 H5/App → CDN 静态资源 → 网关 Nginx+Sentinel → 秒杀服务 无状态集群
                                                    ↓ Lua 原子扣减
                                        Redis 库存/幂等/令牌
                                                    ↓ 抢中后发消息
                                                   MQ → 订单服务 → MySQL 最终账本
                                        异常路径：回补库存
```

两个设计要点：

- 秒杀服务必须无状态，才能水平扩展到几十台。所有状态（库存、购买记录、令牌）都在 Redis 里。
- 订单服务独立部署、独立线程池。秒杀流量再大，也不能把主站下单的线程池占满——这是“故障隔离”，也叫舱壁模式。

### 2.2 流量漏斗

流量漏斗：100 万请求怎么变成 1 万次写库。

| 层级 | 这一层做了什么 | 剩余请求 |
| --- | --- | --- |
| 用户点击 | 100 万人同时点，10 万 QPS 持续约 10 秒 | 1,000,000 |
| 前端 + CDN | 静态页走 CDN、按钮置灰、答题验证码 | 600,000 |
| 网关 | IP/账号限频、登录态、一次性令牌 | 200,000 |
| 秒杀服务 | 活动状态校验、库存预检、幂等 | 100,000 |
| Redis Lua | 原子扣减，只有 1 万件库存 | 10,000 |
| MQ | 削峰缓冲，把脉冲拉平 | 10,000 |
| MySQL | 1 万次 INSERT + 1 万次 UPDATE | 10,000 |

这个漏斗的思想比数字更重要：每一层的目的不是“提高性能”，而是“让请求变少”。性能优化是线性的（快 2 倍就是 2 倍），流量削减是指数的（每层砍一半，5 层就剩 1/32）。秒杀系统里，减少请求永远比加速请求更有效。

最后落在 DB 上的是 1 万次写，而且被 MQ 拉平到 2～3 千 TPS——MySQL 完全扛得住。

### 2.3 每一层的具体措施

**前端层**

- **页面静态化 + CDN：**商品详情、活动页提前生成纯 HTML 推到 CDN，Nginx 直接返回，一个字节都不进 Java。100 万人的“看页面”请求在这里就没了。
- **按钮置灰 + 本地倒计时：**用服务器时间校准后的本地倒计时，未到点按钮 disabled，用户点不出去。点击后立刻置灰，防止手抖连点。
- **秒杀地址动态化：**接口不是固定的 POST /seckill/1001，而是 /seckill/{path}，path 在活动开始后才下发给合法用户，服务端校验 path 是否属于这个用户。黄牛提前写死的脚本直接 404。
- **答题 / 验证码：**两个作用，一是挡机器，二是把瞬时并发摊平到几秒钟——用户答题的 3 秒，就是流量削峰的 3 秒。

**网关层**

- **Nginx 限流：**limit_req_zone 按 IP 做漏桶限流，limit_conn 限制单 IP 连接数。注意秒杀场景要设在“按用户”维度，不能只按 IP（一个公司出口 IP 可能是几十万用户）。
- **Sentinel 热点参数限流：**对 activityId 这种热点参数做 QPS 控制，超过直接快速失败。
- **登录态前置校验：**JWT/token 在网关解析，非法请求不进业务层。
- **一次性风控令牌：**前端先调 /seckill/token 拿一个绑定 userId + activityId + 时间窗口 的 token（存 Redis，5 分钟过期，用后即删）。没有 token 的请求在网关就被拒——这是防脚本的关键一道。

**服务层**

- **活动状态校验：**活动配置（开始时间、结束时间、状态）放本地缓存（Caffeine），每 5 秒刷新一次，绝不每次查 DB。
- **接口幂等：**userId + activityId 维度去重，重复请求直接返回上次结果。
- **库存预检：**GET 一次库存，为 0 直接返回“售罄”，不进入 Lua 脚本。这一步能挡掉售罄后 90% 的无效请求，成本只是一次内存读。

### 2.4 为什么库存要预热到 Redis，MySQL 只做账本

四个原因：

**能力差距是数量级的。** MySQL 对同一行的并发 UPDATE 会加行锁，实际吞吐也就是几百到一两千 TPS；Redis 单节点 10 万级 QPS。差 100 倍。

**MySQL 的失败模式是“排队”，而排队会引发雪崩。** 行锁一排队，连接池很快被占满，后续请求连不上 DB，线程堆积，整个应用假死。Redis 的失败模式是“变慢”，不会引发级联。

**扣减本质是“内存里的一个计数器”，不需要事务。** 库存的权威判断只需要“原子地减一”，这是 Redis 最擅长的事。

**MySQL 作为账本，职责更清晰。** Redis 里的库存是“准入凭证”，是可以重建的缓存；MySQL 里的库存是“法律事实”。Redis 挂了，用 初始库存 - 有效订单数 就能重建。

预热流程：活动开始前 10 分钟，定时任务把 seckill:stock:{activityId} 写入 DB 当前库存，并校验写入成功。预热失败则活动不开启（fail-fast）——宁可不开，不能带着空缓存开门。

## 第三部分：防超卖核心方案

### 3.1 三个被否决的方案

**方案一：synchronized / ReentrantLock（JVM 锁）**

JVM 锁只能锁住同一个进程内的线程。秒杀服务是 10 台机器，每台各锁各的，等于没锁。即使是单机，锁内还要做 DB 操作，吞吐量 ≈ 1 / DB耗时，几百 TPS。

大白话：这是“自家门锁”，管不了邻居家。

**方案二：数据库悲观锁 SELECT ... FOR UPDATE**

加行锁后，1 万次扣减变成 1 万次串行执行，每次 5～10ms，最多 100～200 TPS。10 万 QPS 打进来，连接池瞬间打满，请求排队超时，Tomcat 线程耗尽——秒杀没挂，整个应用先挂了。

大白话：悲观锁是“我先占住这行，别人排队等”，在秒杀这种流量下，队伍会排到系统外面去。

**方案三：数据库乐观锁 UPDATE stock = stock - 1 WHERE id = ? AND stock > 0**

这条 SQL 本身是原子的（InnoDB 行锁保证），不会超卖，正确性没问题。问题在流量：10 万 QPS 全部落到 DB，行锁排队 + 大量失败请求也来打一次。它把 DB 当成了第一道防线，而 DB 恰恰是最脆弱的一环。

三者的对比：

| 方案 | 原子性 | 吞吐量级 | 致命问题 | 结论 |
| --- | --- | --- | --- | --- |
| JVM synchronized | 单机内原子 | 低 | 多实例部署直接失效 | 否决 |
| DB 悲观锁 FOR UPDATE | 原子 | 百级 TPS | 行锁串行，连接池被打爆 | 否决 |
| DB 乐观锁 stock>0 | 原子 | 千级 TPS | 正确但流量直击 DB | 否决 |
| Redis Lua 扣减 | 原子 | 十万级 QPS | 要额外处理 Redis/DB 一致性 | 采用 |
| Redisson 分布式锁 | 原子 | 万级 QPS | 3 次 RTT，锁把并发变串行 | 不用于库存 |

关键洞察：三个被否决的方案，差别不在于“锁不锁”，而在于**“原子性落在哪一层”**。JVM 层的原子性跨不了机器；DB 层的原子性正确但太贵。我们要的是“把原子性放到一个又快又跨机器的地方”——那就是 Redis。

### 3.2 主流方案：Redis 单线程 + Lua 脚本原子扣减

#### 3.2.1 为什么 GET + DECR 两条命令会超卖

假设库存为 1，两个请求 A、B 同时到达：

```text
时间   A                          B                      Redis 库存
 t1    GET stock → 1                                          1
 t2                               GET stock → 1               1
 t3    if 1 > 0 → 通过                                       1
 t4                               if 1 > 0 → 通过             1
 t5    DECR stock → 0                                         0
 t6                               DECR stock → -1            -1   ← 超卖
```

问题出在 “判断”和“扣减”是两个独立步骤，中间的时间窗里，另一个请求也读到了同一个旧值。这叫竞态条件（race condition）：程序的正确性依赖于两个操作的执行顺序，而顺序是不确定的。

大白话：两个人同时看到货架上还剩 1 件，都伸手去拿，结果各拿了一件——因为“看到”和“拿走”之间隔了一小会儿。

#### 3.2.2 Lua 脚本为什么是原子的

Redis 处理命令是单线程的：所有客户端连接的命令排成一队，一个一个执行，任何时刻只有一个命令在跑（Redis 6.0 之后网络读写用了多线程，但命令执行仍然是单线程）。

EVAL 执行一个 Lua 脚本时，整个脚本作为一个整体执行，中间不会插入其他客户端的命令。所以脚本里的“读库存 → 判断 → 扣减 → 记录用户”是一个不可分割的单元，别的请求要么看到执行前，要么看到执行后，不存在看到中间的。

大白话：Redis 是个只有一只手的分拣员，Lua 脚本是“把四件事写在一张单子上”，他必须一口气做完这张单子，才去接下一单。

使用前提（面试常考）：

- 脚本必须短。Redis 执行 Lua 时是阻塞的，脚本里不能有 KEYS *、大循环、复杂计算，否则整个 Redis 卡住。
- Redis Cluster 下，脚本涉及的所有 Key 必须在同一个 slot，所以 Key 要用 hash tag：seckill:stock:{1001} 和 seckill:buyers:{1001}，大括号里的内容相同，就会分到同一个 slot。
- 用 EVALSHA + 脚本缓存，避免每次传输脚本体（Spring 的 DefaultRedisScript 已经帮你做了）。

#### 3.2.3 完整 Lua 脚本

```lua
-- seckill.lua
-- KEYS[1] 库存 key        seckill:stock:{1001}
-- KEYS[2] 购买记录 key     seckill:buyers:{1001}   (Hash: userId -> 数量)
-- ARGV[1] userId
-- ARGV[2] 每人限购数量
-- 返回： 1 = 抢到   0 = 售罄   -1 = 重复购买

local stockKey = KEYS[1]
local buyerKey = KEYS[2]
local userId   = ARGV[1]
local limit    = tonumber(ARGV[2])

-- 1. 一人一单校验
if redis.call('HEXISTS', buyerKey, userId) == 1 then
    return -1
end

-- 2. 库存校验（key 不存在时 GET 返回 false，必须兜底成 0）
local stock = tonumber(redis.call('GET', stockKey) or '0')
if stock < limit then
    return 0
end

-- 3. 原子扣减 + 登记用户（两件事在同一脚本里，不存在中间态）
redis.call('DECRBY', stockKey, limit)
redis.call('HSET', buyerKey, userId, limit)
return 1
```

注意第 3 步为什么把“登记用户”也放进脚本：如果扣库存和记用户分成两步，就会出现“库存扣了但用户没记上”的中间态——用户能再抢一次，直接超卖。放进同一个脚本，两件事要么都成，要么都不成。

#### 3.2.4 Spring Boot 调用代码

```java
@Configuration
public class SeckillRedisConfig {

    @Bean
    public DefaultRedisScript<Long> seckillScript() {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setLocation(new ClassPathResource("lua/seckill.lua"));
        script.setResultType(Long.class);
        return script;
    }
}
```

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class SeckillService {

    private final StringRedisTemplate redis;
    private final DefaultRedisScript<Long> seckillScript;
    private final RocketMQTemplate rocketMQ;
    private final SeckillActivityCache activityCache;   // Caffeine 本地缓存

    private static final int LIMIT_PER_USER = 1;

    public SeckillResult seckill(long activityId, long userId) {
        // 1. 活动状态：读本地缓存，不查 DB
        SeckillActivity act = activityCache.get(activityId);
        if (act == null || !act.isOpen()) {
            return SeckillResult.fail("活动未开始或已结束");
        }

        // hash tag 保证两个 key 在同一个 slot（Redis Cluster 下必需）
        String stockKey = "seckill:stock:{" + activityId + "}";
        String buyerKey = "seckill:buyers:{" + activityId + "}";

        // 2. 库存预检：售罄后的无效请求不进入 Lua，保护 Redis
        String left = redis.opsForValue().get(stockKey);
        if (left == null || Long.parseLong(left) <= 0) {
            return SeckillResult.fail("已售罄");
        }

        // 3. Lua 原子扣减
        Long r = redis.execute(seckillScript,
                List.of(stockKey, buyerKey),
                String.valueOf(userId), String.valueOf(LIMIT_PER_USER));

        if (r == null) return SeckillResult.fail("系统繁忙，请重试");
        if (r == -1L)  return SeckillResult.fail("每人限购 " + LIMIT_PER_USER + " 件");
        if (r == 0L)   return SeckillResult.fail("已售罄");

        // 4. 走到这里说明已在 Redis 占住库存，发 MQ 异步下单
        String orderNo = IdGen.next();
        SeckillMessage msg = new SeckillMessage(activityId, userId, orderNo,
                LIMIT_PER_USER, System.currentTimeMillis());
        try {
            SendResult sr = rocketMQ.syncSend("seckill-order", msg, 3000);
            if (sr.getSendStatus() != SendStatus.SEND_OK) {
                throw new IllegalStateException("send status not ok");
            }
        } catch (Exception e) {
            // 发不出去 => 这次不算抢中，必须把 Redis 的占用还回去
            log.error("mq send failed, rollback redis. activity={}, user={}", activityId, userId, e);
            rollbackRedis(stockKey, buyerKey, userId, LIMIT_PER_USER);
            return SeckillResult.fail("系统繁忙，请重试");
        }
        return SeckillResult.ok("抢购成功，正在生成订单");
    }

    /** 回补也必须是原子的 */
    private void rollbackRedis(String stockKey, String buyerKey, long userId, int n) {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>(
                "redis.call('INCRBY', KEYS[1], ARGV[2]); " +
                "redis.call('HDEL', KEYS[2], ARGV[1]); return 1",
                Long.class);
        redis.execute(script, List.of(stockKey, buyerKey),
                String.valueOf(userId), String.valueOf(n));
    }
}
```

为什么这里用 syncSend 而不是异步发送？ 因为只有抢中的 1 万次才发消息，量很小；同步发送能拿到 SEND_OK 才敢对用户说“抢中”，语义清晰。代价是 RT 多 2～5ms，可以接受。如果追求极致吞吐，可以改成异步 + 本地消息表兜底。

### 3.3 热点 Key 优化：库存分片

问题：1 万件库存在一个 Key 上，10 万 QPS 全打到这一个分片。Redis 单节点处理这种多命令 Lua 脚本大约 5～8 万 QPS，单核 CPU 会打满，而且网络带宽也会成为瓶颈。

方案：拆成 10 个 Key，每个 1000 件。

```text
seckill:stock:{1001:0}  →  1000
seckill:stock:{1001:1}  →  1000
...
seckill:stock:{1001:9}  →  1000
```

请求按 userId % 10 或随机选一个分片去扣。

代价（面试必须主动说，否则显得没实践过）：

- **库存在分片间不均衡。**用户 hash 不均匀，可能出现 3 个分片卖光、另外 7 个还剩 2000 件的情况，用户却收到“售罄”。这叫少卖，需要额外的“跨分片借库存”逻辑，或者活动结束后人工回补。
- **原子性范围缩小了。**“扣库存”和“记用户”现在在不同分片上，不能再放进同一个 Lua 脚本（Cluster 下跨 slot 会报错）。折中做法是：先用 SET buyer:{userId} 1 NX EX 3600 占位，再扣分片库存，扣失败则删除占位。两步不原子，但方向仍然是“宁可少卖”。
- **对账变复杂。**要汇总 10 个分片的剩余量，再和 DB 比对。
- **分片数不能太多。**10～20 个足够，分片太多管理成本和对账成本都会上升。

一个容易忽略的细节：seckill:stock:{1001:0} 这种写法，hash tag 是 1001:0，10 个分片会落到 10 个不同的 slot——这才叫真分片。如果写成 seckill:stock:{1001}:0，hash tag 是 1001，10 个分片全在同一个 slot，分片就白做了。

### 3.4 Lua 原子扣减 vs Redisson 分布式锁

Redisson 锁的原理（一句话版）：加锁 = SET key value NX PX 30000（一条命令同时完成“不存在才设置”和“设置过期时间”，原子）；加锁成功后台启动 Watchdog 看门狗，每 10 秒把过期时间续到 30 秒（防止业务没执行完锁就过期）；解锁时用 Lua 校验 value 是不是自己的线程标识，是才 DEL（防止误删别人的锁）；可重入用 Hash 结构记录重入次数。

对比：

| 维度 | Redis Lua 原子扣减 | Redisson 分布式锁 |
| --- | --- | --- |
| 一次业务的操作次数 | 1 次（一个 EVAL） | 3 次（加锁、业务、解锁） |
| 吞吐量 | 十万级 QPS | 万级 QPS（锁串行化） |
| 是否阻塞 | 不阻塞，立即返回结果 | 阻塞排队，可能等锁超时 |
| 实现复杂度 | 低（一个脚本） | 中（看门狗、续期、可重入） |
| 适用场景 | 单个资源的原子 CAS（扣库存、抢红包） | 需要互斥执行一段跨越多个资源的业务逻辑 |

结论：秒杀的库存扣减本质是“单个 Key 的原子 CAS”（compare-and-set，比较并设置），Lua 一次往返就能搞定。用分布式锁相当于把 10 万并发串行化成 1 万，白白浪费了 Redis 单线程的执行能力，还多两次网络往返。锁不是万能的，能用原子操作解决的，不要用锁。

## 第四部分：异步下单与数据一致性

### 4.1 为什么扣完不直接写库

Redis 扣减成功后，如果同步写 MySQL 再返回，会带来三个问题：

- **RT 变长：**一次 DB 写入 5～20ms，用户等待感明显，而且 DB 抖动会直接传导到用户。
- **DB 被打回原形：**10 万 QPS 里的 1 万次成功请求全部同步打 DB，虽然比 10 万好，但仍然是尖峰。
- **失败处理复杂：**DB 写失败要回补 Redis，同步链路里做补偿很容易出错。

改成“发 MQ 后立即返回”，Redis 的一次扣减就是一次内存操作，RT 可以控制在 50ms 以内。

### 4.2 完整链路

扣减成功后的异步下单链路：

1. **Redis 占位：**Lua 原子扣减库存并登记 userId，先占住 1 件。
2. **发 MQ：**同步发送，SEND_OK 才返回“抢中”；发送失败立刻回补 Redis。
3. **立即响应：**不落库，RT 控制在 50ms 内，前端提示“正在生成订单”。
4. **消费落库：**幂等校验 → 扣 DB 库存 → 插订单 → 发 30 分钟延迟消息。
5. **支付或回补：**支付成功改状态；超时未支付则取消订单并回补 Redis 与 DB。

### 4.3 消息可靠性三件套

**① 生产者确认**

syncSend 返回 SEND_OK 才算发送成功；失败则回补 Redis 并告知用户“重试”。这样保证：没有进 MQ 的，就不算抢中。

如果对一致性要求更高，用本地消息表（outbox）：把消息和业务在同一个 DB 事务里写入 mq_outbox 表，再由定时任务扫描发送。好处是“业务成功 = 消息一定最终会发出”；代价是多一次 DB 写。

**② 消费者手动 ACK**

```java
@Component
@RocketMQMessageListener(topic = "seckill-order", consumerGroup = "seckill-order-consumer")
@RequiredArgsConstructor
@Slf4j
public class SeckillOrderConsumer implements RocketMQListener<SeckillMessage> {

    private final SeckillOrderService orderService;

    @Override
    public void onMessage(SeckillMessage msg) {
        try {
            orderService.createOrder(msg);
            // 正常返回 = 消费成功 = ACK
        } catch (DuplicateKeyException e) {
            // 重复消息：订单已存在，视为成功，直接 ACK
            log.info("duplicate message ignored. orderNo={}", msg.getOrderNo());
        } catch (Exception e) {
            // 抛出异常 = 消费失败 = 稍后重投
            log.error("consume failed, will retry. orderNo={}", msg.getOrderNo(), e);
            throw new RuntimeException(e);
        }
    }
}
```

RocketMQ 默认重试 16 次，仍然失败进死信队列（DLQ，Dead Letter Queue，专门存放“怎么都消费不了”的消息），由人工或补偿任务处理。

**③ 消费端幂等**

幂等：同一个请求执行一次和执行一百次，结果一样。

- **DB 唯一索引兜底：**订单表加 uk_activity_user (activity_id, user_id)，重复插入抛 DuplicateKeyException，捕获后直接 ACK。这是最可靠的一层，因为 Redis 可能丢数据，DB 的唯一约束不会。
- **Redis SETNX 前置：**SET order:idem:{orderNo} 1 NX EX 86400，抢不到说明处理过了。这一层是为了减少无效的 DB 写，不是最终保证。

两层的关系：Redis 是“快速过滤”，DB 唯一索引是“最终真相”。不要只用 Redis。

### 4.4 一人一单的幂等设计

三层防线，成本从低到高：

- **网关限频：**同 userId 每 2 秒最多 1 次请求。挡掉 95% 的连点脚本。
- **Lua 内 HSET 原子登记：**和扣库存同一个脚本，天然原子。挡掉剩下的重复请求。
- **DB 唯一索引：**uk_activity_user (activity_id, user_id)。最后兜底，包括“Redis 数据被清空后重建”这种极端情况。

为什么不能只靠前端置灰？因为前端可以被绕过（直接调接口）。为什么不能只靠 DB 唯一索引？因为那时候请求已经打到 DB 了，失去了保护 DB 的意义。

### 4.5 超时未支付的库存回补

两种情况：

**① 延迟消息（主路径）**

订单创建后，发一条 30 分钟延迟消息：

```java
rocketMQ.syncSendDelayTimeMills("order-delay-check", msg, 30 * 60 * 1000L);
```

到期后检查订单状态，仍为“未支付”则取消订单并回补库存。

**② 定时任务（兜底路径）**

每 5 分钟扫一次：

```sql
SELECT id FROM seckill_order
WHERE status = 'UNPAID' AND create_time < NOW() - INTERVAL 30 MINUTE
LIMIT 500;
```

延迟消息可能丢、可能消费失败，定时任务是“无论如何都会执行”的那条路。

回补必须幂等：

```sql
UPDATE seckill_order
SET status = 'CANCELED'
WHERE id = ? AND status = 'UNPAID';
```

只有影响行数 = 1，才去 INCRBY Redis 库存和 UPDATE DB 库存。否则延迟消息和定时任务同时触发，会回补两次，变成超卖。

### 4.6 Redis 与 MySQL 的最终一致性

最终一致性：不要求任何时刻两边都相等，只要求“经过一段时间后”自动收敛到一致。

正常链路：Redis 扣减成功 → MQ → DB 扣减成功。

异常分支和处理：

| 异常 | 表现 | 处理 |
| --- | --- | --- |
| MQ 发送失败 | Redis 扣了，没人消费 | 同步 catch 里回补 Redis |
| 消费失败重试 | DB 还没扣 | MQ 自动重投，最终成功或进死信 |
| DB 库存不足 | 说明 Redis 被多扣了 | 告警 + 人工介入（理论上不该发生，因为 DB 有 stock >= 1 兜底） |
| Redis 数据丢失 | Redis 库存偏高 | 对账任务用 DB 重建 |

对账任务（每 5 分钟）：

```text
Redis 侧：剩余库存 + 已成功订单数  ==  初始库存  ?
DB  侧：剩余库存 + 有效订单数      ==  初始库存  ?
Redis 侧 == DB 侧 ?
```

不一致就告警；如果是 Redis 少了（比如进程重启丢数据），以 DB 为准重建 Redis：

```text
Redis 库存 = DB 库存
```

为什么以 DB 为准？ 因为 DB 是唯一有事务和持久化保证的地方，Redis 本质上是个缓存。

### 4.7 设计哲学：允许少卖，不允许超卖

这是整道题的“价值观”，也是面试官最想听到的一句话。

把系统里的所有不确定性列出来，逐个决定倒向哪边：

- Redis 扣了，MQ 没发出去 → 少卖（回补，用户重试）。
- Redis 扣了，消费一直失败进死信 → 少卖（对账发现，人工处理）。
- DB 扣减时库存不足 → 不可能超卖（WHERE stock >= 1 兜底）。
- 定时任务和延迟消息重复触发 → 靠状态机幂等，避免多回补（多回补也是超卖）。

核心是顺序：必须“先扣 Redis（准入）→ 再落 DB（记账）”，且 DB 层再加一道 WHERE stock >= 1。这样即使 Redis 完全算错，DB 也不会超卖；而 Redis 算少了，最多是少卖。

反过来，如果先落 DB 再扣 Redis，或者只信 Redis 不信 DB，一旦 Redis 出问题就是超卖——这是不可接受的。

## 第五部分：高可用与兜底

### 5.1 Redis 宕机的降级预案

**第一层：集群自动故障转移。** Redis Sentinel / Cluster 在主节点挂掉后 10～30 秒内完成切换。

**第二层：熔断降级——宁可暂停，也不放流量打 DB。**

这是最关键的决策。Redis 不可用时，绝不能把请求透传到 MySQL：

- 10 万 QPS 打 MySQL，秒杀挂了，主站也挂了；
- 局部故障变成全局故障，这是架构上最不能接受的失败模式。

正确做法：网关/服务层检测到 Redis 超时率超过阈值 → Sentinel 熔断 → 直接返回“活动太火爆，请稍后再试”，活动暂停。

**第三层：恢复。** Redis 恢复后，用 DB 重建库存：

```text
Redis 库存 = DB 库存（DB 库存本身已经是扣减后的值）
```

重建完成、校验通过后，再放开流量。

面试加分点：可以提一句“本地库存分片”的极端方案——每台机器预分配一部分库存到 JVM 内存，Redis 挂了也能卖。但一致性极难保证，一般不推荐，除非是“少卖无所谓、必须能卖”的场景。

### 5.2 MQ 积压的监控与扩容

- **监控：**消费 lag（堆积量）、消费 TPS、消费耗时 P99。
- **扩容：**增加消费者实例或消费线程数。注意 RocketMQ 的队列数 / Kafka 的分区数是消费并行度的上限，扩消费者之前要先扩队列。
- **降级：**积压严重时，消费端只做“创建订单”这个最小动作，把发短信、加积分、写日志等非核心逻辑异步化或直接丢弃。
- **限流：**生产端按 MQ 的容量做令牌桶限流，避免把 MQ 打爆导致消息丢失。

### 5.3 防黄牛

四道防线，成本递增：

- **动态令牌：**一次性、绑定用户和活动、5 分钟过期、用后即删。脚本拿不到合法令牌。
- **限频：**同 IP 10 次/分钟，同 userId 1 次/秒，同设备指纹 1 次/活动。
- **行为风控：**点击间隔 < 100ms、无鼠标轨迹、无页面停留、设备指纹异常、账号注册时间短——命中即降权或直接拒绝。
- **答题/验证码：**增加机器成本，同时削峰。

### 5.4 压测与监控指标

压测：JMeter / wrk 做全链路压测，重点观察 Redis CPU、MQ lag、DB 连接池、P99。

P99：100 个请求里最慢的那 1 个的耗时。秒杀看 P99 比看平均值有意义，因为平均值会被大量“快速失败”的请求拉低。

核心监控指标：

- **库存曲线：**Redis 库存下降速率。如果 1 秒内掉了 5000 件，大概率是被脚本刷了。
- **QPS / 成功率 / 错误码分布：**快速定位是哪一层在拒绝请求。
- **Redis：**CPU、内存、慢查询、网络带宽、连接数。
- **MQ：**堆积量、消费延迟、死信数量。
- **DB：**QPS、慢 SQL、连接池活跃数、行锁等待时间。
- **业务：**订单创建成功率、支付转化率。

告警阈值：库存异常下降、MQ lag > 10 万、P99 > 500ms、错误率 > 1%、死信数 > 0。

## 第六部分：5 个高频追问

### Q1：Redis 挂了怎么办？

熔断降级，宁可暂停活动也不放流量打 DB；靠 Sentinel/Cluster 自动故障转移；恢复后用 DB 库存重建 Redis，校验通过再放开。

### Q2：库存分片后怎么扣？某个分片先卖完了怎么办？

按 userId % N 或随机选分片，Lua 内扣减该分片。某分片空了可以尝试“借”下一个分片（多一次 Redis 调用），或者直接返回售罄、接受少卖；一人一单必须用全局不分片的 Key 校验，最后靠 DB 唯一索引兜底。

### Q3：MQ 消息丢了怎么办？

生产者用 syncSend 校验 SEND_OK，失败回补 Redis；更高要求用本地消息表。消费端手动 ACK + 重试 + 死信队列；最后靠对账任务兜底，以 DB 为准修复 Redis。

### Q4：为什么不用 Redisson 分布式锁？

秒杀是单 Key 的原子 CAS，Lua 一次往返搞定；分布式锁要 3 次往返，还把并发串行化，吞吐低一个数量级。能用原子操作解决的，不要用锁。

### Q5：少卖了几百件怎么处理？

接受它，然后补偿：活动结束后跑对账，汇总 Redis 剩余 + 已支付订单 与 DB 剩余 + 有效订单，差异部分人工确认后回补库存或退款。少卖是成本，超卖是事故——这是整个设计的前提。

## 附：一句话总结

秒杀系统的本质，是用 Redis 的原子性做准入，用 MQ 做时间上的解耦，用 MySQL 做最终的账本，用“允许少卖”做所有异常分支的兜底方向。
