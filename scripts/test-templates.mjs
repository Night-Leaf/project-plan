// 模板自测：把 templates/ 拼成一个最小 run，跑两个检查器，必须都是 exit 0
// 用法：node scripts/test-templates.mjs
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dir = mkdtempSync(join(tmpdir(), 'tpl-'));

try {
  mkdirSync(join(dir, 'run'));
  mkdirSync(join(dir, 'evidence'));
  mkdirSync(join(dir, 'verify'));
  copyFileSync(join(root, 'templates/plan.md'), join(dir, 'plan.md'));
  copyFileSync(join(root, 'templates/REQ.md'), join(dir, 'REQ.md'));
  copyFileSync(join(root, 'templates/dispatch.log'), join(dir, 'run/dispatch.log'));
  copyFileSync(join(root, 'templates/fingerprint.txt'), join(dir, 'run/fingerprint.txt'));
  copyFileSync(join(root, 'templates/decisions.md'), join(dir, 'run/decisions.md'));
  copyFileSync(join(root, 'templates/F-log.md'), join(dir, 'run/F-log.md'));
  copyFileSync(join(root, 'templates/evidence-Task.md'), join(dir, 'evidence/Task-1.md'));
  copyFileSync(join(root, 'templates/verify-V.md'), join(dir, 'verify/V1.md'));
  copyFileSync(join(root, 'templates/R-方向.md'), join(dir, 'reviews-R1-A.md'));
  copyFileSync(join(root, 'templates/R-index.md'), join(dir, 'reviews-R1-index.md'));
  copyFileSync(join(root, 'templates/R-answer.md'), join(dir, 'reviews-R1-answer.md'));
  copyFileSync(join(root, 'templates/report.md'), join(dir, 'run/report.md'));

  const runs = [
    ['check-plan', [join(root, 'scripts/check-plan.mjs'), join(dir, 'plan.md'), join(dir, 'REQ.md')]],
    ['budget-check', [join(root, 'scripts/budget-check.mjs'), dir]],
  ];
  let bad = 0;
  for (const [name, args] of runs) {
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const ok = r.status === 0 && !/错误\s+\[/.test(out);
    if (!ok) bad++;
    console.log(`${ok ? '通过' : '不过'}  ${name}（exit ${r.status}）`);
    for (const l of out.trim().split('\n').filter(l => /错误|提醒|超预算/.test(l))) console.log('   ' + l);
  }
  console.log(bad ? `\n${bad} 个检查器不过，模板有问题` : '\n模板能过检查器。');
  process.exit(bad ? 1 : 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
