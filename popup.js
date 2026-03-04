// popup.js

let focusEndTime = null;
let focusUpdateInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  await renderAll();

  // 監聽 storage 變化（即時同步）
  chrome.storage.onChanged.addListener(async () => {
    await renderAll();
  });

  // 設定按鈕
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});

async function renderAll() {
  const data = await chrome.storage.local.get([
    'enabled', 'mode', 'blocklist', 'focusMode', 'stats'
  ]);

  renderToggle(data.enabled !== false);
  renderFocusMode(data.focusMode);
  await renderBlockThisButton();
  renderStats(data.stats);
}

// ─────────────────────────────────────────────
// 啟用/停用封鎖
// ─────────────────────────────────────────────
function renderToggle(enabled) {
  const toggle = document.getElementById('toggle-enabled');
  const stateText = document.getElementById('toggle-state-text');

  toggle.checked = enabled;
  stateText.textContent = enabled ? '啟用中' : '已停用';
  stateText.style.color = enabled ? '#6366f1' : '#64748b';

  toggle.onchange = async () => {
    await chrome.storage.local.set({ enabled: toggle.checked });
    await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
  };
}

// ─────────────────────────────────────────────
// 專注模式
// ─────────────────────────────────────────────
function renderFocusMode(fm) {
  const timerDisplay = document.getElementById('focus-timer-display');
  const phaseBadge = document.getElementById('focus-phase-badge');
  const focusBtn = document.getElementById('btn-focus-toggle');
  const durationLabel = document.getElementById('focus-duration-label');

  const isRunning = fm?.isRunning;
  const phase = fm?.phase || 'focus';
  const focusDuration = fm?.focusDuration || 25;
  const breakDuration = fm?.breakDuration || 5;

  durationLabel.textContent = `${focusDuration}m / ${breakDuration}m`;

  if (isRunning) {
    focusBtn.textContent = '■ 停止';
    focusBtn.className = 'btn btn-focus running';
    timerDisplay.style.display = 'inline';
    phaseBadge.style.display = 'inline';
    phaseBadge.textContent = phase === 'focus' ? '🎯 專注中' : '☕ 休息中';

    focusEndTime = fm.endTime;
    startFocusCountdown();
  } else {
    focusBtn.textContent = '▶ 開始';
    focusBtn.className = 'btn btn-focus';
    timerDisplay.style.display = 'none';
    phaseBadge.style.display = 'none';
    stopFocusCountdown();
  }

  focusBtn.onclick = async () => {
    if (!isRunning) {
      await chrome.runtime.sendMessage({
        type: 'START_FOCUS',
        focusDuration,
        breakDuration,
      });
    } else {
      await chrome.runtime.sendMessage({ type: 'STOP_FOCUS' });
    }
  };
}

function startFocusCountdown() {
  stopFocusCountdown();
  updateCountdown();
  focusUpdateInterval = setInterval(updateCountdown, 1000);
}

function stopFocusCountdown() {
  if (focusUpdateInterval) {
    clearInterval(focusUpdateInterval);
    focusUpdateInterval = null;
  }
}

function updateCountdown() {
  const el = document.getElementById('focus-timer-display');
  if (!el || !focusEndTime) return;
  const remaining = Math.max(0, focusEndTime - Date.now());
  const totalSec = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  el.textContent = `${m}:${s}`;
}

// ─────────────────────────────────────────────
// 一鍵封鎖目前網站
// ─────────────────────────────────────────────
async function renderBlockThisButton() {
  const btn = document.getElementById('btn-block-this');
  const label = document.getElementById('current-url-label');

  let currentUrl = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentUrl = tab?.url || '';
  } catch { }

  let hostname = '';
  try {
    hostname = new URL(currentUrl).hostname.replace(/^www\./, '');
  } catch { }

  if (!hostname || currentUrl.startsWith('chrome://') || currentUrl.startsWith('chrome-extension://')) {
    btn.textContent = '＋ 封鎖目前網站';
    label.textContent = '（無法封鎖此頁面）';
    btn.disabled = true;
    btn.style.opacity = '0.4';
    return;
  }

  label.textContent = hostname;
  btn.disabled = false;
  btn.style.opacity = '1';

  // 檢查是否已在封鎖清單
  const data = await chrome.storage.local.get('blocklist');
  const blocklist = data.blocklist || [];
  const alreadyBlocked = blocklist.some(e =>
    e.pattern === hostname || e.pattern === `*.${hostname}`
  );

  if (alreadyBlocked) {
    btn.textContent = '✓ 已在封鎖清單';
    btn.className = 'btn btn-block-this blocked';
    btn.onclick = null;
  } else {
    btn.textContent = '＋ 封鎖目前網站';
    btn.className = 'btn btn-block-this';
    btn.onclick = async () => {
      const newEntry = {
        id: crypto.randomUUID(),
        pattern: hostname,
        category: 'manual',
        schedule: { enabled: false, days: [0,1,2,3,4,5,6], startTime: '00:00', endTime: '23:59' }
      };
      const updated = [...blocklist, newEntry];
      await chrome.storage.local.set({ blocklist: updated });
      await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
      await renderBlockThisButton();
    };
  }
}

// ─────────────────────────────────────────────
// 今日統計
// ─────────────────────────────────────────────
function renderStats(statsData) {
  const today = new Date().toISOString().slice(0, 10);
  const daily = statsData?.daily?.[today] || {};

  const blockedTotal = Object.values(daily.blockedAttempts || {}).reduce((a, b) => a + b, 0);
  const sessions = daily.focusSessions || 0;

  document.getElementById('stat-blocked').textContent = blockedTotal;
  document.getElementById('stat-sessions').textContent = sessions;
}
