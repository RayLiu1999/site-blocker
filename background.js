// background.js — Service Worker：攔截請求、排程邏輯、計時器

import { getBlockingState, shouldBlockUrl, patternToRegexSource, clampInt, DEFAULT_STORAGE } from './utils.js';
import { recordFocusSession, recordBlockedAttempt } from './stats.js';

const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html');
const SCHEDULE_ALARM = 'schedule-check';
const FOCUS_ALARM = 'focus-timer';
const SNOOZE_ALARM = 'snooze-end';
const STATE_KEYS = ['enabled', 'mode', 'blocklist', 'whitelist', 'focusMode', 'snoozeUntil'];
// 每條規則都使用 regexFilter，因此受 regex 規則數量上限限制
const MAX_REGEX_RULES = chrome.declarativeNetRequest?.MAX_NUMBER_OF_REGEX_RULES ?? 1000;
const RESOURCE_TYPES = ['main_frame'];
// 以 hash 帶出完整原始網址（\0 為整段比對結果），避免查詢字串中的 & 破壞參數
const REDIRECT_ACTION = { type: 'redirect', redirect: { regexSubstitution: BLOCKED_PAGE + '#\\0' } };

// ─────────────────────────────────────────────
// 初始化
// ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  // 新安裝或版本更新：只補齊缺少的欄位，不覆蓋既有設定
  const existing = await chrome.storage.local.get(null);
  const missing = Object.fromEntries(
    Object.entries(DEFAULT_STORAGE).filter(([key]) => existing[key] === undefined)
  );
  if (Object.keys(missing).length > 0) await chrome.storage.local.set(missing);
  await initialize();
});

chrome.runtime.onStartup.addListener(initialize);

async function initialize() {
  await chrome.alarms.create(SCHEDULE_ALARM, { periodInMinutes: 1 });
  await restoreTimers();
  await rebuildDNRRules();
}

/**
 * 擴充功能更新或瀏覽器重開後 alarm 可能被清除，依 storage 狀態補回。
 */
async function restoreTimers() {
  const { focusMode: fm, snoozeUntil } = await chrome.storage.local.get(['focusMode', 'snoozeUntil']);
  const now = Date.now();

  if (fm?.isRunning) {
    if (!fm.endTime || fm.endTime <= now) {
      await handleFocusAlarm();
    } else if (!(await chrome.alarms.get(FOCUS_ALARM))) {
      await chrome.alarms.create(FOCUS_ALARM, { when: fm.endTime });
    }
  }

  if (snoozeUntil) {
    if (snoozeUntil <= now) {
      await chrome.storage.local.remove('snoozeUntil');
    } else if (!(await chrome.alarms.get(SNOOZE_ALARM))) {
      await chrome.alarms.create(SNOOZE_ALARM, { when: snoozeUntil });
    }
  }
}

// ─────────────────────────────────────────────
// Alarm handlers
// ─────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SCHEDULE_ALARM) {
    await rebuildDNRRules();
  } else if (alarm.name === FOCUS_ALARM) {
    await handleFocusAlarm();
  } else if (alarm.name === SNOOZE_ALARM) {
    await chrome.storage.local.remove('snoozeUntil');
    await rebuildDNRRules();
  }
});

// ─────────────────────────────────────────────
// DNR 規則建立
// ─────────────────────────────────────────────
let rebuildQueue = Promise.resolve();
let lastRulesKey = null;

/**
 * 依序重建規則，避免排程 alarm 與設定頁同時重建造成規則 ID 衝突。
 * 重建後會順便把已開啟、應封鎖的分頁導向封鎖頁。
 */
function rebuildDNRRules() {
  const run = rebuildQueue.then(applyRules);
  rebuildQueue = run.catch(err => console.error('[SiteFocus] 更新封鎖規則失敗', err));
  return run;
}

async function applyRules() {
  const data = await chrome.storage.local.get(STATE_KEYS);
  const state = getBlockingState(data);
  const { rules, skipped } = buildRules(state);

  const key = JSON.stringify(rules);
  if (key !== lastRulesKey) {
    await replaceDynamicRules(rules);
    lastRulesKey = key;
  }

  await updateRuleStatus(skipped);
  await redirectBlockedTabs(state);
}

/**
 * 將封鎖狀態轉為 DNR 規則
 * @param {ReturnType<typeof getBlockingState>} state
 * @returns {{ rules: object[], skipped: number }}
 */
function buildRules(state) {
  const rules = [];
  let skipped = 0;
  if (!state.active) return { rules, skipped };

  const add = (priority, action, regexFilter) => {
    if (!regexFilter) return;
    if (rules.length >= MAX_REGEX_RULES) {
      skipped++;
      return;
    }
    rules.push({
      id: rules.length + 1,
      priority,
      action,
      condition: { regexFilter, resourceTypes: RESOURCE_TYPES },
    });
  };

  const patterns = [...new Set(state.patterns)];
  if (state.mode === 'whitelist') {
    // 白名單模式：低優先度封鎖全部網址，高優先度放行白名單
    add(1, REDIRECT_ACTION, '^https?://.*$');
    for (const pattern of patterns) add(2, { type: 'allow' }, patternToRegexSource(pattern));
  } else {
    for (const pattern of patterns) add(2, REDIRECT_ACTION, patternToRegexSource(pattern));
  }

  if (skipped > 0) console.warn(`[SiteFocus] 規則數量已達上限，略過 ${skipped} 筆`);
  return { rules, skipped };
}

/**
 * 以單次呼叫原子性地替換所有動態規則；若整批失敗（舊規則仍保留），改為逐條加入並略過無效規則。
 * @param {object[]} rules
 */
