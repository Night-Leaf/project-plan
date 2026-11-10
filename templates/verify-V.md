# verify / V1

round=1
时间: 2026-11-06T11:40:00+08:00
对象: `plan.md` v1

| VC | 结论 | 依据 |
|---|---|---|
| VC-1 | pass | `evidence/Task-1.md:12`，复跑一次结果一致 |
| VC-2 | unresolved | 证据里只有命令没有输出 |

## 判定规矩

- `pass`：证据存在；只读 / 幂等类还要复跑一致。
- `fail`：有反证，能指出哪一行。
- `unresolved`：证据不足或这条没法判。缺命令原文 / 完整输出 / 时间戳任一，就判这个。
- 破坏性 VC：只核已有输出，**不复跑**，抽查也不碰。
- `run/decisions.md` 里已确认延后的项不算 fail，但要列出来。

## 汇总

```
pass 1 / fail 0 / unresolved 1
```

有 fail 就写清重开哪个 Task：

- `VC-2` fail → 重开 `Task-2`
