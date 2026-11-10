// 从 flow.model.json 生成文档的「流程」整节（状态表 + 图 + 每个阶段的步骤）
// 用法：node gen-flow.mjs <目标.md>
// 只替换 <!-- FLOW:BEGIN --> 与 <!-- FLOW:END --> 之间的内容

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(readFileSync(resolve(here, '..', 'flow.model.json'), 'utf8'));
const target = process.argv[2];
if (!target) { console.error('用法: node gen-flow.mjs <目标.md>'); process.exit(2); }

const out = [];
const phases = model.states.filter(s => s.steps);

out.push('### 阶段总表（生成，勿手改）');
out.push('');
out.push('| 状态 | 名称 | 产出 | 能去哪 |');
out.push('|---|---|---|---|');
for (const s of model.states) {
  const outs = model.edges.filter(e => e.from === s.id);
  const to = outs.length ? outs.map(e => `\`${e.to}\``).join(' / ') : '—（终态）';
  out.push(`| \`${s.id}\` | ${s.name} | ${s.produces} | ${to} |`);
}

out.push('');
out.push('```mermaid');
out.push('flowchart LR');
for (const e of model.edges) {
  const label = e.budget ? `${e.on}〔计${e.budget}〕` : e.on;
  out.push(`  s${e.from.replace('.', '_')} -->|${label}| s${e.to.replace('.', '_')}`);
}
out.push('```');

for (const s of phases) {
  out.push('');
  out.push(`**阶段 ${s.id} ${s.name}**　${s.who}`);
  out.push('');
  if (s.produces && s.produces !== '—') out.push(`产出：${s.produces}`);
  out.push('');
  for (const step of s.steps) out.push(`- ${step}`);
  for (const n of (s.notes || [])) out.push(`- ${n}`);
  out.push('');
  out.push(`退出：${s.exit}`);
}

out.push('');
out.push(`> 生成于 ${new Date().toISOString().slice(0, 10)}。改流程请改 \`flow.model.json\` 后重跑 \`node gen-flow.mjs <目标.md>\`，不要手改本节。`);

const md = readFileSync(target, 'utf8');
const BEGIN = '<!-- FLOW:BEGIN -->';
const END = '<!-- FLOW:END -->';
const a = md.indexOf(BEGIN), b = md.indexOf(END);
if (a < 0 || b < 0) { console.error('目标文件缺少 FLOW:BEGIN / FLOW:END 标记'); process.exit(2); }
const next = md.slice(0, a + BEGIN.length) + '\n\n' + out.join('\n') + '\n\n' + md.slice(b);
writeFileSync(target, next);
console.log(`已生成 ${model.states.length} 个状态、${model.edges.length} 条迁移、${phases.length} 个阶段 → ${target}`);
