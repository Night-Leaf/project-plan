// 合并表对账：表头写的数字与表里行数对不对得上；index 与 answer 的 F 号是否双向齐
// 用法：node check-index.mjs <R{n}-index.md> [R{n}-answer.md]
import { readFileSync } from 'node:fs';

const idxPath = process.argv[2];
const ansPath = process.argv[3];
if (!idxPath) { console.error('用法: node check-index.mjs <R{n}-index.md> [R{n}-answer.md]'); process.exit(2); }

const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const num = (s) => (/^\d+$/.test(s) ? +s : CN[s] ?? NaN);

const idx = readFileSync(idxPath, 'utf8');
const problems = [], warns = [];
const rowLines = idx.split('\n').filter(l => /^\|?\s*F-\d+\s*\|/.test(l));
const rows = rowLines;
const p1Rows = rows.filter(l => /^\|?\s*F-\d+\s*\|\s*P1\s*\|/.test(l));
const ids = rows.map(l => l.match(/^\|?\s*(F-\d+)\s*\|/)[1]);
// 来源列里的本地号（A-1 / B-2 / X1-3）去重后应等于「原始 N 条」
const localIds = new Set(), localDup = [];
for (const l of rows) {
  const cells = l.replace(/^\|/, '').split('|').map(s => s.trim());
  const src = cells[2] ?? '';
  for (const m of src.matchAll(/\b([A-Z]\d*-\d+)\b/g)) {
    if (localIds.has(m[1])) localDup.push(m[1]);
    localIds.add(m[1]);
  }
}

const mOrig = idx.match(/原始\s*([0-9一二三四五六七八九十]+)\s*条/);
const mDedup = idx.match(/去重后\s*([0-9一二三四五六七八九十]+)\s*条/);
const mP1 = idx.match(/P1\s*([0-9一二三四五六七八九十]+)\s*条/);

if (mOrig && num(mOrig[1]) !== localIds.size) {
  problems.push(`[对账] 表头说原始 ${mOrig[1]} 条，表里只能数到 ${localIds.size} 个本地号（有条目掉了）`);
}
if (mDedup && num(mDedup[1]) !== rows.length) problems.push(`[对账] 表头说去重后 ${mDedup[1]} 条，表里有 ${rows.length} 行`);
if (mP1 && num(mP1[1]) !== p1Rows.length) problems.push(`[对账] 表头说 P1 ${mP1[1]} 条，表里有 ${p1Rows.length} 行 P1`);
if (!mDedup) warns.push('[对账] 表头没写「去重后 N 条」，没法核对');
if (!mP1) warns.push('[对账] 表头没写「P1 N 条」，没法核对');

const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dup.length) problems.push(`[对账] 同一号出现多次：${[...new Set(dup)].join(', ')}`);
if (localDup.length) warns.push(`[对账] 同一个本地号落在两条 F 上：${[...new Set(localDup)].join(', ')}——若是故意拆开，在「为什么算同一条」里写一句；否则是重复计数`);

if (ansPath) {
  const ans = readFileSync(ansPath, 'utf8');
  const ansRows = ans.split('\n').filter(l => /^\|?\s*F-\d+\s*\|/.test(l));
  const ansIds = ansRows.map(l => l.match(/^\|?\s*(F-\d+)\s*\|/)[1]);
  const missing = ids.filter(x => !ansIds.includes(x));
  const extra = ansIds.filter(x => !ids.includes(x));
  if (missing.length) problems.push(`[对账] index 有、answer 没有结局的：${missing.join(', ')}`);
  if (extra.length) problems.push(`[对账] answer 有、index 里没出现过的：${extra.join(', ')}`);
  for (const l of ansRows) {
    const cells = l.replace(/^\|/, '').split('|').map(s => s.trim());
    const outcome = cells[1] ?? '';
    if (!/fixed|repair claimed — still reported|deferred|unresolved/.test(outcome)) {
      problems.push(`[结局] ${cells[0]} 的结局「${outcome}」不在四选一里`);
    }
    if (/^fixed$/.test(outcome) && cells.slice(2, 5).some(c => !c)) {
      problems.push(`[结局] ${cells[0]} 是 fixed，但「改在哪 / 怎么改 / 波及几处」有空栏`);
    }
  }
}

console.log(`表里 ${rows.length} 条，P1 ${p1Rows.length} 条`);
for (const p of problems) console.log('  错误  ' + p);
for (const w of warns) console.log('  提醒  ' + w);
console.log(problems.length ? `\n共 ${problems.length} 个错误` : '\n对得上。');
process.exit(problems.length ? 1 : 0);
