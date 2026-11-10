#!/usr/bin/env node
// 验收闸门：按 run/mode 分支，逐条核一个 run 的验收材料，缺项就点名并 exit 1。
//
// full（缺省）：
// (a) 至少一份 verify/V{n}.md
// (b) run/report.md：验收归属整行精确匹配、pass/fail/unresolved 三个数字、引用 V{n}.md
// (c) 档位（dispatch.log 首行）与 plan.md 的「是否不可逆：是」共同决定归属是否必须「独立」
// (d) run/fingerprint.txt 存在，且其中 sha256 与 plan.md 一致
//
// plan-only（只出计划、不执行、不验收）：
// (a) plan.md 存在
// (b) run/fingerprint.txt 存在且 sha256 与 plan.md 一致
// (c) run/report.md 含「模式: plan-only」行（先剥 HTML 注释，再整行严格匹配），并引用 plan.md
// (d) evidence/ 与 verify/ 必须为空
// (e) dispatch.log 不得含「批准执行」行
// mode 非法（空文件、全空白、未知值）→ exit 1 并点名原值。
//
// 用法：node scripts/check-final.mjs <runDir>
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readMode } from './mode.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const arg = process.argv[2];
if (!arg) {
  console.error('用法: node scripts/check-final.mjs <runDir>');
  process.exit(2);
}
// 相对路径按仓库根解析，脚本放在哪都能跑；绝对路径原样用。
const runDir = isAbsolute(arg) ? arg : resolve(repoRoot, arg);
const name = basename(runDir);

const problems = [];
const safeRead = p => {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
};
const safeBuf = p => {
  try { return readFileSync(p); } catch { return null; }
};
const listDir = p => {
  try { return readdirSync(p).sort(); } catch { return null; }
};

// ---------- mode：缺省 full；非法值点名原值，绝不回落 ----------
const { mode, raw } = readMode(runDir);
if (mode === 'invalid') {
  console.log(`check-final · ${name}: run/mode 非法（原值「${raw}」）；合法值只有 full / plan-only`);
  process.exit(1);
}

// ---------- plan-only：只核计划、指纹、报告模式行与「不执行、不验收」 ----------
if (mode === 'plan-only') {
  const planPath = join(runDir, 'plan.md');
  const planBuf = safeBuf(planPath);
  let planSha = null;
  if (planBuf === null) {
    problems.push('缺 plan.md：plan-only 也必须能核对指纹');
  } else {
    planSha = createHash('sha256').update(planBuf).digest('hex');
  }

  const fpText = safeRead(join(runDir, 'run', 'fingerprint.txt'));
  if (fpText === null) {
    problems.push('缺 run/fingerprint.txt：plan-only 也必须有已批准的指纹（不跳过）');
  } else {
    const fpSha = fpText.match(/^sha256:\s*([0-9a-fA-F]{64})\s*$/m)?.[1]?.toLowerCase();
    if (!fpSha) {
      problems.push('run/fingerprint.txt 里没有合法的 sha256 行');
    } else if (planSha === null) {
      problems.push('无法比对指纹：plan.md 缺失');
    } else if (fpSha !== planSha) {
      problems.push(`run/fingerprint.txt 与 plan.md 的 sha256 不一致（记录 ${fpSha.slice(0, 12)}… ≠ 实际 ${planSha.slice(0, 12)}…）`);
    }
  }

  const reportPath = join(runDir, 'run', 'report.md');
  const reportText = safeRead(reportPath);
  if (reportText === null) {
    problems.push('缺 run/report.md：plan-only 的报告还没生成');
  } else {
    // 先剥掉 HTML 注释：模板里的说明注释 `<!-- plan-only 时把上一行改成 模式: plan-only -->`
    // 会命中逐行子串匹配，让「原样拷贝模板（正文是 模式: full）」也通过。
    const stripped = reportText.replace(/<!--[\s\S]*?-->/g, '');
    const reportLines = stripped.split(/\r?\n/).map(l => l.trim());
    const seenModeLine = reportLines.find(l => /^模式[:：]/.test(l));
    if (!reportLines.some(l => /^模式:\s*plan-only\s*$/.test(l))) {
      const seen = seenModeLine ? `「${seenModeLine.slice(0, 40)}」` : '没有模式行';
      problems.push(`run/report.md 缺「模式: plan-only」行：plan-only 报告必须整行写「模式: plan-only」（现有模式行：${seen}）`);
    }
    if (!reportText.includes('plan.md')) {
      problems.push('run/report.md 没有引用 plan.md：plan-only 报告要指向本计划的 plan.md');
    }
  }

  const evidenceEntries = listDir(join(runDir, 'evidence')) || [];
  if (evidenceEntries.length) {
    problems.push(`evidence/ 必须为空（plan-only 不产出执行证据）：实际有 ${evidenceEntries.length} 项 ${evidenceEntries.slice(0, 5).join('、')}`);
  }
  const verifyEntries = listDir(join(runDir, 'verify')) || [];
  if (verifyEntries.length) {
    problems.push(`verify/ 必须为空（plan-only 不执行、不验收）：实际有 ${verifyEntries.length} 项 ${verifyEntries.slice(0, 5).join('、')}`);
  }

  const logText = safeRead(join(runDir, 'run', 'dispatch.log'));
  if (logText !== null) {
    const approvalLine = logText.split(/\r?\n/).find(l => l.includes('批准执行'));
    if (approvalLine) {
      problems.push(`run/dispatch.log 含「批准执行」行：plan-only 不能有执行批准（${approvalLine.trim().slice(0, 80)}）`);
    }
  }

  // ---------- 汇总 ----------
  if (problems.length) {
    console.log(`check-final · ${name}: plan-only 验收材料有 ${problems.length} 条缺项/不合法`);
    for (const p of problems) console.log(`- ${p}`);
    process.exit(1);
  }
  console.log(`check-final · ${name}: 全部通过（模式 plan-only；evidence/、verify/ 为空；无「批准执行」；指纹一致）`);
  process.exit(0);
}