async function replaceDynamicRules(rules) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: rules });
  } catch (err) {
    console.warn('[SiteFocus] 批次更新規則失敗，改為逐條加入', err);
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    for (const rule of rules) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });
      } catch (ruleErr) {
        console.warn('[SiteFocus] 略過無效規則', rule.condition.regexFilter, ruleErr);
      }
    }
  }
}

async function updateRuleStatus(skipped) {
  const { ruleStatus } = await chrome.storage.local.get('ruleStatus');
  if ((ruleStatus?.skipped || 0) !== skipped) {
    await chrome.storage.local.set({ ruleStatus: { skipped } });
  }
}

// ─────────────────────────────────────────────
// 已開啟分頁的封鎖（DNR 只攔得到新的頁面載入）
// ─────────────────────────────────────────────
function blockTabIfNeeded(tabId, url, state) {
  if (!shouldBlockUrl(state, url)) return undefined;
  return chrome.tabs.update(tabId, { url: BLOCKED_PAGE + '#' + url }).catch(() => {});
}

/**
 * 掃描所有開著的 Tab，把應封鎖的 Tab 導向 blocked.html
 * @param {ReturnType<typeof getBlockingState>} state
 */
async function redirectBlockedTabs(state) {
  if (!state.active) return;
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => blockTabIfNeeded(tab.id, tab.url, state)));
}

// SPA 透過 history API 換頁時不會觸發 DNR，改由網址變更事件攔截
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url || !/^https?:\/\//i.test(changeInfo.url)) return;
  const data = await chrome.storage.local.get(STATE_KEYS);
  await blockTabIfNeeded(tabId, changeInfo.url, getBlockingState(data));
});

// ─────────────────────────────────────────────
// 專注模式計時
// ─────────────────────────────────────────────
async function startFocusMode(focusDuration, breakDuration) {
  focusDuration = clampInt(focusDuration, 1, 120, 25);
  breakDuration = clampInt(breakDuration, 1, 60, 5);
  const endTime = Date.now() + focusDuration * 60 * 1000;

  await chrome.storage.local.set({
    focusMode: {
      focusDuration,
      breakDuration,
      isRunning: true,
      sessionStart: Date.now(),
      phase: 'focus',
      endTime,
    }
  });

  await chrome.alarms.create(FOCUS_ALARM, { when: endTime });
  await rebuildDNRRules();
}

async function handleFocusAlarm() {
  const data = await chrome.storage.local.get('focusMode');
  const fm = data.focusMode;
  if (!fm?.isRunning) return;

  const focusDuration = clampInt(fm.focusDuration, 1, 120, 25);
  const breakDuration = clampInt(fm.breakDuration, 1, 60, 5);

  if (fm.phase === 'focus') {
    // 專注結束 → 進入休息
    await recordFocusSession(focusDuration);
    const endTime = Date.now() + breakDuration * 60 * 1000;

    await chrome.storage.local.set({
      focusMode: { ...fm, phase: 'break', endTime, sessionStart: Date.now() }
    });

    await chrome.alarms.create(FOCUS_ALARM, { when: endTime });
    await rebuildDNRRules();

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'SiteFocus — 專注結束！',
      message: `專注 ${focusDuration} 分鐘完成！休息 ${breakDuration} 分鐘吧。`,
    });
  } else {
    // 休息結束 → 進入下一輪專注（重建規則時會把仍開著的被封鎖頁面導走）
    const endTime = Date.now() + focusDuration * 60 * 1000;

    await chrome.storage.local.set({
      focusMode: { ...fm, phase: 'focus', endTime, sessionStart: Date.now() }
    });

    await chrome.alarms.create(FOCUS_ALARM, { when: endTime });
    await rebuildDNRRules();

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'SiteFocus — 休息結束！',
      message: '休息時間結束，繼續專注！',
    });
  }
}

async function stopFocusMode() {
  const data = await chrome.storage.local.get('focusMode');
  const fm = data.focusMode;

  await chrome.storage.local.set({
    focusMode: {
      ...fm,
      isRunning: false,
      phase: 'focus',
      sessionStart: null,
      endTime: null,
    }
  });

  await chrome.alarms.clear(FOCUS_ALARM);
  await rebuildDNRRules();
}

// ─────────────────────────────────────────────
// 暫時解除封鎖（Snooze）
// ─────────────────────────────────────────────
async function startSnooze(minutes) {
  const endTime = Date.now() + clampInt(minutes, 1, 240, 5) * 60 * 1000;
  await chrome.storage.local.set({ snoozeUntil: endTime });
  await chrome.alarms.create(SNOOZE_ALARM, { when: endTime });
  // 立即重新建立規則（snoozeUntil 生效期間不加入任何封鎖規則）
  await rebuildDNRRules();
}

// ─────────────────────────────────────────────
// 訊息處理（來自 popup / options / blocked）
// ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  switch (msg?.type) {
    case 'REBUILD_RULES':
      await rebuildDNRRules();
      return { ok: true };

    case 'START_FOCUS':
      await startFocusMode(msg.focusDuration, msg.breakDuration);
      return { ok: true };

    case 'STOP_FOCUS':
      await stopFocusMode();
      return { ok: true };

    case 'START_SNOOZE':
      await startSnooze(msg.minutes);
      return { ok: true };

    case 'RECORD_BLOCKED':
      if (typeof msg.domain === 'string' && msg.domain) await recordBlockedAttempt(msg.domain);
      return { ok: true };

    default:
      return { error: 'Unknown message type' };
  }
}
