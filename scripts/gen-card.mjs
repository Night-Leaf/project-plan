// 从 flow.model.json 生成一页操作卡
// 用法：node gen-card.mjs <输出.md>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(readFileSync(resolve(here, '..', 'flow.model.json'), 'utf8'));
const target = process.argv[2];
if (!target) { console.error('用法: node gen-card.mjs <输出.md>'); process.exit(2); }

const phases = model.states.filter(s => s.steps);
const L = [];
L.push('# 计划审查与执行流程 · 操作卡');
L.push('');
L.push('> 由 `flow.model.json` 生成。常规路径照这张走；出事翻完整版。');
L.push('');
L.push('## 九步');
L.push('');
L.push('| 步 | 干什么 | 产出 | 出局条件 |');
L.push('|---|---|---|---|');
for (const s of phases) {
  L.push(`| ${s.id} | ${s.name} | ${s.produces} | ${s.exit.split('。')[0]}。 |`);
}
L.push('');
L.push(`## ${model.card.rules.length} 条铁律`);
L.push('');
for (const r of model.card.rules) L.push(`- ${r}`);
L.push('');
L.push('## 两个数字');
L.push('');
for (const n of model.card.numbers) L.push(`- ${n}`);
L.push('');
L.push('## 五个出口');
L.push('');
for (const e of model.card.exits) L.push(`- ${e}`);
L.push('');
L.push(`> 生成于 ${new Date().toISOString().slice(0, 10)}；改流程请改 \`flow.model.json\`，重跑 \`node gen-card.mjs <输出.md>\`。`);

writeFileSync(target, L.join('\n') + '\n');
console.log(`操作卡已生成 → ${target}`);
