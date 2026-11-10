// 预算计数：只读磁盘上的记录，替主会话数轮，不让谁自己数自己
// 用法：node budget-check.mjs <runDir> [短|普通|长]
//   runDir 下认两种布局：run/dispatch.log 或 dispatch.log；verify/V{n}.md；evidence/*.md
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const runDir = process.argv[2];
let tier = process.argv[3];
if (!runDir) {
  console.error('用法: node budget-check.mjs <runDir> [短|普通|长]');
  process.exit(2);
}
const TIER_LIMIT = { 短: 1, 普通: 2, 长: 3 };
const REOPEN_LIMIT = 2;

const logPath = [join(runDir, 'run', 'dispatch.log'), join(runDir, 'dispatch.log')].find(existsSync);
if (!logPath) {
  console.error(`找不到 dispatch.log（找过 ${join(runDir, 'run', 'dispatch.log')} 和 ${join(runDir, 'dispatch.log')}）`);
  process.exit(2);
}
const log = readFileSync(logPath, 'utf8');

if (!tier) tier = log.match(/档位[:：]\s*(短|普通|长)/)?.[1];
if (!tier) {
  console.error('没给档位，log 里也没有「档位: 短|普通|长」这一行');
  process.exit(2);
}
if (!TIER_LIMIT[tier]) {
  console.error(`档位「${tier}」不认识，只能写 短 / 普通 / 长`);
  process.exit(2);
}

const rounds = new Set(), voided = new Set(), warnings = [];
let approvals = 0, reheat = 0;
for (const raw of log.split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const v = line.match(/^VOID\s+R(\d+)\b/i);
  if (v) { voided.add(+v[1]); continue; }
  // 事件行顶格写：批准 / 回炉。写在别的行中间的不算，只提醒
  if (/^档位[:：]|^出口/.test(line)) continue;
  if (/^批准(?:\s|$)/.test(line)) { approvals++; continue; }
  if (/^回炉(?:\s|$)/.test(line)) { reheat++; continue; }
  const m = line.match(/^R(\d+)\b/);
  if (m) { rounds.add(+m[1]); }
  else warnings.push(`这行没有轮号，不计入也不报错：${line.slice(0, 40)}`);
  if (/回炉|批准/.test(line)) warnings.push(`「${line.slice(0, 30)}」里的 回炉/批准 不是事件行（事件要顶格），没计入`);
}

const used = [...rounds].filter(n => !voided.has(n)).sort((a, b) => a - b);

// 重开：验收轮超出 1 的部分 + 执行重试（attempt 超出 1 的部分），共用一份 2 次
const verifyDir = join(runDir, 'verify');
const verifyFiles = existsSync(verifyDir) ? readdirSync(verifyDir).filter(f => /^V\d+\.md$/.test(f)) : [];
const evidenceDir = join(runDir, 'evidence');
let attempts = 0;
if (existsSync(evidenceDir)) {
  for (const f of readdirSync(evidenceDir).filter(f => f.endsWith('.md'))) {
    const t = readFileSync(join(evidenceDir, f), 'utf8');
    const a = +(t.match(/^attempt=(\d+)/m)?.[1] ?? 1);
    attempts += Math.max(0, a - 1);
  }
}
const reopenUsed = Math.max(0, verifyFiles.length - 1) + attempts;

const reopenLimit = REOPEN_LIMIT;
const out = [];
out.push(`档位 ${tier} → 审查轮上限 ${TIER_LIMIT[tier]}`);
const voidText = voided.size ? [...voided].sort((a, b) => a - b).join(', ') : '无';
out.push(`审查轮  ${used.length} / ${TIER_LIMIT[tier]}   （${used.length ? used.map(n => 'R' + n).join(', ') : '还没开始'}）`);
out.push(`重开    ${reopenUsed} / ${reopenLimit}   （验收 ${verifyFiles.length} 轮，执行重试 ${attempts} 次）`);
out.push(`回炉    ${reheat} / ${approvals}   （批准 ${approvals} 次，每次给 1 次）`);
out.push(`VOID    ${voidText}`);
for (const w of warnings) out.push(`  提醒  ${w}`);

const over = [];
if (used.length > TIER_LIMIT[tier]) over.push(`审查轮用完（${used.length} > ${TIER_LIMIT[tier]}）→ 只有三个出口：接管批准 / 改需求回阶段 0 / 终止`);
if (reopenUsed > reopenLimit) over.push(`重开用完（${reopenUsed} > ${reopenLimit}）→ 出口 C：停手报告`);
if (reheat > approvals) over.push(`回炉用完（${reheat} > ${Math.max(approvals, 1)}）→ 只能走出口 A`);

console.log(out.join('\n'));
if (over.length) {
  console.log('');
  for (const o of over) console.log('超预算  ' + o);
  process.exit(1);
}
console.log('\n都在额度内。这个数字来自磁盘，不是谁的记忆。');
