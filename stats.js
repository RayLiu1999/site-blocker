// stats.js — 統計資料讀寫

import { todayStr } from './utils.js';

/**
 * 記錄一次封鎖事件
 * @param {string} domain
 */
export async function recordBlockedAttempt(domain) {
  const today = todayStr();
  const data = await chrome.storage.local.get('stats');
  const stats = data.stats || { daily: {} };

  if (!stats.daily[today]) {
    stats.daily[today] = { blockedAttempts: {}, focusSessions: 0, focusMinutes: 0 };
  }

  const attempts = stats.daily[today].blockedAttempts;
  attempts[domain] = (attempts[domain] || 0) + 1;

  await chrome.storage.local.set({ stats });
}

/**
 * 記錄一次專注 session 完成
 * @param {number} minutes
 */
export async function recordFocusSession(minutes) {
  const today = todayStr();
  const data = await chrome.storage.local.get('stats');
  const stats = data.stats || { daily: {} };

  if (!stats.daily[today]) {
    stats.daily[today] = { blockedAttempts: {}, focusSessions: 0, focusMinutes: 0 };
  }

  stats.daily[today].focusSessions += 1;
  stats.daily[today].focusMinutes += minutes;

  await chrome.storage.local.set({ stats });
}

/**
 * 取得過去 N 天的統計資料
 * @param {number} days
 * @returns {Promise<Array<{date: string, blockedTotal: number, focusSessions: number, focusMinutes: number}>>}
 */
export async function getStatsForDays(days) {
  const data = await chrome.storage.local.get('stats');
  const daily = (data.stats || { daily: {} }).daily;

  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = daily[dateStr] || { blockedAttempts: {}, focusSessions: 0, focusMinutes: 0 };

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
