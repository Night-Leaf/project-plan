// check-final.mjs 的固定 fixture 回归：full 的负例/正例 + plan-only 的负例/正例
// 只用 templates/ 与 mkdtemp；不依赖任何真实 run 目录。
// 用法：node scripts/test-check-final.mjs
import {
  mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const checkScript = join(root, 'scripts/check-final.mjs');
const tpl = join(root, 'templates');

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

const runCheck = dir => {
  const r = spawnSync(process.execPath, [checkScript, dir], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

// 最小 plan.md：check-final 只关心 Task 段的「是否不可逆」和指纹
const makePlan = irreversible => [
  '# plan fixture',
  '',
  '## 任务',
  '',
  '### Task-1 fixture',
  '',
  '做什么：给 check-final 造验收材料',
  '涉及文件（将新建）：`a.mjs`',
  `是否不可逆：${irreversible ? '是' : '否'}`,
  '完成标志：node scripts/check-final.mjs <runDir> exit 0',
  '追溯：REQ-001',
  '',
].join('\n');

const validReport = owner => [
  '# 报告 / fixture',
  '',
  `验收归属: ${owner}`,
  '',
  '## 三个数字',
  '',
  '**pass 2 / fail 0 / unresolved 0**',
  '',
  '依据：`verify/V1.md`',
  '',
].join('\n');

const writeFingerprint = (dir, shaOverride) => {
  const real = createHash('sha256').update(readFileSync(join(dir, 'plan.md'))).digest('hex');
  writeFileSync(join(dir, 'run/fingerprint.txt'), [
    'version: v1',
    'plan: plan.md',
    `sha256: ${shaOverride ?? real}`,
    'time: 2026-11-06T11:00:00+08:00',
    '',
  ].join('\n'));
};

// 默认造一份材料齐全的 run，再由各例覆盖缺失项
const makeRun = ({
  tier = '短', irreversible = false, report = validReport('自验'),
  withVerify = true, withFingerprint = true,
} = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-final-'));
  mkdirSync(join(dir, 'run'));
  if (withVerify) {
    mkdirSync(join(dir, 'verify'));
    copyFileSync(join(tpl, 'verify-V.md'), join(dir, 'verify/V1.md'));
  }
  writeFileSync(join(dir, 'plan.md'), makePlan(irreversible));
  writeFileSync(join(dir, 'run/dispatch.log'), `档位: ${tier} | 部件 4 | planner | 2026-11-06T10:00\n`);
  if (report !== null) writeFileSync(join(dir, 'run/report.md'), report);
  if (withFingerprint) writeFingerprint(dir);
  return dir;
};

// plan-only 的正例报告：模式行 + 引用 plan.md，不要求三个数字与 V{n}.md
const validPlanOnlyReport = () => [
  '# 报告 / fixture',
  '',
  '模式: plan-only',
  '',
  '本 run 只产出计划，不执行、不验收。',
  '',
  '依据：`plan.md`（sha256 已核对）',
  '',
].join('\n');

// plan-only 的最小材料：plan + 指纹 + 报告 + 空的 evidence/verify + 无批准执行的 dispatch.log
const makePlanOnlyRun = ({
  report = validPlanOnlyReport(), withFingerprint = true,
} = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-final-plan-only-'));
  mkdirSync(join(dir, 'run'));
  mkdirSync(join(dir, 'evidence'));
  mkdirSync(join(dir, 'verify'));
  writeFileSync(join(dir, 'plan.md'), makePlan(false));
  writeFileSync(join(dir, 'run/mode'), 'plan-only\n');
  writeFileSync(join(dir, 'run/dispatch.log'), '档位: 普通 | 部件 4 | planner | 2026-11-06T10:00\n');
  if (report !== null) writeFileSync(join(dir, 'run/report.md'), report);
  if (withFingerprint) writeFingerprint(dir);
  return dir;
};

// 跑一例：断言 exit code，并逐条断言提示文本
const scenarioWith = (make, label, opts, code, patterns, tweak) => {
  const dir = make(opts);
  try {
    if (tweak) tweak(dir);
    const r = runCheck(dir);
    check(r.code === code, `${label}：exit ${code}`, `${r.out}\n[实际 exit ${r.code}]`);
    for (const p of patterns) check(p.test(r.out), `${label}：提示匹配 ${p}`, r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const scenario = (label, opts, code, patterns, tweak) =>
  scenarioWith(makeRun, label, opts, code, patterns, tweak);
const planOnlyScenario = (label, opts, code, patterns, tweak) =>
  scenarioWith(makePlanOnlyRun, label, opts, code, patterns, tweak);

// ---------- 负例① 无 verify ----------
scenario('负例① 无 verify', { withVerify: false }, 1, [
  /缺 verify\/V\{n\}\.md/,
]);

// ---------- 负例② report 缺数字（只引 V） ----------
scenario('负例②a report 缺数字（只引 V1.md）', {
  report: '# 报告 / fixture\n\n验收归属: 自验\n\n依据：`verify/V1.md`\n',
}, 1, [
  /缺数字：pass \/ fail \/ unresolved/,
]);

// ---------- 负例② 有数字但不引用 V ----------
scenario('负例②b report 有数字但不引用 V', {
  report: '# 报告 / fixture\n\n验收归属: 自验\n\n**pass 2 / fail 0 / unresolved 0**\n',
}, 1, [
  /没有引用 verify\/V\{n\}\.md/,
]);

// ---------- 负例③ 短档 + 不可逆 + 自验 ----------
scenario('负例③ 短档+不可逆+自验', {
  tier: '短', irreversible: true, report: validReport('自验'),
}, 1, [
  /是否不可逆：是/,
  /必须是「独立」/,
  /自验/,
]);

// ---------- 负例④ 普通档 + 自验 ----------
scenario('负例④ 普通档+自验', {
  tier: '普通', irreversible: false, report: validReport('自验'),
}, 1, [
  /档位是「普通」/,
  /必须是「独立」/,
]);

// ---------- 负例⑤ 指纹缺失 ----------
scenario('负例⑤a 指纹缺失', {
  withFingerprint: false, report: validReport('自验'),
}, 1, [
  /缺 run\/fingerprint\.txt/,
]);

// ---------- 负例⑤ 指纹失配 ----------
scenario('负例⑤b 指纹失配', {
  report: validReport('自验'),
}, 1, [
  /sha256 不一致/,
], dir => writeFingerprint(dir, '0'.repeat(64)));

// ---------- 负例⑥ 模板 report.md 原样拷贝（占位未填） ----------
scenario('负例⑥ 模板 report.md 原样拷贝', {
  tier: '短', irreversible: false,
  report: readFileSync(join(tpl, 'report.md'), 'utf8'),
}, 1, [
  /验收归属/,
  /占位未填/,
]);

// ---------- 负例⑦ 档位不是 短 / 普通 / 长 ----------
scenario('负例⑦ 未知档位「超长」', {
  tier: '超长', irreversible: false, report: validReport('自验'),
}, 1, [
  /读不到档位/,
]);

// ---------- 正例① 短档 + 无不可逆 + 自验 ----------
scenario('正例① 短档+无不可逆+自验', {
  tier: '短', irreversible: false, report: validReport('自验'),
}, 0, [
  /全部通过/,
  /归属 自验/,
]);

// ---------- 正例② 全过：普通档 + 独立 + 三数字 + V + 指纹匹配 ----------
scenario('正例② 普通档+独立+三数字+V+指纹匹配', {
  tier: '普通', irreversible: false, report: validReport('独立'),
}, 0, [
  /全部通过/,
  /归属 独立/,
  /指纹一致/,
]);

// ---------- 正例③ plan-only：指纹匹配 + 模式行 + evidence/verify 空 + 无批准执行 ----------
planOnlyScenario('正例③ plan-only 正例（指纹匹配+模式行+evidence/verify 空）', {}, 0, [
  /全部通过/,
  /模式 plan-only/,
  /指纹一致/,
]);

// ---------- 负例⑧ plan-only 缺指纹 ----------
planOnlyScenario('负例⑧ plan-only 缺指纹', { withFingerprint: false }, 1, [
  /缺 run\/fingerprint\.txt/,
]);

// ---------- 负例⑨ plan-only 的 report 缺「模式: plan-only」行 ----------
planOnlyScenario('负例⑨ plan-only report 缺模式行', {
  report: '# 报告 / fixture\n\n依据：`plan.md`\n',
}, 1, [
  /缺「模式: plan-only」行/,
]);

// ---------- 负例⑩ plan-only 但 evidence/ 非空 ----------
planOnlyScenario('负例⑩ plan-only 但 evidence/ 非空', {}, 1, [
  /evidence\/ 必须为空/,
], dir => writeFileSync(join(dir, 'evidence/Task-1.md'), '# evidence / fixture\n'));

// ---------- 负例⑪ plan-only 有 verify/ 且无 report ----------
planOnlyScenario('负例⑪ plan-only 有 verify/ 且无 report', { report: null }, 1, [
  /verify\/ 必须为空/,
  /缺 run\/report\.md/,
], dir => writeFileSync(join(dir, 'verify/V1.md'), '# V1 / fixture\n'));

// ---------- 负例⑫ plan-only 但 dispatch.log 有「批准执行」行 ----------
planOnlyScenario('负例⑫ plan-only 但 dispatch.log 有「批准执行」', {}, 1, [
  /dispatch\.log 含「批准执行」行/,
], dir => writeFileSync(join(dir, 'run/dispatch.log'), [
  '档位: 普通 | 部件 4 | planner | 2026-11-06T10:00',
  '批准执行 v1 | plan sha256 abcdef123456 | 用户原话「执行」',
  '',
].join('\n')));

// ---------- 负例⑬ 非法 mode ----------
scenario('负例⑬ 非法 mode「planonly」', {}, 1, [
  /run\/mode 非法/,
  /planonly/,
], dir => writeFileSync(join(dir, 'run/mode'), 'planonly\n'));

// ---------- 负例⑭ plan-only 原样拷贝 templates/report.md：注释里的 plan-only 不算模式行 ----------
planOnlyScenario('负例⑭ plan-only 原样拷贝模板（注释含 plan-only，正文 模式: full）', {
  report: readFileSync(join(tpl, 'report.md'), 'utf8'),
}, 1, [
  /缺「模式: plan-only」行/,
  /模式: full/,
]);

console.log(`\n${passed} 条断言通过，${failed} 条失败`);
process.exit(failed ? 1 : 0);
