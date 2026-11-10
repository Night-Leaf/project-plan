#!/usr/bin/env node
// 一屏打印一个 run 的状态：档位与部件 / 阶段与轮次 / 预算剩余 / reviews / verify /
// STATE 摘要 / 下一步 / 是否已批准。只读，缺文件不崩。
// 用法：node scripts/status.mjs <runDir>
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { readMode } from './mode.mjs';

const MAX_LINES = 60;

const arg = process.argv[2];
if (!arg) {
  console.error('用法: node scripts/status.mjs <runDir>');
  process.exit(2);
}
// 相对路径按当前工作目录解析（标准 CLI 行为）；绝对路径原样用。
const runDir = resolve(arg);

const safeRead = p => {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
};
const safeBuf = p => {
  try { return readFileSync(p); } catch { return null; }
};
const listDir = p => {
  try { return readdirSync(p).sort(); } catch { return null; }
};
const firstExisting = (...paths) => paths.find(p => existsSync(p)) || null;

// ---------- 读 dispatch.log：档位首行、轮次、VOID / 回炉 / 重开 / 批准 ----------
const logPath = firstExisting(join(runDir, 'run', 'dispatch.log'), join(runDir, 'dispatch.log'));
const logText = logPath ? safeRead(logPath) : null;
let firstLine = null;
const rounds = new Set();
const voided = new Set();
const reheatLines = [];
const reopenLines = [];
const approvalLines = [];

if (logText) {
  for (const raw of logText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (!firstLine) firstLine = line;

    const v = line.match(/^VOID\s+R(\d+)\b/i);
    if (v) { voided.add(Number(v[1])); continue; }
    if (/^回炉(?:\s|$|[|｜])/.test(line)) { reheatLines.push(line); continue; }
    if (/^重开(?:\s|$|[|｜])/.test(line)) { reopenLines.push(line); continue; }
    if (/^批准(?:\s|$)/.test(line)) { approvalLines.push(line); continue; }

    const r = line.match(/^R(\d+)\b/);
    if (r) rounds.add(Number(r[1]));
  }
}

const TIER_LIMIT = { 短: 1, 普通: 2, 长: 3 };
const tier = firstLine && firstLine.match(/档位[:：]\s*(短|普通|长)/)?.[1];
const usedRounds = [...rounds].filter(n => !voided.has(n)).sort((a, b) => a - b);
const currentRound = usedRounds.length ? usedRounds[usedRounds.length - 1] : null;
const voidRounds = [...voided].sort((a, b) => a - b);
const reviewLimit = tier ? TIER_LIMIT[tier] : null;

// ---------- verify / evidence：重开额度与阶段兜底 ----------
const verifyDir = join(runDir, 'verify');
const verifyFiles = (listDir(verifyDir) || [])
  .filter(f => /^V\d+\.md$/.test(f))
  .sort((a, b) => Number(a.slice(1, -3)) - Number(b.slice(1, -3)));

const evidenceDir = join(runDir, 'evidence');
const evidenceFiles = (listDir(evidenceDir) || []).filter(f => f.endsWith('.md'));
let attempts = 0;
for (const f of evidenceFiles) {
  const t = safeRead(join(evidenceDir, f));
  const n = Number(t?.match(/^attempt=(\d+)/m)?.[1] ?? 1);
  attempts += Math.max(0, n - 1);
}

const REOPEN_LIMIT = 2;
const reopenUsed = Math.max(0, verifyFiles.length - 1) + attempts;
const reheatUsed = reheatLines.length;
const reheatLimit = approvalLines.length; // 每次批准给 1 次回炉

