// 守卫可达性检查：拓扑之外，还看"条件永远不成立"的死锁
// 变量 d = 存在未确认的 deferred（true 时收敛判据不成立）
// 旧版（r2）：确认发生在阶段 4，而阶段 4 要求收敛 → 只要出现 deferred 就卡死

function reachQuery({ edges, start, target, flagClear }) {
  const seen = new Set();
  const q = [start];
  seen.add(start);
  while (q.length) {
    const [s, d] = q.shift();
    if (s === target) return true;
    for (const e of edges) {
      if (e.from !== s) continue;
      if (e.guard && !e.guard(d)) continue;
      const nd = e.clearFlag ? false : (e.setFlag ? true : d);
      const key = nd ? 'T' : 'F';
      const id = `${e.to}|${key}`;
      // 记录新状态
      if (!seen.has(id)) { seen.add(id); q.push([e.to, nd]); }
    }
    // 未访问节点也要算，按 flag 区分
  }
  return false;
}

const OLD = {
  name: '旧版 r2（确认在阶段 4）',
  edges: [
    { from: '0', to: '1' }, { from: '1', to: '2' }, { from: '2', to: '3' },
    { from: '3', to: '4', guard: d => !d },      // 收敛：不许有 open F
    { from: '3', to: '2' },                       // n+1 回炉
    { from: '4', to: '5', clearFlag: true },      // 批准时才确认 deferred
    { from: '4', to: '3' }, { from: '5', to: '6' }, { from: '6', to: '7' },
  ],
};

const NEW = {
  name: '新版 r3（确认在阶段 3.5）',
  edges: [
    { from: '0', to: '1' }, { from: '1', to: '2' }, { from: '2', to: '3' },
    { from: '3', to: '3.5' },
    { from: '3.5', to: '4', guard: d => !d },
    { from: '3.5', to: '2' },
    { from: '3.5', to: '3.5', clearFlag: true },  // 用户逐项确认 → d 清零
    { from: '4', to: '5' }, { from: '5', to: '6' }, { from: '6', to: '7' },
  ],
};

for (const model of [OLD, NEW]) {
  // 从"阶段 3 且存在未确认 deferred"出发，能否到阶段 4
  const ok = reachQuery({ edges: model.edges, start: ['3', true], target: '4' });
  console.log(`${model.name}：从 (阶段3, 有未确认 deferred) 到阶段 4 → ${ok ? '可达' : '不可达（死锁）'}`);
}
