// blocked.js — 封鎖提示頁

import { sha256, randomQuote, matchesPattern, currentSlotEnd, clampInt } from './utils.js';

const $ = id => document.getElementById(id);

(async function () {
  // 原始網址由 DNR regexSubstitution 帶在 hash；舊版規則則以 ?url= 帶 pattern
  const originalUrl = readOriginalUrl();
  const host = hostOf(originalUrl);

  const data = await chrome.storage.local.get([
    'motivationalQuotes', 'breakSettings', 'passwordHash', 'passwordHint', 'focusMode', 'blocklist', 'mode',
  ]);
  const { breakSettings = {}, passwordHash, passwordHint, motivationalQuotes, focusMode, blocklist = [], mode } = data;

  $('blocked-domain').textContent = host || '這個網站';
  if (host) document.title = `${host} 已封鎖 — SiteFocus`;

  recordAttempt(host);
  renderStatus({ focusMode, blocklist, mode, url: originalUrl });

  if (motivationalQuotes !== false) {
    $('blocked-quote').textContent = randomQuote();
  } else {
    $('blocked-quote').hidden = true;
  }

  // ── 返回 ────────────────────────────────────
  $('btn-back').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else chrome.tabs.update({ url: 'chrome://newtab/' });
  });

  // ── 暫時解除 ────────────────────────────────
  const snoozeMinutes = clampInt(breakSettings.timedMinutes, 1, 60, 5);
  let unlockType = breakSettings.type || 'cooldown';
  // 選了密碼但尚未設定密碼時，改用冷靜計時器，避免永遠無法解除
  if (unlockType === 'password' && !passwordHash) unlockType = 'cooldown';

  const snoozeBtn = $('btn-snooze');
  snoozeBtn.textContent = `暫時解除 ${snoozeMinutes} 分鐘`;
  snoozeBtn.addEventListener('click', () => {
    if (unlockType === 'cooldown') startCooldown(clampInt(breakSettings.cooldownSeconds, 5, 300, 30));
    else if (unlockType === 'password') showPasswordArea();
    else doSnooze();
  });

  function startCooldown(seconds) {
    snoozeBtn.hidden = true;
    $('cooldown-area').hidden = false;
    const counter = $('cooldown-counter');
    const bar = $('cooldown-bar');
    const confirmBtn = $('btn-confirm-snooze');
    confirmBtn.textContent = `暫時解除 ${snoozeMinutes} 分鐘`;

    const endAt = Date.now() + seconds * 1000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      counter.textContent = remaining;
      bar.style.width = `${((seconds - remaining) / seconds) * 100}%`;
      if (remaining === 0) {
        clearInterval(timer);
        confirmBtn.disabled = false;
        confirmBtn.focus();
      }
    };
    const timer = setInterval(tick, 250);
    tick();

    confirmBtn.addEventListener('click', doSnooze, { once: true });
  }

  function showPasswordArea() {
    snoozeBtn.hidden = true;
    $('password-area').hidden = false;
    const input = $('password-input');
    input.focus();

    if (passwordHint) {
      $('password-hint').textContent = `提示：${passwordHint}`;
      $('password-hint').hidden = false;
    }

    const submit = async () => {
      if ((await sha256(input.value)) === passwordHash) {
        doSnooze();
      } else {
        $('password-error').hidden = false;
        input.value = '';
        input.focus();
      }
    };
    $('btn-confirm-password').addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }

  async function doSnooze() {
    await chrome.runtime.sendMessage({ type: 'START_SNOOZE', minutes: snoozeMinutes });
    if (/^https?:\/\//i.test(originalUrl)) window.location.replace(originalUrl);
    else history.back();
  }
})();

function readOriginalUrl() {
  const fromHash = window.location.hash.slice(1);
  if (fromHash) return fromHash;

  const legacy = new URLSearchParams(window.location.search).get('url') || '';
  if (!legacy || legacy === 'WHITELIST_BLOCK') return '';
  const cleaned = legacy.replace(/^\*\./, '').replace(/\*.*$/, '');
  return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function recordAttempt(host) {
  // 重新整理或上一頁返回封鎖頁時不重複計數
  const navType = performance.getEntriesByType('navigation')[0]?.type;
  if (!host || navType === 'reload' || navType === 'back_forward') return;
  chrome.runtime.sendMessage({ type: 'RECORD_BLOCKED', domain: host }).catch(() => {});
}

function renderStatus({ focusMode, blocklist, mode, url }) {
  const el = $('blocked-schedule');
  let text = '';

  if (focusMode?.isRunning && focusMode.phase === 'focus' && focusMode.endTime > Date.now()) {
    const minutes = Math.ceil((focusMode.endTime - Date.now()) / 60000);
    text = `專注時間還剩 ${minutes} 分鐘`;
  } else if (mode === 'whitelist') {
    text = '白名單模式：這個網站不在允許清單中';
  } else if (url) {
    const matched = blocklist.filter(entry => matchesPattern(url, entry.pattern));
    if (matched.length && matched.every(entry => entry.schedule?.enabled)) {
      const ends = matched.map(entry => currentSlotEnd(entry.schedule)).filter(Boolean).sort();
      if (ends.length) text = `排程封鎖到今天 ${ends[ends.length - 1]}`;
    }
  }

  el.textContent = text;
  el.hidden = !text;
}
