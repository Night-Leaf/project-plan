#!/usr/bin/env node
// check-dispatch.mjs 的固定 fixture 回归：正例、四类负例、VOID 跳过、轮次超限不越权、budget-check 兼容。
// 只用 templates/ 与 mkdtemp；不依赖任何真实 run 目录。
// 用法：node scripts/test-check-dispatch.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const checkScript = join(root, 'scripts/check-dispatch.mjs');
const budgetScript = join(root, 'scripts/budget-check.mjs');
const tpl = join(root, 'templates/dispatch.log');

let failed = 0;
let passed = 0;
const check = (ok, label, detail) => {
  if (ok) {
    passed++;
    console.log(`通过  ${label}`);
  } else {
    failed++;
    console.log(`失败  ${label}`);
    if (detail) console.log('      ' + String(detail).replace(/\n/g, '\n      '));
  }
};

// 档位首行直接取自模板，保证 fixture 与真实格式同源
const tplText = readFileSync(tpl, 'utf8');
const tplHeader = tplText
  .split(/\r?\n/)
  .map(l => l.trim())
  .find(l => /^档位[:：]/.test(l));
if (!tplHeader) {
  console.log('失败  模板 templates/dispatch.log 缺「档位:」首行');
  process.exit(1);
}

const run = (script, args) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

const makeRun = rows => {
  const dir = mkdtempSync(join(tmpdir(), 'check-dispatch-'));
  mkdirSync(join(dir, 'run'));
  writeFileSync(join(dir, 'run/dispatch.log'), [tplHeader, ...rows, ''].join('\n'));
  return dir;
};

