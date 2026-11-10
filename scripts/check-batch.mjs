#!/usr/bin/env node
// 合批检查：Task 之间声明的涉及文件若相交，说明它们改同一批文件，应合成一个变更批
// 用法：node scripts/check-batch.mjs <plan.md>
// 退出码：0 无交集 / 1 有交集 / 2 计划解析不了（缺字段、占位、零路径）
import { readFileSync } from 'node:fs';

const planPath = process.argv[2];
if (!planPath) {
  console.error('用法: node scripts/check-batch.mjs <plan.md>');
  process.exit(2);
}

let plan;
try {
  plan = readFileSync(planPath, 'utf8');
} catch (e) {
  console.error(`读不到 ${planPath}：${e.message}`);
  process.exit(2);
}

const FIELD = /^\s*涉及文件（(?:将新建|将修改)）[：:]\s*(.*)$/;
const PLACEHOLDER = /^(?:…+|\.{3,}|<[^>]*>)$/;

const parsePaths = raw => {
  const paths = [];
  for (let item of raw.replace(/\\/g, '/').split(/[、,，]/)) {
    item = item.trim().replace(/`/g, '').trim();
    item = item.replace(/^\.\//, '');
    item = item.replace(/[（(][^（()）]*[)）]$/, '').trim();
    if (!item) continue;
    if (PLACEHOLDER.test(item) || /……|\.\.\./.test(item)) throw new Error(item);
    paths.push(item);
  }
  return paths;
};

const tasks = [];
for (const section of plan.split(/^###\s+/m).slice(1)) {
  const m = section.match(/^Task-(\d+)(?:\s|$)/);
  if (!m) continue;
  const task = { id: Number(m[1]), paths: new Set() };
  let fieldCount = 0;
  for (const line of section.split(/\r?\n/)) {
    const fm = line.match(FIELD);
    if (!fm) continue;
    fieldCount++;
    let items;
    try {
      items = parsePaths(fm[1]);
    } catch (bad) {
      console.error(`Task-${task.id} 的涉及文件里有占位：${bad.message}`);
      process.exit(2);
    }
    for (const p of items) task.paths.add(p);
  }
  if (!fieldCount) {
    console.error(`Task-${task.id} 解析不出涉及文件`);
    process.exit(2);
  }
  if (!task.paths.size) {
    console.error(`Task-${task.id} 解析出 0 个涉及文件`);
    process.exit(2);
  }
  tasks.push(task);
}

if (!tasks.length) {
  console.error('没找到任何 ### Task-N 段');
  process.exit(2);
}

const ordered = [...tasks].sort((a, b) => a.id - b.id);
let conflict = false;
for (let i = 0; i < ordered.length; i++) {
  for (let j = i + 1; j < ordered.length; j++) {
    const a = ordered[i], b = ordered[j];
    for (const file of a.paths) {
      if (b.paths.has(file)) {
        console.log(`Task-${a.id} 与 Task-${b.id} 都写 \`${file}\` → 应合批`);
        conflict = true;
      }
    }
  }
}

if (conflict) process.exit(1);
console.log('无交集，无需合批');
