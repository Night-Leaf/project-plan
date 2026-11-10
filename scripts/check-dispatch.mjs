#!/usr/bin/env node
// 每轮派单回执校验：人数对档位、one-message、推理强度值域、VOID 原因。
// 只认审查轮：以 R{n} 开头，且行内含「审查」/「路」/「one-message」。
// 轮次上限 / 重开 / 回炉不归这里管，归 budget-check.mjs——本脚本只提示，不判。
// 用法：node scripts/check-dispatch.mjs <runDir> [短|普通|长]
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const argv = process.argv.slice(2);
const arg = argv[0];
let tier = argv[1];

if (!arg) {
  console.error('用法: node scripts/check-dispatch.mjs <runDir> [短|普通|长]');
  process.exit(2);
}
if (tier && !['短', '普通', '长'].includes(tier)) {
  console.error(`档位「${tier}」不认识，只能写 短 / 普通 / 长`);
  process.exit(2);
}

// 相对路径按仓库根解析，脚本放在哪都能跑；绝对路径原样用。
const runDir = isAbsolute(arg) ? arg : resolve(repoRoot, arg);
const logPath = [join(runDir, 'run', 'dispatch.log'), join(runDir, 'dispatch.log')].find(existsSync);

if (!logPath) {
  console.error(`找不到 dispatch.log（找过 ${join(runDir, 'run', 'dispatch.log')} 和 ${join(runDir, 'dispatch.log')}）`);
  process.exit(2);
}

let text;
try {
  text = readFileSync(logPath, 'utf8');
} catch (e) {
  console.error(`读不了 dispatch.log：${e.message}`);
  process.exit(2);
}

const meaningful = text
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

// 没给档位就读首行（跳过注释后的第一行）
if (!tier) {
  const first = meaningful[0];
  tier = first?.match(/档位[:：]\s*(短|普通|长)(?=\s|\||$)/)?.[1] ?? null;
  if (!tier) {
    console.error(`没给档位，dispatch.log 首行也读不到「档位: 短|普通|长」：${first ? first.slice(0, 60) : '文件为空'}`);
    process.exit(2);
  }
}

// 档位 → 审查人数区间（短 3 / 普通 4 / 长 5~6）
const LIMIT = { 短: [3, 3], 普通: [4, 4], 长: [5, 6] };
const [minHead, maxHead] = LIMIT[tier];

const problems = [];
const voided = new Set();
const reviewRounds = new Map(); // 轮号 → 该轮的审查行

for (const line of meaningful) {
  const v = line.match(/^VOID\s+R(\d+)\b/i);
  if (v) {
    const n = Number(v[1]);
    voided.add(n);
    const reason = line.slice(v[0].length).replace(/^[\s|丨:：,，-]+/, '').trim();
    if (!reason) problems.push(`VOID R${n} 缺原因：VOID 行必须在轮号后写清作废原因`);
    continue;
  }
  const m = line.match(/^R(\d+)\b/);
  if (!m) continue; // 非轮次行（备注等）不参与人数统计
  if (!/审查|路|one-message/.test(line)) continue; // 起草 / 合并 / 执行 / 批准行不校验
  const n = Number(m[1]);
  if (!reviewRounds.has(n)) reviewRounds.set(n, []);
  reviewRounds.get(n).push(line);
}

// 「第几个 R」按审查轮在 log 里出现的先后编号（含被 VOID 的轮，位置不跳号）
const order = [...reviewRounds.keys()].sort((a, b) => a - b);

for (const n of order) {
  if (voided.has(n)) continue; // 被 VOID 的轮整轮跳过
  const lines = reviewRounds.get(n);
  const tag = `第 ${order.indexOf(n) + 1} 个 R（R${n}）`;

  const heads = [...lines.join('\n').matchAll(/(\d+)\s*路/g)].map(m => Number(m[1]));
  if (!heads.length) {
    problems.push(`${tag} 缺人数：行内没有「N 路」，无法核对档位「${tier}」`);
  } else {
    const head = Math.max(...heads);
    const ok = head >= minHead && head <= maxHead;
    if (!ok) {
      const need = minHead === maxHead ? `${minHead}` : `${minHead}~${maxHead}`;
      problems.push(`${tag} 人数不符：写的是 ${head} 路，档位「${tier}」要求 ${need} 路`);
    }
  }

  if (!lines.some(l => /one-message/.test(l))) {
    problems.push(`${tag} 缺 one-message：同一轮 N 个审查者要在一条消息里派完`);
  }

  const strengths = [];
  for (const l of lines) {
    for (const m of l.matchAll(/\b(?:reasoning|effort)\s*=\s*([^\s|]+)/g)) strengths.push(m[1]);
  }
  if (!strengths.length) {
    problems.push(`${tag} 缺推理强度：要写 reasoning=low|high 或 effort=low|high`);
  } else {
    const bad = strengths.filter(s => s !== 'low' && s !== 'high');
    if (bad.length) {
      problems.push(`${tag} 推理强度越界：${bad.join(', ')}，只能是 low 或 high`);
    }
  }
}

const name = basename(runDir);
const usedList = order.filter(n => !voided.has(n)).map(n => `R${n}`);
const voidList = [...voided].sort((a, b) => a - b).map(n => `R${n}`);
const voidText = voidList.length ? `；已 VOID ${voidList.join(', ')}` : '';

if (problems.length) {
  console.log(`check-dispatch · ${name}: 档位 ${tier}，审查回执有 ${problems.length} 条缺项/不合法`);
  for (const p of problems) console.log(`- ${p}`);
  console.log('轮次/重开/回炉归 budget-check.mjs');
  process.exit(1);
}

console.log(`check-dispatch · ${name}: 全部通过（档位 ${tier}；审查轮 ${usedList.length ? usedList.join(', ') : '无'}${voidText}）`);
console.log('轮次/重开/回炉归 budget-check.mjs');
process.exit(0);
