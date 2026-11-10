#!/usr/bin/env node
// 共享的 run/mode 解析：status.mjs 读它，check-final.mjs（Task-3）也读它。
// 文件位置固定为 <runDir>/run/mode。
//
// 返回形状（固定）：
//   { mode: 'full' | 'plan-only' | 'invalid', raw: string | null }
//   - run/mode 缺失            → { mode: 'full', raw: null }
//   - 合法值                   → { mode, raw }（raw 为去 BOM、去 \r、trim 后的原文，保留大小写）
//   - 空文件 / 全空白          → { mode: 'invalid', raw: '' }
//   - 未知值                   → { mode: 'invalid', raw: '未知原值' }
//
// 归一化：去 BOM、去 \r、trim、转小写；只有 'plan-only' 与 'full' 合法。
// 非法值（空、全空白、未知）一律 mode='invalid'，绝不回落 'full'。
//
// 用法：import { readMode } from './mode.mjs'; const { mode, raw } = readMode(runDir);
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MODE_FULL = 'full';
export const MODE_PLAN_ONLY = 'plan-only';
export const MODE_INVALID = 'invalid';

const VALID = new Set([MODE_FULL, MODE_PLAN_ONLY]);

export const readMode = runDir => {
  let text;
  try {
    text = readFileSync(join(runDir, 'run', 'mode'), 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return { mode: MODE_FULL, raw: null };
    throw err;
  }
  const raw = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  const normalized = raw.toLowerCase();
  if (VALID.has(normalized)) return { mode: normalized, raw };
  return { mode: MODE_INVALID, raw };
};
