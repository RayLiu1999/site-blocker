// stats.js — 統計資料讀寫（日期一律使用本地時間）

import { todayStr, localDateStr } from './utils.js';

const emptyDay = () => ({ blockedAttempts: {}, focusSessions: 0, focusMinutes: 0 });

// 讀取→修改→寫入依序執行，避免同時記錄多筆時互相覆蓋
let writeQueue = Promise.resolve();

function updateToday(mutate) {
  const run = writeQueue.then(async () => {
    const today = todayStr();
    const data = await chrome.storage.local.get('stats');
    const stats = data.stats?.daily ? data.stats : { daily: {} };
    stats.daily[today] = { ...emptyDay(), ...stats.daily[today] };
    mutate(stats.daily[today]);
    await chrome.storage.local.set({ stats });
  });
  writeQueue = run.catch(() => {});
  return run;
}

/**
 * 記錄一次封鎖事件
 * @param {string} domain
 */
export function recordBlockedAttempt(domain) {
  return updateToday(day => {
    day.blockedAttempts = { ...day.blockedAttempts, [domain]: (day.blockedAttempts?.[domain] || 0) + 1 };
  });
}

/**
 * 記錄一次專注 session 完成
 * @param {number} minutes
 */
export function recordFocusSession(minutes) {
  return updateToday(day => {
    day.focusSessions += 1;
    day.focusMinutes += minutes;
  });
}

/**
 * 取得過去 N 天的統計資料
 * @param {number} days
 * @returns {Promise<Array<{date: string, blockedTotal: number, focusSessions: number, focusMinutes: number, blockedByDomain: object}>>}
 */
export async function getStatsForDays(days) {
  const data = await chrome.storage.local.get('stats');
  const daily = data.stats?.daily || {};

  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = localDateStr(d);
    const entry = daily[dateStr] || emptyDay();

    const blockedTotal = Object.values(entry.blockedAttempts || {}).reduce((a, b) => a + b, 0);
    result.push({
      date: dateStr,
      blockedTotal,
      focusSessions: entry.focusSessions || 0,
      focusMinutes: entry.focusMinutes || 0,
      blockedByDomain: entry.blockedAttempts || {}
    });
  }
  return result;
}

/**
 * 取得今日統計摘要
 * @returns {Promise<{blockedTotal: number, focusSessions: number, focusMinutes: number}>}
 */
export async function getTodayStats() {
  const results = await getStatsForDays(1);
  return results[0];
}

/**
 * 清除所有統計資料
 */
export async function clearStats() {
  await chrome.storage.local.set({ stats: { daily: {} } });
}
