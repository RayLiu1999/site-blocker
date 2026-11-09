// popup.js

import { normalizePattern, matchesPattern, normalizeSchedule, todayStr, generateId } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TICK_COUNT = 60;
const WATCHED_KEYS = ['focusMode', 'stats', 'blocklist', 'mode', 'snoozeUntil'];

let ticks = [];
let countdownTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  buildDial();
  document.getElementById('btn-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  await renderAll();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && WATCHED_KEYS.some(key => key in changes)) renderAll();
  });
});

async function renderAll() {
  const data = await chrome.storage.local.get(WATCHED_KEYS);
  renderFocus(data.focusMode);
  renderSnooze(data.snoozeUntil);
  renderStats(data.stats);
  await renderBlockThisButton(data);
}

// ─────────────────────────────────────────────
// 番茄計時盤
// ─────────────────────────────────────────────
function svg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function buildDial() {
  const root = document.getElementById('dial-svg');
  const cx = 110;
  const cy = 128;

  root.append(
    svg('circle', { class: 'dial-disk', cx, cy, r: 98 }),
    svg('circle', { class: 'dial-rim', cx, cy, r: 96 }),
    svg('ellipse', { class: 'dial-shine', cx: 74, cy: 84, rx: 42, ry: 24, transform: 'rotate(-32 74 84)' }),
  );

  ticks = [];
  for (let i = 0; i < TICK_COUNT; i++) {
    const angle = (i / TICK_COUNT) * Math.PI * 2;
    const major = i % 5 === 0;
    const inner = major ? 72 : 78;
    const outer = 86;
    const tick = svg('line', {
      class: 'dial-tick',
      x1: cx + inner * Math.sin(angle),
      y1: cy - inner * Math.cos(angle),
      x2: cx + outer * Math.sin(angle),
      y2: cy - outer * Math.cos(angle),
      'stroke-width': major ? 4 : 2.5,
    });
    ticks.push(tick);
    root.append(tick);
  }

  // 蒂頭
  const points = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 34 : 12;
    points.push(`${(110 + r * Math.cos(a)).toFixed(1)},${(36 + r * Math.sin(a) * 0.5).toFixed(1)}`);
  }
  root.append(
    svg('path', { class: 'dial-stem', d: 'M110 34 C 110 22, 114 14, 124 9' }),
    svg('polygon', { class: 'dial-crown', points: points.join(' ') }),
  );
}

function setSpentTicks(remainingRatio) {
  const active = Math.ceil(Math.max(0, Math.min(1, remainingRatio)) * TICK_COUNT);
  ticks.forEach((tick, i) => tick.classList.toggle('is-spent', i >= active));
}

function formatClock(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatTimeOfDay(timestamp) {
  return new Date(timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ─────────────────────────────────────────────
// 專注模式
// ─────────────────────────────────────────────
function renderFocus(fm) {
  const timer = document.getElementById('timer');
  const time = document.getElementById('dial-time');
  const phaseLabel = document.getElementById('dial-phase');
  const button = document.getElementById('btn-focus-toggle');
  const note = document.getElementById('timer-note');

  const focusDuration = fm?.focusDuration || 25;
  const breakDuration = fm?.breakDuration || 5;
  const isRunning = !!fm?.isRunning && !!fm.endTime;
  const phase = isRunning ? (fm.phase === 'break' ? 'break' : 'focus') : 'idle';

  timer.dataset.phase = phase;
  clearInterval(countdownTimer);

  if (phase === 'idle') {
    time.textContent = formatClock(focusDuration * 60 * 1000);
    phaseLabel.textContent = '準備專注';
    button.textContent = '開始專注';
    button.classList.remove('is-running');
    note.textContent = `專注 ${focusDuration} 分鐘，休息 ${breakDuration} 分鐘`;
    setSpentTicks(1);
  } else {
    const total = (phase === 'focus' ? focusDuration : breakDuration) * 60 * 1000;
    phaseLabel.textContent = phase === 'focus' ? '專注中' : '休息一下';
    button.textContent = phase === 'focus' ? '停止專注' : '結束番茄鐘';
    button.classList.add('is-running');
    note.textContent = phase === 'focus'
      ? `${formatTimeOfDay(fm.endTime)} 開始休息`
      : `${formatTimeOfDay(fm.endTime)} 回到專注`;

    const tick = () => {
      const remaining = fm.endTime - Date.now();
      time.textContent = formatClock(remaining);
      setSpentTicks(remaining / total);
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  button.onclick = async () => {
    button.disabled = true;
    try {
      await chrome.runtime.sendMessage(phase === 'idle'
        ? { type: 'START_FOCUS', focusDuration, breakDuration }
        : { type: 'STOP_FOCUS' });
    } finally {
      button.disabled = false;
    }
  };
}

function renderSnooze(snoozeUntil) {
  const note = document.getElementById('snooze-note');
  const active = snoozeUntil && snoozeUntil > Date.now();
  note.hidden = !active;
  if (active) note.textContent = `暫時解除中，${formatTimeOfDay(snoozeUntil)} 恢復封鎖`;
}

// ─────────────────────────────────────────────
// 一鍵封鎖目前網站
// ─────────────────────────────────────────────
async function renderBlockThisButton({ blocklist = [], mode }) {
  const btn = document.getElementById('btn-block-this');
  const label = document.getElementById('current-url-label');

  let currentUrl = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentUrl = tab?.url || '';
  } catch {}

  let hostname = '';
  if (/^https?:\/\//i.test(currentUrl)) {
    try { hostname = new URL(currentUrl).hostname.replace(/^www\./, ''); } catch {}
  }
  const pattern = normalizePattern(hostname);

  btn.onclick = null;
  btn.classList.remove('is-blocked');
  btn.removeAttribute('title');

  if (!pattern) {
    label.textContent = '這個頁面無法封鎖';
    btn.textContent = '封鎖這個網站';
    btn.disabled = true;
    return;
  }

  label.textContent = hostname;

  if (mode === 'whitelist') {
    btn.textContent = '白名單模式中';
    btn.title = '白名單模式只允許清單內的網站，請到設定頁管理';
    btn.disabled = true;
    return;
  }

  if (blocklist.some(entry => matchesPattern(currentUrl, entry.pattern))) {
    btn.textContent = '已封鎖';
    btn.classList.add('is-blocked');
    btn.disabled = true;
    return;
  }

  btn.textContent = '封鎖這個網站';
  btn.disabled = false;
  btn.onclick = async () => {
    btn.disabled = true;
    const latest = (await chrome.storage.local.get('blocklist')).blocklist || [];
    if (!latest.some(entry => normalizePattern(entry.pattern) === pattern)) {
      latest.push({ id: generateId(), pattern, category: 'manual', schedule: normalizeSchedule() });
      await chrome.storage.local.set({ blocklist: latest });
    }
    // 重建規則時，背景會把目前分頁導向封鎖頁
    await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
  };
}

// ─────────────────────────────────────────────
// 今日統計
// ─────────────────────────────────────────────
function renderStats(statsData) {
  const daily = statsData?.daily?.[todayStr()] || {};
  const blockedTotal = Object.values(daily.blockedAttempts || {}).reduce((a, b) => a + b, 0);
  document.getElementById('stat-blocked').textContent = blockedTotal;
  document.getElementById('stat-sessions').textContent = daily.focusSessions || 0;
}
