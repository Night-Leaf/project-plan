// 把仓库装成 skill：复制 SKILL.md + 规则 + 脚本 + prompt + 模板到目标目录
// 用法：node scripts/pack-skill.mjs [目标目录]（默认 %DSH_HOME%\skills\project-plan）
import { cpSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const home = process.env.DSH_HOME;
if (!home && !process.argv[2]) {
  console.error('没找到 DSH_HOME。两种办法二选一：');
  console.error('  1) 设环境变量：DSH_HOME=<你的 DSH home>');
  console.error('  2) 直接给目标目录：node scripts/pack-skill.mjs <目标目录>');
  process.exit(2);
}
const target = process.argv[2] || join(home, 'skills', 'project-plan');

mkdirSync(target, { recursive: true });

const files = ['SKILL.md', 'README.md', 'plan-v3.md', 'flow.model.json'];
const dirs = ['scripts', 'prompts', 'templates', 'history'];

for (const f of files) {
  const src = join(root, f);
  if (!existsSync(src)) { console.error(`缺文件：${f}`); process.exit(1); }
  cpSync(src, join(target, f));
  console.log('copy', f);
}
for (const d of dirs) {
  const src = join(root, d);
  if (!existsSync(src)) { console.error(`缺目录：${d}`); process.exit(1); }
  const dst = join(target, d);
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, {
    recursive: true,
    filter: (p) => !/[\\/](node_modules|\.git|impl)([\\/]|$)/.test(p),
  });
  console.log('copy', d + '/', readdirSync(dst).length, '项');
}

const skillMd = join(target, 'SKILL.md');
if (!existsSync(skillMd)) { console.error('SKILL.md 没落地'); process.exit(1); }
console.log(`\n装好了：${target}`);
console.log('改完规则/模板后重跑本脚本同步；skill 目录本身是产物，不要直接改。');
