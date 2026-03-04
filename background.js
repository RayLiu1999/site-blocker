// background.js — Service Worker：攔截請求、排程邏輯、計時器

import { isInSchedule, extractHostname, DEFAULT_STORAGE } from './utils.js';
import { recordBlockedAttempt, recordFocusSession } from './stats.js';

const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html');
const MAX_DNR_RULES = 4900; // 安全上限（規格最大 5000）
const SCHEDULE_ALARM = 'schedule-check';
const FOCUS_ALARM = 'focus-timer';

// ─────────────────────────────────────────────
// 初始化
// ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(null);
  if (!existing.enabled && existing.enabled !== false) {
    await chrome.storage.local.set(DEFAULT_STORAGE);
  }
  await rebuildDNRRules();
  setupAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  await rebuildDNRRules();
  setupAlarms();
});

// ─────────────────────────────────────────────
// Alarm handlers
// ─────────────────────────────────────────────
function setupAlarms() {
  chrome.alarms.create(SCHEDULE_ALARM, { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SCHEDULE_ALARM) {
    await rebuildDNRRules();
  } else if (alarm.name === FOCUS_ALARM) {
    await handleFocusAlarm();
  }
});

// ─────────────────────────────────────────────
// DNR 規則建立
// ─────────────────────────────────────────────
async function rebuildDNRRules() {
  const data = await chrome.storage.local.get(['enabled', 'mode', 'blocklist', 'whitelist', 'focusMode']);
  const { enabled, mode, blocklist = [], whitelist = [], focusMode } = data;

  // 移除所有現有動態規則
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existing.map(r => r.id);
  if (existingIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existingIds });
  }

  if (!enabled) return;

  // 專注休息階段 → 不封鎖
  if (focusMode?.isRunning && focusMode?.phase === 'break') return;

  const rules = [];
  let ruleId = 1;

  if (mode === 'whitelist') {
    // 白名單模式：封鎖所有非白名單網站
    const allowedDomains = whitelist.map(w => w.pattern.replace(/^\*\./, ''));

    if (rules.length < MAX_DNR_RULES) {
      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { url: BLOCKED_PAGE + '?url=WHITELIST_BLOCK' }
        },
        condition: {
          urlFilter: '*',
          resourceTypes: ['main_frame'],
          excludedInitiatorDomains: [...allowedDomains, extractHostname(BLOCKED_PAGE)],
        }
      });
    }
  } else {
    // 封鎖清單模式
    for (const entry of blocklist) {
      if (ruleId > MAX_DNR_RULES) {
        console.warn('[SiteFocus] DNR 規則數量已達上限！');
        break;
      }

      // 排程檢查：若此條目有排程且目前不在排程時段內，跳過
      if (entry.schedule?.enabled && !isInSchedule(entry.schedule)) continue;

      const urlRules = buildDNRConditions(entry.pattern, ruleId);
      for (const urlRule of urlRules) {
        if (ruleId > MAX_DNR_RULES) break;
        urlRule.id = ruleId++;
        rules.push(urlRule);
      }
    }
  }

  if (rules.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
  }
}

/**
 * 將 pattern 轉換為 DNR 規則條件
 * @param {string} pattern
 * @param {number} startId
 * @returns {Array}
 */
function buildDNRConditions(pattern, startId) {
  const blockedUrl = BLOCKED_PAGE;
  const action = {
    type: 'redirect',
    redirect: { url: blockedUrl + '?url=' + encodeURIComponent(pattern) }
  };

  let urlFilter;

  if (pattern.startsWith('*.')) {
    // *.example.com → 匹配所有子域
    const domain = pattern.slice(2);
    return [
      {
        priority: 2,
        action,
        condition: {
          urlFilter: `||${domain}`,
          resourceTypes: ['main_frame'],
        }
      }
    ];
  } else if (!pattern.includes('/') && !pattern.includes('*')) {
    // 純域名
    return [
      {
        priority: 2,
        action,
        condition: {
          urlFilter: `||${pattern}`,
          resourceTypes: ['main_frame'],
        }
      }
    ];
  } else {
    // 含路徑或其他萬用字元
    urlFilter = pattern.replace(/\*/g, '*');
    return [
      {
        priority: 2,
        action,
        condition: {
          urlFilter,
          resourceTypes: ['main_frame'],
        }
      }
    ];
  }
}

// ─────────────────────────────────────────────
// 專注模式計時
// ─────────────────────────────────────────────
async function startFocusMode(focusDuration, breakDuration) {
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

  chrome.alarms.create(FOCUS_ALARM, { when: endTime });
  await rebuildDNRRules();

  // 通知 popup 更新
  chrome.runtime.sendMessage({ type: 'FOCUS_STATE_CHANGED' }).catch(() => {});
}

async function handleFocusAlarm() {
  const data = await chrome.storage.local.get('focusMode');
  const fm = data.focusMode;
  if (!fm?.isRunning) return;

  if (fm.phase === 'focus') {
    // 專注結束 → 進入休息
    await recordFocusSession(fm.focusDuration);
    const endTime = Date.now() + fm.breakDuration * 60 * 1000;

    await chrome.storage.local.set({
      focusMode: { ...fm, phase: 'break', endTime, sessionStart: Date.now() }
    });

    chrome.alarms.create(FOCUS_ALARM, { when: endTime });
    await rebuildDNRRules();

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'SiteFocus — 專注結束！',
      message: `專注 ${fm.focusDuration} 分鐘完成！休息 ${fm.breakDuration} 分鐘吧。`,
    });
  } else {
    // 休息結束 → 進入下一輪專注
    const endTime = Date.now() + fm.focusDuration * 60 * 1000;

    await chrome.storage.local.set({
      focusMode: { ...fm, phase: 'focus', endTime, sessionStart: Date.now() }
    });

    chrome.alarms.create(FOCUS_ALARM, { when: endTime });
    await rebuildDNRRules();

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'SiteFocus — 休息結束！',
      message: '休息時間結束，繼續專注！',
    });
  }

  chrome.runtime.sendMessage({ type: 'FOCUS_STATE_CHANGED' }).catch(() => {});
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

  chrome.alarms.clear(FOCUS_ALARM);
  await rebuildDNRRules();
  chrome.runtime.sendMessage({ type: 'FOCUS_STATE_CHANGED' }).catch(() => {});
}

// ─────────────────────────────────────────────
// 暫時解除封鎖（Snooze）
// ─────────────────────────────────────────────
async function startSnooze(minutes) {
  const endTime = Date.now() + minutes * 60 * 1000;
  await chrome.storage.local.set({ snoozeUntil: endTime });

  // 暫時停用所有動態規則
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existing.map(r => r.id);
  if (existingIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existingIds });
  }

  chrome.alarms.create('snooze-end', { when: endTime });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'snooze-end') {
    await chrome.storage.local.remove('snoozeUntil');
    await rebuildDNRRules();
    chrome.runtime.sendMessage({ type: 'SNOOZE_ENDED' }).catch(() => {});
  }
});

// ─────────────────────────────────────────────
// 訊息處理（來自 popup / options / blocked）
// ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'REBUILD_RULES':
      await rebuildDNRRules();
      return { ok: true };

    case 'GET_CURRENT_TAB_URL': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return { url: tab?.url || '' };
    }

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
      await recordBlockedAttempt(msg.domain);
      return { ok: true };

    default:
      return { error: 'Unknown message type' };
  }
}