// ---------- 批准：fingerprint.txt 与 plan.md 的 sha256 ----------
const planPath = join(runDir, 'plan.md');
const planBuf = safeBuf(planPath);
const fpPath = firstExisting(join(runDir, 'run', 'fingerprint.txt'), join(runDir, 'fingerprint.txt'));
const fpText = fpPath ? safeRead(fpPath) : null;
const fpSha = fpText && fpText.match(/^sha256:\s*([0-9a-fA-F]{64})/m)?.[1]?.toLowerCase();
const fpVersion = fpText && fpText.match(/^version:\s*(\S+)/m)?.[1];
const planSha = planBuf ? createHash('sha256').update(planBuf).digest('hex') : null;
const approved = Boolean(fpSha && planSha && fpSha === planSha);

let approvalText;
if (!fpText) approvalText = '未批准（fingerprint.txt 未生成）';
else if (!planBuf) approvalText = '未批准（plan.md 未生成，无法比对）';
else if (approved) approvalText = `已批准（${fpVersion || '版本未知'}，sha256 一致）`;
else approvalText = `未批准（sha256 失配：指纹 ${fpSha ? fpSha.slice(0, 12) : '无'} ≠ 计划 ${planSha.slice(0, 12)}）`;

// ---------- STATE.md：停在哪 / 为什么 / 下一步 ----------
const statePath = firstExisting(join(runDir, 'run', 'STATE.md'), join(runDir, 'STATE.md'));
const stateText = statePath ? safeRead(statePath) : null;
const stateFields = { stage: '', why: '', next: '' };
if (stateText) {
  for (const raw of stateText.split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(停在哪|为什么|下一步)(?:\*\*)?\s*[:：]\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/\*\*/g, '');
    if (!value) continue;
    if (m[1] === '停在哪') stateFields.stage = value;
    else if (m[1] === '为什么') stateFields.why = value;
    else stateFields.next = value;
  }
}

