// 从 app.asar 里按路径后缀取文件（审查者证明了它解析得出，别再用"解不开"当理由）
// 用法：node asar-extract.mjs <asar> <输出目录> <后缀1> [后缀2 ...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const [asarPath, outDir, ...needles] = process.argv.slice(2);
if (!asarPath || !outDir || !needles.length) {
  console.error('用法: node asar-extract.mjs <asar> <输出目录> <路径后缀...>');
  process.exit(2);
}

const buf = readFileSync(asarPath);
// 头：[0]=4（magic） [4]=hdrSize [8]=hdrSize-4 [12]=jsonLen，JSON 从 16 开始，数据基址 = 8+hdrSize
const hdrSize = buf.readUInt32LE(4);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(16, 16 + jsonLen).toString('utf8'));
const base = 8 + hdrSize;

const out = [];
const walk = (node, prefix) => {
  for (const [name, val] of Object.entries(node.files ?? {})) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (val.files) walk(val, p);
    else if (val.link) out.push({ path: p, link: val.link });
    else out.push({ path: p, offset: Number(val.offset), size: val.size });
  }
};
walk(json, '');

mkdirSync(outDir, { recursive: true });
let n = 0;
for (const e of out) {
  if (!needles.some(s => e.path.endsWith(s))) continue;
  if (e.link) { console.log('skip link', e.path); continue; }
  const body = buf.subarray(base + e.offset, base + e.offset + e.size);
  const dest = join(outDir, e.path.replace(/[\\/]/g, '__'));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, body);
  console.log('取出', e.path, e.size, 'B →', dest);
  n++;
}
console.log(n ? `\n共 ${n} 个` : '没匹配到');
