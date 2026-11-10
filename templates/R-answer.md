# R{n} 处置

每条 `F-###` 必须四选一。没有"驳回"这个动作。

| F-### | 结局 | 改在哪 | 怎么改的 | 波及哪几处 |
|---|---|---|---|---|
| F-001 | fixed | `plan.md:41` | 把 VC 换成可失败的判据 | `plan.md:88`、`VC-3` |
| F-002 | deferred: 缺数据源 | — | — | — |
| F-003 | repair claimed — still reported | `plan.md:90` | 改了措辞 | 无 |
| F-004 | unresolved | — | — | — |

## 规矩

- `fixed` 三样缺一不可：**改在哪**（文件:行）、**怎么改的**、**波及哪几处**（没有就写"无"，不许空）。
- 一条问题一处改。要动多处，先在这条写一句为什么。
- 改完跑 `node scripts/check-plan.mjs plan.md REQ.md`，再跑 `node scripts/check-diff.mjs <runDir> plan.md <本文件>`。
- 这是**唯一**可以写评审过程的地方。`plan.md` 里不写"某某提出"。
- `deferred` 要写清原因和接收人；没被用户确认的 `deferred`，按 `unresolved` 算。
