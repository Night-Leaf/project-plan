#!/usr/bin/env node
// check-batch.mjs 的固定 fixture 回归：六例覆盖交集、无交集、缺字段、仅将修改、占位、反斜杠归一
// 用法：node scripts/test-batch.mjs
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const script = join(root, 'scripts', 'check-batch.mjs');
const tpl = readFileSync(join(root, 'templates', 'plan.md'), 'utf8');

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

const taskRange = (lines, n) => {
  const start = lines.findIndex(l => new RegExp(`^###\\s+Task-${n}(?:\\s|$)`).test(l));
  if (start < 0) throw new Error(`模板里没有 Task-${n}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^###\s|^##\s/.test(lines[i])) { end = i; break; }
  }
  return [start, end];
};

// value 为 null 表示删掉这一类字段行；否则整类替换成一行
const setField = (plan, n, kind, value) => {
  const lines = plan.split('\n');
  let [start, end] = taskRange(lines, n);
  const re = new RegExp(`^\\s*涉及文件（${kind}）[：:]`);
  let first = -1;
  for (let i = start + 1; i < end; i++) {
    if (!re.test(lines[i])) continue;
    if (first < 0) first = i;
    lines.splice(i, 1);
    i--;
    end--;
  }
  if (value !== null) {
    if (first >= 0) {
      lines.splice(first, 0, value);
    } else {
      let pos = start + 1;
      for (let i = start + 1; i < end; i++) {
        if (/^\s*做什么[：:]/.test(lines[i])) { pos = i + 1; break; }
      }
      lines.splice(pos, 0, value);
    }
  }
  return lines.join('\n');
};

const runCase = planText => {
  const dir = mkdtempSync(join(tmpdir(), 'check-batch-'));
  try {
    const planPath = join(dir, 'plan.md');
    writeFileSync(planPath, planText);
    const r = spawnSync(process.execPath, [script, planPath], { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const cases = [
  {
    label: '① 将新建交集（、 与 , 各一次）',
    plan: setField(
      setField(tpl, 1, '将新建', '涉及文件（将新建）：`src/a.mjs`、`src/c.mjs`'),
      2, '将新建', '涉及文件（将新建）：`src/c.mjs`,`src/b.mjs`',
    ),
    code: 1,
    want: ['Task-1 与 Task-2', 'src/c.mjs'],
  },
  {
    label: '② 无交集',
    plan: setField(tpl, 2, '将新建', '涉及文件（将新建）：`src/b.mjs`'),
    code: 0,
    want: ['无交集'],
  },
  {
    label: '③ 缺字段（删掉 Task-2 的将新建行）',
    plan: setField(tpl, 2, '将新建', null),
    code: 2,
    want: ['Task-2'],
  },
  {
    label: '④ 仅将修改交集（package.json）',
    plan: setField(
      setField(tpl, 2, '将新建', null),
      2, '将修改', '涉及文件（将修改）：`package.json`',
    ),
    code: 1,
    want: ['package.json'],
  },
  {
    label: '⑤ 占位（模板原样，Task-2 的 ……）',
    plan: tpl,
    code: 2,
    want: ['Task-2'],
  },
  {
    label: '⑥ 反斜杠路径归一后交集',
    plan: setField(
      setField(tpl, 1, '将新建', '涉及文件（将新建）：`src/lib\\a.mjs`'),
      2, '将新建', '涉及文件（将新建）：`src/lib/a.mjs`',
    ),
    code: 1,
    want: ['src/lib/a.mjs'],
  },
];

for (const c of cases) {
  const r = runCase(c.plan);
  check(r.code === c.code, `${c.label} exit ${c.code}（实际 ${r.code}）`, r.out);
  for (const w of c.want) check(r.out.includes(w), `${c.label} 输出含 ${w}`, r.out);
}

console.log(`\n${failed ? `失败 ${failed} 项` : `六例全过（${passed} 项断言）`}`);
process.exit(failed ? 1 : 0);
