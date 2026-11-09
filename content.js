// content.js — 注入頁面：浮動計時器 UI
// 透過 chrome.storage.onChanged 即時同步（背景的 runtime.sendMessage 送不到 content script）

(function () {
  'use strict';

  let timerEl = null;
  let countdownEl = null;
  let updateInterval = null;

  function formatTime(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function showTimer(phase, endTime) {
    if (!document.body) return;

    if (!timerEl) {
      timerEl = document.createElement('div');
      timerEl.id = 'sitefocus-timer';
      timerEl.setAttribute('role', 'timer');
      const dot = document.createElement('span');
      dot.className = 'sitefocus-dot';
      const label = document.createElement('span');
      label.className = 'sitefocus-label';
      countdownEl = document.createElement('span');
      countdownEl.className = 'sitefocus-countdown';
      timerEl.append(dot, label, countdownEl);
    }

    timerEl.className = `sitefocus-${phase}`;
    timerEl.querySelector('.sitefocus-label').textContent = phase === 'focus' ? '專注' : '休息';
    if (!timerEl.isConnected) document.body.appendChild(timerEl);

    const tick = () => { countdownEl.textContent = formatTime(endTime - Date.now()); };
    clearInterval(updateInterval);
    tick();
    updateInterval = setInterval(tick, 1000);
  }

  function removeTimer() {
    clearInterval(updateInterval);
    updateInterval = null;
    timerEl?.remove();
  }

  let focusMode = null;
  let showFloatingTimer = true;

  function render() {
    if (showFloatingTimer && focusMode?.isRunning && focusMode.endTime) {
      showTimer(focusMode.phase === 'break' ? 'break' : 'focus', focusMode.endTime);
    } else {
      removeTimer();
    }
  }

  chrome.storage.local.get(['focusMode', 'showFloatingTimer'])
    .then(data => {
      focusMode = data.focusMode;
      showFloatingTimer = data.showFloatingTimer !== false;
      render();
    })
    .catch(removeTimer);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(changes.focusMode || changes.showFloatingTimer)) return;
    if (changes.focusMode) focusMode = changes.focusMode.newValue;
    if (changes.showFloatingTimer) showFloatingTimer = changes.showFloatingTimer.newValue !== false;
    render();
  });
})();
