// 改动面检查：一轮改了多少行 / 每条 F 摊到多少
// 用法：node check-diff.mjs <repoDir> <planRelPath> <answerPath> [阈值=15]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [repo, planRel, answerPath, thrArg] = process.argv.slice(2);
if (!repo || !planRel || !answerPath) {
  console.error('用法: node check-diff.mjs <repoDir> <planRelPath> <answerPath> [阈值]');
  process.exit(2);
}
const THRESHOLD = Number(thrArg || 15);
const git = args => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });

let numstat = '';
try { numstat = git(['diff', '--numstat', '--', planRel]); } catch { /* 无 git 或路径不在库内 */ }
let added = 0, deleted = 0;
for (const line of numstat.trim().split('\n').filter(Boolean)) {
  const [a, d] = line.split('\t');
  added += Number(a) || 0;
  deleted += Number(d) || 0;
}
const changed = added + deleted;

const answer = readFileSync(answerPath, 'utf8');
const fixedRows = answer.split('\n').filter(l => /^\|?\s*F-\d+\s*\|\s*fixed/i.test(l.trim()));
const fixed = fixedRows.length;

const perFix = fixed ? changed / fixed : changed;
const noBlast = fixedRows.filter(l => !/波及/.test(l)).length;
const lines = [
  `改动行数：+${added} / -${deleted}（合计 ${changed}）`,
  `fixed 条数：${fixed}`,
  fixed ? `平均每条 F 改 ${perFix.toFixed(1)} 行` : '（没找到 fixed 行，无法分摊）',
];
if (noBlast) lines.push(`提醒：${noBlast} 条 fixed 没写「波及」，修复复核没有范围可查。`);
const over = changed > 0 && perFix > THRESHOLD;

if (changed === 0) lines.push('提示：没检测到未提交的改动——要么没保存，要么已经提交过（用 git diff HEAD~1）。');
if (over) lines.push(`警告：平均每条超过 ${THRESHOLD} 行，改动面偏大。建议拆成多次小改，或确认这些改动确属同一条。`);

console.log(lines.join('\n'));
process.exit(over ? 1 : 0);