// 跑一例：断言 exit code 与提示文本，最后删临时目录
const scenario = (label, rows, code, patterns, extra) => {
  const dir = makeRun(rows);
  try {
    if (extra) extra(dir);
    const r = run(checkScript, [dir]);
    check(r.code === code, `${label}：exit ${code}`, `${r.out}\n[实际 exit ${r.code}]`);
    for (const p of patterns) check(p.test(r.out), `${label}：提示匹配 ${p}`, r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const review = (n, head, strength = 'reasoning=high') =>
  `R${n} | 阶段2 审查 | 审查者×${head} | ${head} 路 one-message | ${strength} | 2026-11-06T10:0${n}`;

// ---------- 正例：普通档 4 路 + one-message + reasoning=high ----------
scenario('正例 普通档 4 路 + one-message + reasoning=high', [review(1, 4)], 0, [
  /全部通过/,
  /档位 普通/,
  /审查轮 R1/,
  /轮次\/重开\/回炉归 budget-check\.mjs/,
]);

// ---------- 正例：effort= 与 reasoning= 等价 ----------
scenario('正例 effort=low 视同 reasoning', [review(1, 4, 'effort=low')], 0, [
  /全部通过/,
]);

// ---------- 负例①：普通档只写 3 路 ----------
scenario('负例① 普通档只写 3 路', [review(1, 3)], 1, [
  /第 1 个 R（R1）/,
  /人数不符/,
  /3 路/,
  /要求 4 路/,
]);

// ---------- 负例②：缺 one-message ----------
scenario('负例② 缺 one-message', ['R1 | 阶段2 审查 | 审查者×4 | 4 路 | reasoning=high | 2026-11-06T10:05'], 1, [
  /第 1 个 R（R1）/,
  /缺 one-message/,
]);

// ---------- 负例③：reasoning=medium 越界 ----------
scenario('负例③ reasoning=medium 越界', [review(1, 4, 'reasoning=medium')], 1, [
  /第 1 个 R（R1）/,
  /推理强度越界/,
  /medium/,
  /只能是 low 或 high/,
]);

// ---------- 负例④：VOID 行无原因 ----------
scenario('负例④ VOID 行无原因', [review(1, 4), 'VOID R9'], 1, [
  /VOID R9 缺原因/,
]);

// ---------- 负例⑤：多轮时点名第几个 R ----------
scenario('负例⑤ 第二轮缺 one-message 时点名第 2 个 R', [
  review(1, 4),
  'R2 | 阶段2 审查 | 审查者×4 | 4 路 | reasoning=high | 2026-11-06T10:10',
], 1, [
  /第 2 个 R（R2）/,
  /缺 one-message/,
]);

// ---------- 兼容：被 VOID 的轮整轮跳过（R0 的坏行不报） ----------
scenario('兼容 VOID R0 整轮跳过', [
  'R0 | 阶段0 起草 REQ | 起草者 | reasoning=high | 2026-11-06T10:01',
  'R0 | 阶段0 审查 | 审查者×2 | 2 路 | reasoning=low | 2026-11-06T10:02',
  'VOID R0 | 阶段 0 起草不是审查轮，起稿误用 R0',
  review(1, 4),
], 0, [
  /全部通过/,
  /已 VOID R0/,
], dir => {
  const r = run(checkScript, [dir]);
  check(!/缺 one-message/.test(r.out), '兼容 VOID R0：作废轮的缺项未被报出', r.out);
});

// ---------- 兼容：起草 / 合并 / 执行行不校验 ----------
scenario('兼容 非审查行不校验', [
  'R1 | 阶段0 起草 REQ | 起草者 | reasoning=high | 2026-11-06T10:01',
  'R1 | 阶段3 合并（28→10，P1 3） | planner | 2026-11-06T10:10',
  'R2 | 阶段5 Task-1 执行完成 | 执行者 | reasoning=low | 2026-11-06T10:20',
  review(3, 4),
], 0, [
  /全部通过/,
  /审查轮 R3/,
]);

// ---------- 兼容：轮次超限但其余合法 → 不因轮次 exit 1 ----------
scenario('兼容 审查轮 5 轮超普通档上限仍 exit 0', [1, 2, 3, 4, 5].map(n => review(n, 4)), 0, [
  /全部通过/,
  /审查轮 R1, R2, R3, R4, R5/,
  /轮次\/重开\/回炉归 budget-check\.mjs/,
], dir => {
  const r = run(checkScript, [dir]);
  check(!/超预算|轮次超限|用完/.test(r.out), '兼容 轮次超限：本脚本不报轮次', r.out);
});

// ---------- 用法错 exit 2 ----------
{
  const r = run(checkScript, []);
  check(r.code === 2, '用法 无参数 exit 2', `${r.out}\n[实际 exit ${r.code}]`);
  check(/用法/.test(r.out), '用法 无参数提示用法', r.out);
}
{
  const dir = makeRun([review(1, 4)]);
  try {
    const r = run(checkScript, [dir, '超长']);
    check(r.code === 2, '用法 未知档位 exit 2', `${r.out}\n[实际 exit ${r.code}]`);
    check(/不认识/.test(r.out), '用法 未知档位提示档位', r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 兼容性：A5 新回执样例仍能被 budget-check.mjs 解析 ----------
{
  const dir = mkdtempSync(join(tmpdir(), 'check-dispatch-compat-'));
  try {
    mkdirSync(join(dir, 'run'));
    const a5 = [
      tplHeader,
      'R1 | 阶段2 审查 | 审查者×4 | 4 路 one-message | reasoning=high | 2026-11-06T10:05',
      'R2 | 阶段2 审查 | 审查者×4 | 4 路 one-message | effort=low | 2026-11-06T10:20',
      '',
    ].join('\n');
    writeFileSync(join(dir, 'run/dispatch.log'), a5);

    const b = run(budgetScript, [dir]);
    check(b.code === 0, '兼容 A5 样例：budget-check exit 0', `${b.out}\n[实际 exit ${b.code}]`);
    check(/审查轮\s+2 \/ 2/.test(b.out), '兼容 A5 样例：budget-check 读出审查轮 2 轮', b.out);
    check(/R1, R2/.test(b.out), '兼容 A5 样例：budget-check 点名 R1、R2', b.out);

    const c = run(checkScript, [dir]);
    check(c.code === 0, '兼容 A5 样例：check-dispatch exit 0（两个解析器认同一格式）', c.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n${passed} 条断言通过，${failed} 条失败`);
process.exit(failed ? 1 : 0);
