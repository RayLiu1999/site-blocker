// content.js — 注入頁面：浮動計時器 UI

(function () {
  'use strict';

  let timerEl = null;
  let updateInterval = null;

  function formatTime(ms) {
    if (ms <= 0) return '00:00';
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function createTimerWidget(phase, endTime) {
    if (timerEl) timerEl.remove();

    timerEl = document.createElement('div');
    timerEl.id = 'sitefocus-timer';
    timerEl.className = `sitefocus-timer sitefocus-${phase}`;
    timerEl.innerHTML = `
      <span class="sitefocus-icon">${phase === 'focus' ? '🎯' : '☕'}</span>
      <span class="sitefocus-label">${phase === 'focus' ? '專注中' : '休息中'}</span>
      <span class="sitefocus-countdown" id="sitefocus-countdown">--:--</span>
    `;
    document.body.appendChild(timerEl);

    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(() => {
      const remaining = endTime - Date.now();
      const el = document.getElementById('sitefocus-countdown');
      if (el) el.textContent = formatTime(remaining);
      if (remaining <= 0) clearInterval(updateInterval);
    }, 1000);
  }

  function removeTimerWidget() {
    if (timerEl) { timerEl.remove(); timerEl = null; }
    if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
  }

  async function syncFocusState() {
    try {
      const data = await chrome.storage.local.get('focusMode');
      const fm = data.focusMode;
      if (fm?.isRunning && fm.endTime) {
        createTimerWidget(fm.phase, fm.endTime);
      } else {
        removeTimerWidget();
      }
    } catch {
      removeTimerWidget();
    }
  }

  // 初始化
  syncFocusState();

  // 監聽來自 background 的狀態變更
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'FOCUS_STATE_CHANGED') {
      syncFocusState();
    }
  });

  // 每隔 30 秒主動同步（避免 service worker 重啟後遺漏）
  setInterval(syncFocusState, 30000);
})();
