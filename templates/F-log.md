# F-log —— 阶段 5（执行）产生的 F 就落这里

阶段 3 的 F 表在 `reviews/R{n}-index.md`；执行期新冒出来的（`BLOCKED-###`、执行时发现的计划缺口）写在下面，阶段 3 合并时并进 index。

| F-### | 来源 | 严重度 | 一句话 | 结局 |
|---|---|---|---|---|
| F-133 | BLOCKED-001 @R2 / Task-1 | P1 | pnpm 12 要 `pnpm-workspace.yaml` 才能装 esbuild，该文件不在白名单 | 建计划缺口：解冻升版 + 回炉 |

## 规矩

- 编号接着 `R{n}-index.md` 最后一个往下排，**不许重用**。
- 作者只有主会话。执行者不写这个文件（它只有 `evidence/`）。
- 结局四选一，与 `R{n}-answer.md` 同：`fixed` / `repair claimed — still reported` / `deferred: 原因` / `unresolved`。
- 根因在计划（缺文件、判据写错、任务缺一步）的，写「建计划缺口」，**不要重开执行**——重开一百次也过不了。