// ---------- reviews 清单 ----------
const reviewFiles = listDir(join(runDir, 'reviews'));
let reviewsText;
if (!reviewFiles || reviewFiles.length === 0) {
  reviewsText = '未生成';
} else {
  const groups = new Map();
  for (const f of reviewFiles) {
    const m = f.match(/^R(\d+)-(.+)\.(?:md|patch)$/);
    if (m) {
      const key = `R${m[1]}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m[2]);
    } else {
      if (!groups.has('其它')) groups.set('其它', []);
      groups.get('其它').push(f);
    }
  }
  const order = key => (key === '其它' ? Infinity : Number(key.slice(1)));
  const keys = [...groups.keys()].sort((a, b) => order(a) - order(b));
  const parts = keys.slice(0, 8).map(key => {
    const names = groups.get(key).sort();
    const tail = names.length > 10 ? ` …共 ${names.length} 份` : '';
    return `${key}: ${names.slice(0, 10).join(', ')}${tail}`;
  });
  if (keys.length > 8) parts.push(`…另有 ${keys.length - 8} 轮`);
  reviewsText = parts.join(' · ');
}

// ---------- verify 状态 ----------
let verifyText;
let vPass = 0, vFail = 0, vUnresolved = 0, vCounted = 0;
if (verifyFiles.length === 0) {
  verifyText = '未生成';
} else {
  let pass = 0, fail = 0, unresolved = 0, counted = 0;
  const items = verifyFiles.slice(0, 6).map(f => {
    const t = safeRead(join(verifyDir, f)) || '';
    const m = t.match(/pass\s+(\d+)\s*\/\s*fail\s+(\d+)\s*\/\s*unresolved\s+(\d+)/i);
    if (!m) return `${f}（未写汇总）`;
    pass += Number(m[1]); fail += Number(m[2]); unresolved += Number(m[3]); counted++;
    return `${f}（pass ${m[1]} / fail ${m[2]} / unresolved ${m[3]}）`;
  });
  if (verifyFiles.length > 6) items.push(`…另有 ${verifyFiles.length - 6} 份`);
  verifyText = items.join(' · ');
  if (counted) verifyText += ` · 合计 pass ${pass} / fail ${fail} / unresolved ${unresolved}`;
  vPass = pass; vFail = fail; vUnresolved = unresolved; vCounted = counted;
}

// ---------- 阶段：显式状态 > 目录存在性（兜底标「推断」） ----------
const eventDetail = line => {
  const parts = line.split(/[|｜]/).map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[1] : parts[0];
};
const lastReopen = reopenLines.length ? reopenLines[reopenLines.length - 1] : null;
const reopenTask = lastReopen && lastReopen.match(/Task-(\d+)/)?.[1];

const inferStage = () => {
  const reportExists = existsSync(join(runDir, 'run', 'report.md')) || existsSync(join(runDir, 'report.md'));
  if (reportExists) {
    return { stage: '阶段7 报告', why: 'run/report.md 存在', next: '阶段7 报告：核对 run/report.md 后重跑 check-final' };
  }
  if (verifyFiles.length) {
    let pass = 0, fail = 0, unresolved = 0;
    for (const f of verifyFiles) {
      const t = safeRead(join(verifyDir, f)) || '';
      const m = t.match(/pass\s+(\d+)\s*\/\s*fail\s+(\d+)\s*\/\s*unresolved\s+(\d+)/i);
      if (m) { pass += Number(m[1]); fail += Number(m[2]); unresolved += Number(m[3]); }
    }
    if (fail > 0) return { stage: '阶段6 验收', why: 'verify/ 有 fail', next: '阶段6 验收：按 fail 重开对应 Task' };
    if (unresolved > 0) return { stage: '阶段6 验收', why: 'verify/ 有 unresolved', next: '阶段6 验收：补证据后重判 unresolved' };
    if (pass > 0) return { stage: '阶段7 报告', why: 'verify/ 全 pass', next: '阶段7 报告：写 run/report.md（含 pass/fail/unresolved）' };
    return { stage: '阶段6 验收', why: 'verify/ 有文件但没写汇总', next: '阶段6 验收：补汇总或重判' };
  }
  if (evidenceFiles.length) {
    return { stage: '阶段5 执行', why: 'evidence/ 有文件', next: '阶段5 执行：继续未完成的 Task' };
  }
  if (fpText) {
    return { stage: '阶段5 执行', why: 'fingerprint.txt 存在', next: '阶段5 执行：从第一个未完成 Task 开始' };
  }
  if (reviewFiles && reviewFiles.some(f => /-answer\.md$/.test(f))) {
    return { stage: '阶段4 批准', why: 'reviews/ 有处置稿', next: `阶段4 批准：等用户说「批准 ${fpVersion || 'vN'}」` };
  }
  if (reviewFiles && reviewFiles.some(f => /-index\.md$/.test(f))) {
    return { stage: '阶段3.5 确认延后', why: 'reviews/ 有合并对照表', next: '阶段3.5 确认延后：收敛后进阶段4 批准' };
  }
  if (reviewFiles && reviewFiles.length) {
    return { stage: '阶段2 审查', why: 'reviews/ 有审查稿', next: '阶段3 合并处置：写合并对照表与处置稿' };
  }
  if (planBuf) {
    return { stage: '阶段2 审查', why: 'plan.md 存在', next: '阶段2 审查：按档位派审查者' };
  }
  if (existsSync(join(runDir, 'REQ.md'))) {
    return { stage: '阶段1 起草', why: 'REQ.md 存在', next: '阶段1 起草：产出 plan.md' };
  }
  return { stage: '阶段0 需求', why: '目录里还没有阶段产物', next: '阶段0 需求：起草 REQ.md' };
};

let stageText, stageMode, nextText;
const runReportExists = existsSync(join(runDir, 'run', 'report.md')) || existsSync(join(runDir, 'report.md'));
if (runReportExists) {
  if (vCounted && vFail === 0 && vUnresolved === 0 && vPass > 0) {
    stageText = 'DONE';
    stageMode = '显式：run/report.md 已生成，验收全 pass';
    nextText = 'DONE：交付完成，可归档';
  } else {
    stageText = '阶段7 报告';
    stageMode = '显式：run/report.md 存在';
    nextText = '阶段7 报告：核对 run/report.md；有 unresolved 先补证据，再重跑 check-final';
  }
} else if (stateFields.stage) {
  stageText = stateFields.stage;
  stageMode = '显式：STATE.md 停在哪';
} else if (lastReopen) {
  stageText = '阶段5 执行';
  stageMode = `显式：重开${reopenTask ? ` Task-${reopenTask}` : ''}`;
} else if (reheatLines.length) {
  stageText = '阶段2 审查';
  stageMode = '显式：dispatch.log 回炉行';
} else if (approvalLines.length && approved) {
  stageText = '阶段5 执行';
  stageMode = '显式：批准后待执行';
} else {
  const inferred = inferStage();
  stageText = inferred.stage;
  stageMode = `推断：${inferred.why}`;
  nextText = inferred.next;
}

if (!nextText) {
  if (stateFields.next) {
    nextText = stateFields.next;
  } else if (lastReopen) {
    const detail = eventDetail(lastReopen);
    nextText = /^重开/.test(detail) ? detail : `重开${reopenTask ? ` Task-${reopenTask}` : ''}：${detail}`;
  } else if (reheatLines.length) {
    nextText = `回炉重审：${eventDetail(reheatLines[reheatLines.length - 1])}`;
  } else if (approvalLines.length && approved) {
    nextText = '阶段5 执行：按 plan.md 逐个 Task 派执行者';
  } else {
    nextText = inferStage().next;
  }
}

// ---------- 汇总输出 ----------
const usedText = usedRounds.length ? usedRounds.map(n => `R${n}`).join(', ') : '无';
const voidText = voidRounds.length ? voidRounds.map(n => `R${n}`).join(', ') : '无';
const reheatText = reheatLimit === 0
  ? `回炉 ${reheatUsed} / 0（未批准，无回炉额度）`
  : `回炉 ${reheatUsed} / ${reheatLimit}（剩 ${Math.max(0, reheatLimit - reheatUsed)}）`;
const budgetText = tier
  ? `审查轮 ${usedRounds.length} / ${reviewLimit}（剩 ${Math.max(0, reviewLimit - usedRounds.length)}） · 重开 ${reopenUsed} / ${REOPEN_LIMIT}（剩 ${Math.max(0, REOPEN_LIMIT - reopenUsed)}） · ${reheatText}`
  : '未生成（dispatch.log 里没有「档位: 短|普通|长」）';

// ---------- run/mode：缺省 full；非法值带原值显示 ----------
const modeInfo = readMode(runDir);
const modeText = modeInfo.mode === 'invalid' ? `非法（${modeInfo.raw}）` : modeInfo.mode;

const lines = [
  `status · ${basename(runDir)}`,
  `① 档位与部件  ${firstLine || '未生成（无 dispatch.log）'}`,
  `② 阶段  ${stageText}（${stageMode}）`,
  `   轮次  当前 ${currentRound ? `R${currentRound}` : '无'} · 已用 ${usedText} · 作废 ${voidText}${reopenTask ? ` · 重开 Task-${reopenTask}` : ''}`,
  `③ 预算  ${budgetText}`,
  `④ reviews  ${reviewsText}`,
  `⑤ verify  ${verifyText}`,
  `⑥ STATE  ${stateText ? `停在哪：${stateFields.stage || '无'} / 为什么：${stateFields.why || '无'} / 下一步：${stateFields.next || '无'}` : '未生成（停在哪：无 / 为什么：无 / 下一步：无）'}`,
  `⑦ 下一步  ${nextText}`,
  `⑧ 批准  ${approvalText}`,
  `模式: ${modeText}`,
];

if (lines.length > MAX_LINES) {
  const cut = lines.slice(0, MAX_LINES - 1);
  cut.push(`…输出超过 ${MAX_LINES} 行，已截断`);
  console.log(cut.join('\n'));
} else {
  console.log(lines.join('\n'));
}
