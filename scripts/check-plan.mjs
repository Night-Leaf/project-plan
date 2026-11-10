// 计划机械检查：编号、覆盖、字段、命令、路径冲突
// 用法：node check-plan.mjs <plan.md> [REQ.md]
import { readFileSync } from 'node:fs';

const planPath = process.argv[2];
const reqPath = process.argv[3];
if (!planPath) { console.error('用法: node check-plan.mjs <plan.md> [REQ.md]'); process.exit(2); }
const plan = readFileSync(planPath, 'utf8');

const sections = plan.split(/^### /m).slice(1);
const tasks = [], vcs = [];
for (const s of sections) {
  const mTask = s.match(/^Task-(\d+)\s+(.*)/);
  const mVC = s.match(/^VC-(\d+)\s+(.*)/);
  if (mTask) tasks.push({ id: +mTask[1], title: mTask[2], body: s });
  else if (mVC) vcs.push({ id: +mVC[1], title: mVC[2], body: s });
}

const problems = [], warns = [];
const has = (body, key) => new RegExp(key + '[（(：:]').test(body);

const checkSeq = (arr, label) => {
  const ids = arr.map(x => x.id).sort((a, b) => a - b);
  for (let i = 0; i < ids.length; i++) if (ids[i] !== i + 1) problems.push(`[编号] ${label} 不连续：缺 ${i + 1}`);
  if (ids.length !== new Set(ids).size) problems.push(`[编号] ${label} 有重复`);
};
checkSeq(tasks, 'Task');
checkSeq(vcs, 'VC');

for (const t of tasks) for (const k of ['做什么', '涉及文件', '是否不可逆', '完成标志']) if (!has(t.body, k)) problems.push(`[字段] Task-${t.id} 缺「${k}」`);
for (const v of vcs) for (const k of ['判据', '证据命令', '命令类型', '由谁产出证据', '覆盖']) if (!has(v.body, k)) problems.push(`[字段] VC-${v.id} 缺「${k}」`);

const taskIds = new Set(tasks.map(t => t.id));
const covered = new Set();
for (const v of vcs) {
  const m = v.body.match(/覆盖[：:]([^\n]+)/);
  if (!m) continue;
  const refs = [...m[1].matchAll(/Task-(\d+)/g)].map(x => +x[1]);
  if (!refs.length) problems.push(`[覆盖] VC-${v.id} 没写覆盖哪个 Task`);
  for (const r of refs) {
    if (!taskIds.has(r)) problems.push(`[覆盖] VC-${v.id} 指向不存在的 Task-${r}`);
    covered.add(r);
  }
}
for (const t of tasks) if (!covered.has(t.id)) problems.push(`[覆盖] Task-${t.id} 没有任何 VC 覆盖`);

const regLine = plan.match(/脚本登记表[^\n]*/);
const registry = new Set();
if (regLine) for (const m of regLine[0].matchAll(/`([a-z][a-z0-9:_-]*)`/g)) registry.add(m[1]);
const usedPnpm = new Set(), execPnpm = new Set();
for (const v of vcs) for (const m of v.body.matchAll(/pnpm\s+([a-z][a-z0-9:_-]*)/g)) {
  if (m[1] === 'exec') execPnpm.add(v.id); else usedPnpm.add(m[1]);
}
const BUILTIN = new Set(['install', 'exec', 'run', 'add', 'remove', 'dlx', 'why', 'update', 'list']);
if (registry.size) for (const c of usedPnpm) if (!registry.has(c) && !BUILTIN.has(c)) problems.push(`[命令] pnpm ${c} 不在脚本登记表里`);
if (execPnpm.size) warns.push(`[命令] VC ${[...execPnpm].join(',')} 用了 pnpm exec，绕过脚本登记表，check:scripts 会误报`);

if (/只由\s*`?DB_PATH`?/.test(plan)) {
  const dbFlag = vcs.filter(v => /--db\b/.test(v.body)).map(v => v.id);
  if (dbFlag.length) problems.push(`[冲突] 计划声明库位置只由 DB_PATH 决定，但 VC ${dbFlag.join(',')} 用了 --db`);
}

const stems = new Map();
for (const v of vcs) for (const m of v.body.matchAll(/out\/([a-z0-9_-]+)\.(md|json)/g)) {
  if (!stems.has(m[1])) stems.set(m[1], new Set());
  stems.get(m[1]).add(m[2]);
}
for (const [k, exts] of stems) if (exts.size > 1) warns.push(`[路径] out/${k}.{md,json} 两种扩展名都被引用，检查产出/读取是否对得上`);

const noFail = vcs.filter(v => !/怎么才会失败|失败条件/.test(v.body)).map(v => v.id);
if (noFail.length) warns.push(`[新规] VC ${noFail.join(',')} 没写「怎么才会失败」`);

// 判据里的模糊词：验收时判不了（"含产品名"这种，验收者只能猜）
const VAGUE = ['产品名', '合理', '正常', '差不多', '大概', '良好', '顺畅', '基本', '适当', '若干', '友好', '简洁'];
for (const v of vcs) {
  const m = v.body.match(/判据[：:]([^\n]*)/);
  if (!m) continue;
  const hit = VAGUE.filter(w => m[1].includes(w));
  if (hit.length) warns.push(`[判据] VC-${v.id} 判据里有「${hit.join('、')}」这类没定义的词——验收时指不到具体东西，改成能指的字符串或产物`);
}

if (reqPath) {
  const req = readFileSync(reqPath, 'utf8');
  const reqIds = new Set([...req.matchAll(/^### (REQ-\d+)/gm)].map(m => m[1]));
  const cut = new Set();
  const m13 = plan.match(/###\s*1\.3[^\n]*\n([\s\S]*?)(?=\n###\s|\n##\s|$)/);
  const notDoBlock = m13 ? m13[1] : '';
  for (const r of notDoBlock.matchAll(/REQ-\d+/g)) cut.add(r[0]);
  const traced = new Set();
  for (const t of tasks) {
    const m = t.body.match(/追溯[：:]([^\n]+)/);
    if (!m) { warns.push(`[追溯] Task-${t.id} 没写追溯`); continue; }
    for (const r of m[1].matchAll(/REQ-\d+/g)) {
      traced.add(r[0]);
      if (!reqIds.has(r[0])) problems.push(`[追溯] Task-${t.id} 引用了不存在的 ${r[0]}`);
    }
  }
  const missing = [...reqIds].filter(r => !traced.has(r) && !cut.has(r));
  if (missing.length) warns.push(`[追溯] 未被任何 Task 追溯、也没写进"不做"的 REQ：${missing.join(', ')}`);

  // 确认记录：不要求用户逐条打勾，但必须写清是"怎么确认的"
  const mWay = req.match(/^确认方式[:：]\s*(.*)$/m);
  if (!mWay) problems.push('[需求] REQ.md 缺「确认方式:」——逐条勾的、还是一次回话，得写明');
  else if (!/逐条|一次回话/.test(mWay[1])) problems.push(`[需求] 确认方式「${mWay[1].trim()}」只能是「逐条」或「一次回话」`);
  if (mWay && /一次回话/.test(mWay[1]) && !/^确认原话[:：]/m.test(req)) warns.push('[需求] 一次回话确认，却没写「确认原话:」——用户那句话照抄一份，别只写"已确认"');
  const mAsk = req.match(/^##\s*需要你定[^\n]*$/m);
  let askText = '';
  if (mAsk) {
    const after = req.slice(mAsk.index + mAsk[0].length);
    const nxt = after.search(/^##\s/m);
    askText = nxt >= 0 ? after.slice(0, nxt) : after;
  }
  // 只认「列表项」里的编号：整段话里提一句不算，那是绕开检查用的
  const askItems = askText.split('\n').filter(l => /^\s*(?:\d+\.|[-*])\s/.test(l)).join('\n');
  const askIds = new Set([...askItems.matchAll(/REQ-\d+/g)].map(m => m[0]));
  for (const id of askIds) if (!reqIds.has(id)) problems.push(`[需求] 「需要你定」列了不存在的 ${id}`);
  // 硬规矩：原文自认「尚未确定」的，一条都不许漏（不设条数上下限，只查漏）
  const openIds = [...req.matchAll(/^### (OPEN-\d+)/gm)].map(m => m[1]);
  for (const id of openIds) {
    const at = req.indexOf('### ' + id);
    const rest = req.slice(at + 4 + id.length);
    const end = rest.search(/\n### |\n## /);
    const blk = end >= 0 ? rest.slice(0, end) : rest;
    if (/结论[:：]|已收[:：]/.test(blk)) continue;
    if (!askItems.includes(id)) problems.push(`[需求] ${id} 是原文写明「尚未确定」的，没作为一条列进「需要你定」——这条得用户拍板才能往下写`);
  }
  if (mAsk && !/REQ-\d+|OPEN-\d+/.test(askText)) warns.push('[需求] 「需要你定」是空的——确认一下真没有挡路的，别是为了省事');
  const confirmed = /^状态[:：]\s*confirmed/m.test(req);
  const noSrc = [];
  for (const s of req.split(/^### /m).slice(1)) {
    const id = (s.match(/^(REQ-\d+)/) || [])[1];
    if (!id) continue;
    const m = s.match(/^确认[:：]\s*(.*)$/m);
    if (!m) problems.push(`[需求] ${id} 没有「确认:」行`);
    else if (!m[1].trim()) {
      if (confirmed) problems.push(`[需求] ${id} 的「确认:」是空的——没确认就写 confirmed，等于自己批自己`);
      else warns.push(`[需求] ${id} 还没标确认（状态不是 confirmed，允许先空着）`);
    }
    const src = s.match(/^判据来源[:：]\s*(.*)$/m);
    if (!src) noSrc.push(id);
    else if (/推断/.test(src[1]) && !askIds.has(id)) warns.push(`[需求] ${id} 判据是推断，却没进「需要你定」——若它挡路，得用户点头`);
    if (m && /默认/.test(m[1]) && !/原文（L\d/.test(s)) warns.push(`[需求] ${id} 是默认确认，但没逐字引用「原文（L…）」——默认的前提是原话在`);
  }
  if (noSrc.length) warns.push(`[需求] 这些条没标「判据来源: 原文直述 / 推断」，无从判断哪几条要用户点头：${noSrc.join(', ')}`);
}

console.log(`Task ${tasks.length} 个，VC ${vcs.length} 条，脚本登记 ${registry.size} 个`);
for (const p of problems) console.log('  错误  ' + p);
for (const w of warns) console.log('  提醒  ' + w);
console.log(problems.length ? `\n共 ${problems.length} 个错误、${warns.length} 条提醒` : `\n无错误，${warns.length} 条提醒`);
process.exit(problems.length ? 1 : 0);