// ---------- full：以下为原有四项规则，保持不变 ----------
// ---------- (a) 至少一份 verify/V{n}.md ----------
const verifyDir = join(runDir, 'verify');
const verifyFiles = (listDir(verifyDir) || [])
  .filter(f => /^V\d+\.md$/.test(f))
  .sort((a, b) => Number(a.slice(1, -3)) - Number(b.slice(1, -3)));
if (verifyFiles.length === 0) {
  problems.push('缺 verify/V{n}.md：verify/ 下至少要有一份 V1.md 这样的验收记录');
}

// ---------- plan.md：不可逆逐 Task 扫，不按档位 ----------
const planPath = join(runDir, 'plan.md');
const planBuf = safeBuf(planPath);
const planText = planBuf ? planBuf.toString('utf8') : null;
if (planText === null) problems.push('缺 plan.md：无法判定是否不可逆，也无法核对指纹');

let irreversible = false;
if (planText !== null) {
  // 按「### Task-N」切段，只看 Task 段，不把验收/风险里的说明当任务
  const taskSections = planText.split(/^### /m).filter(s => /^Task-\d+/.test(s));
  for (const section of taskSections) {
    const body = section.split(/^## /m)[0];
    if (/^是否不可逆\s*[:：]\s*是/m.test(body)) {
      irreversible = true;
      break;
    }
  }
}

// ---------- (c1) dispatch.log 首行档位，只认 短 / 普通 / 长 ----------
const logPath = [join(runDir, 'run', 'dispatch.log'), join(runDir, 'dispatch.log')].find(existsSync);
let tier = null;
if (!logPath) {
  problems.push('缺 run/dispatch.log：无法确认档位，无法判断验收归属是否合法');
} else {
  const logText = safeRead(logPath) || '';
  const firstLine = logText.split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith('#'));
  tier = firstLine?.match(/档位[:：]\s*(短|普通|长)(?=\s|\||$)/)?.[1] ?? null;
  if (!tier) {
    problems.push(`dispatch.log 首行读不到档位（只认 短 / 普通 / 长）：${firstLine ? firstLine.slice(0, 60) : '文件为空'}`);
  }
}

// ---------- (b) run/report.md：归属行 + 三个数字 + 引用 V{n}.md ----------
const reportPath = join(runDir, 'run', 'report.md');
const reportText = safeRead(reportPath);
let ownership = null;
if (reportText === null) {
  problems.push('缺 run/report.md：阶段 7 的报告还没生成');
} else {
  const lines = reportText.split(/\r?\n/).map(l => l.trim());
  const ownerLine = lines.find(l => /^验收归属\s*[:：]/.test(l));
  if (!ownerLine) {
    problems.push('run/report.md 缺「验收归属」行：必须整行写「验收归属: 自验」或「验收归属: 独立」');
  } else {
    const m = ownerLine.match(/^验收归属:\s*(自验|独立)\s*$/);
    if (!m) {
      problems.push(`run/report.md 的「验收归属」行不合法（占位未填或格式不对）：「${ownerLine.slice(0, 80)}」；必须整行写「验收归属: 自验」或「验收归属: 独立」`);
    } else {
      ownership = m[1];
    }
  }

  const missingNumbers = [];
  if (!/pass\s*\d+/.test(reportText)) missingNumbers.push('pass');
  if (!/fail\s*\d+/.test(reportText)) missingNumbers.push('fail');
  if (!/unresolved\s*\d+/.test(reportText)) missingNumbers.push('unresolved');
  if (missingNumbers.length) {
    problems.push(`run/report.md 缺数字：${missingNumbers.join(' / ')}（三个都要写，如「pass 0 / fail 0 / unresolved 0」）`);
  }

  const refs = [...reportText.matchAll(/\bV(\d+)\.md\b/g)].map(m => Number(m[1]));
  if (refs.length === 0) {
    problems.push('run/report.md 没有引用 verify/V{n}.md：报告要指出依据哪份验收记录');
  } else {
    const missing = [...new Set(refs)]
      .filter(n => !verifyFiles.includes(`V${n}.md`));
    if (missing.length) {
      problems.push(`run/report.md 引用了不存在的 ${missing.map(n => `V${n}.md`).join('、')}（verify/ 里没有）`);
    }
  }
}

// ---------- (c2) 归属规则：不可逆 / 普通 / 长 → 必须独立；短且无不可逆 → 两可 ----------
if (ownership) {
  if (irreversible && ownership === '自验') {
    problems.push('plan.md 里有 Task 写着「是否不可逆：是」，验收归属必须是「独立」，report 写的是「自验」');
  }
  if ((tier === '普通' || tier === '长') && ownership === '自验') {
    problems.push(`档位是「${tier}」，验收归属必须是「独立」，report 写的是「自验」`);
  }
}

// ---------- (d) fingerprint.txt 必须存在且与 plan.md 一致 ----------
const fpPath = join(runDir, 'run', 'fingerprint.txt');
const fpText = safeRead(fpPath);
const planSha = planBuf ? createHash('sha256').update(planBuf).digest('hex') : null;
if (fpText === null) {
  problems.push('缺 run/fingerprint.txt：等于未批准，不能进验收（不跳过）');
} else {
  const fpSha = fpText.match(/^sha256:\s*([0-9a-fA-F]{64})\s*$/m)?.[1]?.toLowerCase();
  if (!fpSha) {
    problems.push('run/fingerprint.txt 里没有合法的 sha256 行');
  } else if (planSha === null) {
    problems.push('无法比对指纹：plan.md 缺失');
  } else if (fpSha !== planSha) {
    problems.push(`run/fingerprint.txt 与 plan.md 的 sha256 不一致（记录 ${fpSha.slice(0, 12)}… ≠ 实际 ${planSha.slice(0, 12)}…）`);
  }
}

// ---------- 汇总 ----------
if (problems.length) {
  console.log(`check-final · ${name}: 验收材料有 ${problems.length} 条缺项/不合法`);
  for (const p of problems) console.log(`- ${p}`);
  process.exit(1);
}
const irrText = irreversible ? '；含不可逆 Task' : '';
console.log(`check-final · ${name}: 全部通过（verify ${verifyFiles.join(', ')}；归属 ${ownership}；档位 ${tier}${irrText}；指纹一致）`);
process.exit(0);
