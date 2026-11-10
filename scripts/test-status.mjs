// status.mjs 的固定 fixture 回归：具体值 / 作废轮 / 缺文件负例 / 输出行数
// 用法：node scripts/test-status.mjs
import {
  mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

import { readMode } from './mode.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const statusScript = join(root, 'scripts/status.mjs');
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

const runStatus = dir => {
  const r = spawnSync(process.execPath, [statusScript, dir], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

const lineCount = text => text.replace(/\n$/, '').split('\n').length;
const hasAllCategories = text => ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'].every(k => text.includes(k));
const planSha = () => createHash('sha256').update(readFileSync(join(tpl, 'plan.md'))).digest('hex');

const makeBase = prefix => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(dir, 'run'));
  mkdirSync(join(dir, 'reviews'));
  mkdirSync(join(dir, 'evidence'));
  mkdirSync(join(dir, 'verify'));
  copyFileSync(join(tpl, 'plan.md'), join(dir, 'plan.md'));
  return dir;
};

// 把模板指纹的 sha256 换成模板 plan.md 的真实值，造「已批准」
const writeApprovedFingerprint = dir => {
  const fp = readFileSync(join(tpl, 'fingerprint.txt'), 'utf8')
    .replace(/^sha256:.*$/m, `sha256: ${planSha()}`);
  writeFileSync(join(dir, 'run/fingerprint.txt'), fp);
};

const copyEvidence = (dir, name) =>
  copyFileSync(join(tpl, 'evidence-Task.md'), join(dir, 'evidence', name));
const copyVerify = (dir, name) =>
  copyFileSync(join(tpl, 'verify-V.md'), join(dir, 'verify', name));
const copyReview = (dir, name) =>
  copyFileSync(join(tpl, 'R-方向.md'), join(dir, 'reviews', name));

const assertCommon = (label, r) => {
  check(r.code === 0, `${label} exit 0`, r.out);
  check(hasAllCategories(r.out), `${label} 八类齐全`, r.out);
  check(lineCount(r.out) <= 60, `${label} 输出 ≤ 60 行（实际 ${lineCount(r.out)}）`, r.out);
};

// ---------- 1) 固定 fixture：普通档 · 部件 12 · R2 · 已批准 ----------
{
  const dir = makeBase('status-fixed-');
  try {
    copyFileSync(join(tpl, 'dispatch.log'), join(dir, 'run/dispatch.log'));
    copyFileSync(join(tpl, 'fingerprint.txt'), join(dir, 'run/fingerprint.txt'));
    writeApprovedFingerprint(dir);
    copyEvidence(dir, 'Task-1.md');
    copyVerify(dir, 'V1.md');
    copyReview(dir, 'R1-A.md');
    copyReview(dir, 'R1-B.md');
    copyReview(dir, 'R1-index.md');
    copyReview(dir, 'R1-answer.md');
    copyReview(dir, 'R2-A.md');

    const r = runStatus(dir);
    assertCommon('固定 fixture（已批准）', r);
    check(/①.*普通/.test(r.out) && /部件 12/.test(r.out), '档位与部件取首行：普通 / 部件 12', r.out);
    check(/轮次.*当前 R2/.test(r.out), '当前轮次 R2（R1/R2 已用）', r.out);
    check(/审查轮 2 \/ 2/.test(r.out), '审查轮 2 / 2（普通档上限 2）', r.out);
    check(/重开 0 \/ 2/.test(r.out), '重开 0 / 2', r.out);
    check(/回炉 0 \/ 1/.test(r.out), '回炉 0 / 1（批准 1 次给 1 次）', r.out);
    check(/④ reviews.*R1:.*R2:/.test(r.out), 'reviews 清单含 R1、R2', r.out);
    check(/⑤ verify.*V1\.md.*pass 1 \/ fail 0 \/ unresolved 1/.test(r.out), 'verify 状态读出 V1 汇总数字', r.out);
    check(/② 阶段.*阶段5 执行.*显式/.test(r.out), '有显式批准状态时不标推断', r.out);
    check(/⑧ 批准.*已批准（v1，sha256 一致）/.test(r.out), '已批准一例：指纹与 plan.md 一致', r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 2) 未批准一例：模板指纹 sha256 全 0，与 plan.md 失配 ----------
{
  const dir = makeBase('status-unapproved-');
  try {
    copyFileSync(join(tpl, 'dispatch.log'), join(dir, 'run/dispatch.log'));
    copyFileSync(join(tpl, 'fingerprint.txt'), join(dir, 'run/fingerprint.txt'));
    copyEvidence(dir, 'Task-1.md');

    const r = runStatus(dir);
    assertCommon('未批准 fixture', r);
    check(/⑧ 批准.*未批准（sha256 失配/.test(r.out), '未批准一例：sha256 失配', r.out);
    check(!/已批准/.test(r.out), '未批准输出里不出现「已批准」', r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 3) 作废轮 + 旧 V + 重开前 evidence ----------
{
  const dir = makeBase('status-reopen-');
  try {
    writeFileSync(join(dir, 'run/dispatch.log'), [
      '# 测试 fixture：R2 作废，Task-2 在旧 V 之后被重开',
      '档位: 普通 | 部件 9 | planner | 2026-11-06T10:00',
      'R1 | 审查 3 路 one-message | 审查者×3 | reasoning=high | 2026-11-06T10:05',
      'R1 | 阶段3 合并 | planner | 2026-11-06T10:30',
      '批准 v1 | 用户原话「批准 v1」 | 用户 | 2026-11-06T11:00',
      'R2 | 审查 3 路 one-message（diff） | 审查者×3 | reasoning=high | 2026-11-06T11:10',
      'VOID R2 | 作废：审查者没写文件，不计预算 | 2026-11-06T11:20',
      '重开 | 重开 Task-2：验收 fail 根因在执行，旧 V 不算当前进度 | 2026-11-06T11:30',
    ].join('\n') + '\n');
    writeApprovedFingerprint(dir);
    copyVerify(dir, 'V1.md');
    copyEvidence(dir, 'Task-1.md');
    copyEvidence(dir, 'Task-2.md');
    copyReview(dir, 'R1-A.md');
    copyReview(dir, 'R2-A.md');

    const r = runStatus(dir);
    assertCommon('作废轮 + 重开 fixture', r);
    check(/轮次.*当前 R1/.test(r.out), '作废轮 R2 不被当当前轮次（当前 R1）', r.out);
    check(/作废 R2/.test(r.out), 'VOID 的轮次被标为作废 R2', r.out);
    check(/② 阶段.*阶段5 执行（显式：重开 Task-2）/.test(r.out), '阶段取显式重开状态，不退化成阶段6', r.out);
    check(!/② 阶段.*阶段6 验收/.test(r.out), '旧 verify/V1 没把阶段带偏到验收', r.out);
    check(/⑦ 下一步.*重开 Task-2：验收 fail 根因在执行/.test(r.out), '下一步点名重开的 Task-2 与原因', r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 4) 负例：缺 dispatch.log ----------
{
  const dir = mkdtempSync(join(tmpdir(), 'status-nolog-'));
  try {
    mkdirSync(join(dir, 'reviews'));
    mkdirSync(join(dir, 'evidence'));
    copyFileSync(join(tpl, 'plan.md'), join(dir, 'plan.md'));
    copyReview(dir, 'R1-A.md');
    copyEvidence(dir, 'Task-1.md');

    const r = runStatus(dir);
    assertCommon('缺 dispatch.log 负例', r);
    check(/① 档位与部件.*未生成/.test(r.out), '缺 dispatch.log：档位与部件写「未生成」', r.out);
    check(/③ 预算.*未生成/.test(r.out), '缺 dispatch.log：预算写「未生成」', r.out);
    check(/② 阶段.*（推断：/.test(r.out), '无显式状态时阶段标「推断」', r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 5) 负例：缺 reviews/ ----------
{
  const dir = mkdtempSync(join(tmpdir(), 'status-noreviews-'));
  try {
    mkdirSync(join(dir, 'run'));
    mkdirSync(join(dir, 'evidence'));
    copyFileSync(join(tpl, 'plan.md'), join(dir, 'plan.md'));
    copyFileSync(join(tpl, 'dispatch.log'), join(dir, 'run/dispatch.log'));
    copyEvidence(dir, 'Task-1.md');

    const r = runStatus(dir);
    assertCommon('缺 reviews/ 负例', r);
    check(/④ reviews  未生成/.test(r.out), '缺 reviews/：清单写「未生成」', r.out);
    check(/①.*普通/.test(r.out), '缺 reviews/ 不影响档位读取', r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 6) STATE.md 显式三字段：阶段与摘要优先于目录推断 ----------
{
  const dir = makeBase('status-state-');
  try {
    writeFileSync(join(dir, 'run/dispatch.log'), [
      '档位: 普通 | 部件 9 | planner | 2026-11-06T10:00',
      'R1 | 审查 3 路 one-message | 审查者×3 | reasoning=high | 2026-11-06T10:05',
    ].join('\n') + '\n');
    writeFileSync(join(dir, 'run/STATE.md'), [
      '# STATE',
      '停在哪：阶段3 合并处置',
      '为什么：R1 三份审查稿已齐，还没合并',
      '下一步：写合并对照表与处置稿',
    ].join('\n') + '\n');
    copyEvidence(dir, 'Task-1.md');
    copyReview(dir, 'R1-A.md');

    const r = runStatus(dir);
    assertCommon('STATE.md fixture', r);
    check(/② 阶段.*阶段3 合并处置（显式：STATE\.md 停在哪）/.test(r.out), '状态读 STATE.md，不被 evidence/ 带偏', r.out);
    check(/⑥ STATE.*停在哪：阶段3 合并处置.*为什么：R1 三份审查稿已齐，还没合并.*下一步：写合并对照表与处置稿/.test(r.out), 'STATE 摘要三字段完整', r.out);
    check(/⑦ 下一步  写合并对照表与处置稿/.test(r.out), '下一步取 STATE.md 的「下一步」', r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 7) 回炉行：显式回到阶段2，预算计 1 次 ----------
{
  const dir = makeBase('status-reheat-');
  try {
    writeFileSync(join(dir, 'run/dispatch.log'), [
      '档位: 普通 | 部件 9 | planner | 2026-11-06T10:00',
      'R1 | 审查 3 路 one-message | 审查者×3 | reasoning=high | 2026-11-06T10:05',
      '批准 v1 | 用户原话「批准 v1」 | 用户 | 2026-11-06T11:00',
      '回炉 | 验收发现判据错，改 plan.md 重审 | 2026-11-06T12:00',
    ].join('\n') + '\n');
    writeApprovedFingerprint(dir);

    const r = runStatus(dir);
    assertCommon('回炉 fixture', r);
    check(/② 阶段.*阶段2 审查（显式：dispatch\.log 回炉行）/.test(r.out), '回炉行把阶段拉回阶段2', r.out);
    check(/回炉 1 \/ 1/.test(r.out), '回炉预算 1 / 1', r.out);
    check(/⑦ 下一步  回炉重审：验收发现判据错/.test(r.out), '下一步写回炉原因', r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 8) 空目录：什么都不缺也不崩 ----------
{
  const dir = mkdtempSync(join(tmpdir(), 'status-empty-'));
  try {
    const r = runStatus(dir);
    assertCommon('空 run 负例', r);
    check(/① 档位与部件.*未生成/.test(r.out), '空 run：档位写「未生成」', r.out);
    check(/④ reviews  未生成/.test(r.out), '空 run：reviews 写「未生成」', r.out);
    check(/⑤ verify  未生成/.test(r.out), '空 run：verify 写「未生成」', r.out);
    check(/⑥ STATE  未生成/.test(r.out), '空 run：STATE 写「未生成」', r.out);
    check(/⑧ 批准.*未批准/.test(r.out), '空 run：未批准', r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 9) 已收官：report.md 存在且验收全 pass → DONE ----------
{
  const dir = makeBase('status-done-');
  try {
    writeFileSync(join(dir, 'run/dispatch.log'), [
      '档位: 普通 | 部件 12 | planner | 2026-11-06T10:00',
      'R1 | 审查 4 路 one-message | 审查者×4 | reasoning=high | 2026-11-06T10:05',
      '批准 v3 | 用户原话「批准 v3」 | 用户 | 2026-11-06T11:00',
    ].join('\n') + '\n');
    writeApprovedFingerprint(dir);
    writeFileSync(join(dir, 'verify/V1.md'), '# verify / V1\n\n```\npass 2 / fail 0 / unresolved 0\n```\n');
    writeFileSync(join(dir, 'run/report.md'), '# 报告\n\n验收归属: 独立\n\n**pass 2 / fail 0 / unresolved 0**\n\n见 `verify/V1.md`。\n');
    copyEvidence(dir, 'Task-1.md');

    const r = runStatus(dir);
    assertCommon('已收官 fixture', r);
    check(/② 阶段.*DONE/.test(r.out), '报告已生成且验收全 pass → DONE', r.out);
    check(!/阶段5 执行/.test(r.out), '批准分支不再压过已收官', r.out);
    check(/⑦ 下一步  DONE/.test(r.out), '下一步写 DONE', r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 10) report.md 存在但验收有 unresolved → 阶段7 报告 ----------
{
  const dir = makeBase('status-report-u-');
  try {
    writeFileSync(join(dir, 'run/dispatch.log'), [
      '档位: 普通 | 部件 12 | planner | 2026-11-06T10:00',
      'R1 | 审查 4 路 one-message | 审查者×4 | reasoning=high | 2026-11-06T10:05',
      '批准 v3 | 用户原话「批准 v3」 | 用户 | 2026-11-06T11:00',
    ].join('\n') + '\n');
    writeApprovedFingerprint(dir);
    writeFileSync(join(dir, 'verify/V1.md'), '# verify / V1\n\n```\npass 1 / fail 0 / unresolved 1\n```\n');
    writeFileSync(join(dir, 'run/report.md'), '# 报告\n\n验收归属: 独立\n\n**pass 1 / fail 0 / unresolved 1**\n\n见 `verify/V1.md`。\n');
    copyEvidence(dir, 'Task-1.md');

    const r = runStatus(dir);
    assertCommon('报告有 unresolved fixture', r);
    check(/② 阶段.*阶段7 报告/.test(r.out), '验收有 unresolved 时停在阶段7 报告', r.out);
    check(!/② 阶段.*DONE/.test(r.out), '有 unresolved 不判 DONE', r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 模式行（Task-2）：mode.mjs 解析 + status 的「模式:」行 ----------
{
  const dir = mkdtempSync(join(tmpdir(), 'status-mode-'));
  try {
    mkdirSync(join(dir, 'run'));
    writeFileSync(join(dir, 'run/dispatch.log'), '档位: 短 | 部件 3 | planner | 2026-11-06T10:00\n');

    // 缺文件 → full（正例）
    const missing = readMode(dir);
    check(
      missing.mode === 'full' && missing.raw === null,
      'mode: 缺 run/mode → full（raw 为 null）',
      JSON.stringify(missing),
    );

    // BOM + plan-only（正例）
    writeFileSync(join(dir, 'run/mode'), '\ufeffplan-only');
    const bom = readMode(dir);
    check(bom.mode === 'plan-only', 'mode: BOM + plan-only → plan-only', JSON.stringify(bom));

    // 大写（正例）
    writeFileSync(join(dir, 'run/mode'), 'PLAN-ONLY\n');
    const upper = readMode(dir);
    check(upper.mode === 'plan-only', 'mode: PLAN-ONLY 大写 → plan-only', JSON.stringify(upper));

    // CRLF（正例）
    writeFileSync(join(dir, 'run/mode'), 'plan-only\r\n');
    const crlf = readMode(dir);
    check(crlf.mode === 'plan-only', 'mode: plan-only + CRLF → plan-only', JSON.stringify(crlf));

    // 空文件（负例，不回落 full）
    writeFileSync(join(dir, 'run/mode'), '');
    const empty = readMode(dir);
    check(
      empty.mode === 'invalid' && empty.raw === '',
      'mode: 空文件 → invalid（不回落 full）',
      JSON.stringify(empty),
    );

    // 全空白（负例）
    writeFileSync(join(dir, 'run/mode'), '  \r\n\t\n ');
    const blank = readMode(dir);
    check(
      blank.mode === 'invalid' && blank.raw === '',
      'mode: 全空白 → invalid（不回落 full）',
      JSON.stringify(blank),
    );

    // 未知值（负例，带回原值）
    writeFileSync(join(dir, 'run/mode'), 'planonly\n');
    const unknown = readMode(dir);
    check(
      unknown.mode === 'invalid' && unknown.raw === 'planonly',
      'mode: 未知值 planonly → invalid 并带回原值',
      JSON.stringify(unknown),
    );

    // status 集成：缺文件 → 「模式: full」，退出 0，原输出行不变
    rmSync(join(dir, 'run/mode'), { force: true });
    const rFull = runStatus(dir);
    check(
      rFull.code === 0 && /^模式: full$/m.test(rFull.out),
      'status: 缺 mode → 「模式: full」且 exit 0',
      rFull.out,
    );
    check(
      /① 档位与部件.*档位: 短/.test(rFull.out) && /⑧ 批准/.test(rFull.out),
      'status: 加模式行后原有输出行仍在',
      rFull.out,
    );

    // status 集成：BOM + CRLF + plan-only → 「模式: plan-only」
    writeFileSync(join(dir, 'run/mode'), '\ufeffplan-only\r\n');
    const rPlan = runStatus(dir);
    check(
      rPlan.code === 0 && /^模式: plan-only$/m.test(rPlan.out),
      'status: plan-only 归一后输出「模式: plan-only」',
      rPlan.out,
    );

    // status 集成：未知值 → 「模式: 非法（planonly）」，不回落 full
    writeFileSync(join(dir, 'run/mode'), 'planonly\n');
    const rBad = runStatus(dir);
    check(
      /^模式: 非法（planonly）$/m.test(rBad.out),
      'status: 非法值输出「模式: 非法（planonly）」',
      rBad.out,
    );
    check(
      !/^模式: full$/m.test(rBad.out),
      'status: 非法值不回落 full',
      rBad.out,
    );

    // status 集成：空文件 → 「模式: 非法（）」
    writeFileSync(join(dir, 'run/mode'), '');
    const rEmpty = runStatus(dir);
    check(
      /^模式: 非法（）$/m.test(rEmpty.out),
      'status: 空文件输出「模式: 非法（）」',
      rEmpty.out,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- 11) 相对路径按 cwd 解析（脚本放在 skill 目录也能给项目 run 用） ----------
{
  const cwdDir = mkdtempSync(join(tmpdir(), 'status-cwd-'));
  try {
    mkdirSync(join(cwdDir, 'myrun', 'run'), { recursive: true });
    writeFileSync(join(cwdDir, 'myrun', 'run', 'dispatch.log'), '档位: 短 | 部件 3 | planner | 2026-11-06T10:00\n');
    const r = spawnSync(process.execPath, [statusScript, 'myrun'], { cwd: cwdDir, encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    check(r.status === 0, '相对路径 fixture exit 0', out);
    check(/档位: 短/.test(out), '相对 runDir 按 cwd 解析，不按脚本所在仓库', out);
  } finally {
    rmSync(cwdDir, { recursive: true, force: true });
  }
}

console.log(`\n${passed} 条断言通过，${failed} 条失败`);
process.exit(failed ? 1 : 0);
