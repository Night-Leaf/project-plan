// 目录没被动过？拿快照对一遍（REQ 写"不许改某个目录"时用它出证据）
// 用法：node check-untouched.mjs <目录> <快照文件>
//   快照生成：cd <目录> && find . -type f | sort | xargs sha256sum > snapshot.txt
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const [dir, snapPath] = process.argv.slice(2);
if (!dir || !snapPath) {
  console.error('用法: node check-untouched.mjs <目录> <快照文件>');
  process.exit(2);
}

const walk = (d, base = d) => {
  const out = [];
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, base));
    else if (st.isFile()) out.push(relative(base, p).replace(/\\/g, '/'));
  }
  return out;
};

const expected = new Map();
for (const line of readFileSync(snapPath, 'utf8').split('\n')) {
  const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/);
  if (m) expected.set(m[2].replace(/^\.\//, '').trim(), m[1]);
}

const now = new Map();
for (const rel of walk(dir)) {
  now.set(rel, createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex'));
}

const added = [...now.keys()].filter(f => !expected.has(f));
const removed = [...expected.keys()].filter(f => !now.has(f));
const changed = [...now.keys()].filter(f => expected.has(f) && expected.get(f) !== now.get(f));

console.log(`快照 ${expected.size} 个文件，现在 ${now.size} 个`);
for (const f of added) console.log('  新增  ' + f);
for (const f of removed) console.log('  删除  ' + f);
for (const f of changed) console.log('  改动  ' + f);

const bad = added.length + removed.length + changed.length;
console.log(bad ? `\n动了 ${bad} 处，与「不许改」不符。` : '\n一个字节都没动。');
process.exit(bad ? 1 : 0);
