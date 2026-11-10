// 拓扑检查：直接读 flow.model.json，不再内嵌一份表
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(readFileSync(resolve(here, '..', 'flow.model.json'), 'utf8'));

const byId = Object.fromEntries(model.states.map(s => [s.id, s]));
const out = Object.fromEntries(model.states.map(s => [s.id, []]));
for (const e of model.edges) out[e.from].push(e);

const problems = [];
for (const s of model.states) {
  if (!s.terminal && out[s.id].length === 0) problems.push(`[死路] ${s.id} 不是终态但没有出口`);
}
const reach = new Set(['0']); const q = ['0'];
while (q.length) { const c = q.shift(); for (const e of out[c]) if (!reach.has(e.to)) { reach.add(e.to); q.push(e.to); } }
for (const s of model.states) if (!reach.has(s.id)) problems.push(`[不可达] ${s.id} 从 0 走不到`);

let idx = 0; const index = {}, low = {}, on = {}, st = [], sccs = [];
const sc = v => {
  index[v] = low[v] = idx++; st.push(v); on[v] = true;
  for (const e of out[v]) {
    if (!(e.to in index)) { sc(e.to); low[v] = Math.min(low[v], low[e.to]); }
    else if (on[e.to]) low[v] = Math.min(low[v], index[e.to]);
  }
  if (low[v] === index[v]) { const c = []; let w; do { w = st.pop(); on[w] = false; c.push(w); } while (w !== v); sccs.push(c); }
};
for (const s of model.states) if (!(s.id in index)) sc(s.id);

for (const c of sccs) {
  const self = c.length === 1 && out[c[0]].some(e => e.to === c[0]);
  if (c.length === 1 && !self) continue;
  const set = new Set(c);
  const bounded = c.some(s => out[s].some(e => set.has(e.to) && (e.budget || e.to.startsWith('EXIT'))));
  if (!bounded) problems.push(`[死循环] 环 {${c.join(' → ')}} 上没有预算边或出口`);
}

const terms = model.states.filter(s => s.terminal).map(s => s.id);
if (!terms.some(t => reach.has(t))) problems.push('[无终态] 从 0 到不了任何终态');

console.log(`状态 ${model.states.length}，迁移 ${model.edges.length}，终态 ${terms.join(', ')}`);
console.log(problems.length ? '\n发现问题：\n' + problems.map(p => '  ' + p).join('\n') : '四项检查通过：每状态有出口、全部可达、环上有预算或出口、终态可达');
