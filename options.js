// options.js

import { sha256, QUICK_BLOCK_CATEGORIES, generateId, normalizeSchedule } from './utils.js';
import { getStatsForDays, clearStats } from './stats.js';

// ─────────────────────────────────────────────
// Tab Navigation
// ─────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('tab-' + item.dataset.tab).classList.add('active');

    // Lazy-load stats on tab switch
    if (item.dataset.tab === 'stats') renderStats(7);
  });
});

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await renderBlocklist();
  await renderSchedule();
  await renderFocusSettings();
  await renderBreakSettings();
  await renderPasswordTab();
  setupCategoryButtons();
  setupExportImport();
  setupStatsButtons();
});

// ─────────────────────────────────────────────
// Blocklist Tab
// ─────────────────────────────────────────────
async function renderBlocklist() {
  const data = await chrome.storage.local.get(['mode', 'blocklist', 'whitelist']);
  const mode = data.mode || 'blocklist';
  const list = mode === 'blocklist' ? (data.blocklist || []) : (data.whitelist || []);

  // Mode radios
  document.getElementById('mode-' + mode).checked = true;
  updateListTitles(mode);

  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      await chrome.storage.local.set({ mode: radio.value });
      await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
      updateListTitles(radio.value);
      await renderBlocklist();
    });
  });

  renderSiteList(list, mode);

  // Add pattern
  document.getElementById('btn-add-pattern').onclick = async () => {
    const input = document.getElementById('new-pattern');
    const pattern = input.value.trim();
    if (!pattern) return;

    const currentData = await chrome.storage.local.get(['mode', 'blocklist', 'whitelist']);
    const currentMode = currentData.mode || 'blocklist';
    const currentList = currentMode === 'blocklist' ? (currentData.blocklist || []) : (currentData.whitelist || []);

    if (currentList.some(e => e.pattern === pattern)) {
      input.style.borderColor = '#ef4444';
      setTimeout(() => { input.style.borderColor = ''; }, 1500);
      return;
    }

    const newEntry = {
      id: generateId(),
      pattern,
      category: 'manual',
      schedule: normalizeSchedule()
    };

    currentList.push(newEntry);
    const key = currentMode === 'blocklist' ? 'blocklist' : 'whitelist';
    await chrome.storage.local.set({ [key]: currentList });
    await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
    input.value = '';
    await renderBlocklist();
    await renderSchedule();
  };

  document.getElementById('new-pattern').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-add-pattern').click();
  });
}

function updateListTitles(mode) {
  const isWL = mode === 'whitelist';
  document.getElementById('add-list-title').textContent = isWL ? '新增至白名單' : '新增至封鎖清單';
  document.getElementById('list-display-title').textContent = isWL ? '白名單' : '封鎖清單';
}

function renderSiteList(list, mode) {
  const emptyEl = document.getElementById('blocklist-empty');
  const listEl = document.getElementById('blocklist-items');

  if (!list.length) {
    emptyEl.style.display = 'block';
    listEl.innerHTML = '';
    return;
  }

  emptyEl.style.display = 'none';
  listEl.innerHTML = '';

  list.forEach(entry => {
    const li = document.createElement('li');
    li.className = 'site-item';
    li.dataset.id = entry.id;
    li.innerHTML = `
      <span class="site-item-pattern">${entry.pattern}</span>
      ${entry.category !== 'manual' ? `<span class="site-item-category">${entry.category}</span>` : ''}
      <div class="site-item-actions">
        <button class="btn-icon delete" data-id="${entry.id}" title="刪除">🗑</button>
      </div>
    `;
    listEl.appendChild(li);
  });

  listEl.querySelectorAll('.btn-icon.delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const data = await chrome.storage.local.get(['mode', 'blocklist', 'whitelist']);
      const currentMode = data.mode || 'blocklist';
      const key = currentMode === 'blocklist' ? 'blocklist' : 'whitelist';
      const currentList = data[key] || [];
      const updated = currentList.filter(e => e.id !== id);
      await chrome.storage.local.set({ [key]: updated });
      await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
      await renderBlocklist();
      await renderSchedule();
    });
  });
}

// ─────────────────────────────────────────────
// Quick Block Categories
// ─────────────────────────────────────────────
function setupCategoryButtons() {
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const category = btn.dataset.category;
      const cat = QUICK_BLOCK_CATEGORIES[category];
      if (!cat) return;

      const data = await chrome.storage.local.get(['mode', 'blocklist', 'whitelist']);
      const mode = data.mode || 'blocklist';
      const key = mode === 'blocklist' ? 'blocklist' : 'whitelist';
      const list = data[key] || [];

      let added = 0;
      for (const domain of cat.domains) {
        if (!list.some(e => e.pattern === domain)) {
          list.push({
            id: generateId(),
            pattern: domain,
            category,
            schedule: normalizeSchedule()
          });
          added++;
        }
      }

      await chrome.storage.local.set({ [key]: list });
      await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
      btn.textContent = `✓ 已加入 ${added} 個`;
      setTimeout(() => { btn.textContent = `${btn.dataset.emoji || ''} ${cat.label}`; }, 2000);
      await renderBlocklist();
      await renderSchedule();
    });
  });
}

// ─────────────────────────────────────────────
// Export / Import
// ─────────────────────────────────────────────
function setupExportImport() {
  document.getElementById('btn-export').addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['blocklist', 'whitelist', 'mode']);
    const json = JSON.stringify({ blocklist: data.blocklist || [], whitelist: data.whitelist || [], mode: data.mode }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sitefocus-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-import-trigger').addEventListener('click', () => {
    document.getElementById('btn-import').click();
  });

  document.getElementById('btn-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed.blocklist)) throw new Error('格式錯誤：缺少 blocklist 欄位');

      await chrome.storage.local.set({
        blocklist: parsed.blocklist,
        whitelist: parsed.whitelist || [],
        mode: parsed.mode || 'blocklist'
      });
      await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
      await renderBlocklist();
      await renderSchedule();
    } catch (err) {
      alert('匯入失敗：' + err.message);
    }

    e.target.value = '';
  });
}

// ─────────────────────────────────────────────
// Schedule Tab
// ─────────────────────────────────────────────
const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];
let scheduleSaveQueue = Promise.resolve();

async function renderSchedule() {
  const data = await chrome.storage.local.get('blocklist');
  const blocklist = data.blocklist || [];
  const container = document.getElementById('schedule-list');

  if (!blocklist.length) {
    container.innerHTML = '<p class="empty-hint">封鎖清單為空，請先至「封鎖清單」頁面新增網站。</p>';
    return;
  }

  container.innerHTML = '';

  blocklist.forEach(entry => {
    const schedule = normalizeSchedule(entry.schedule || undefined);
    const div = document.createElement('div');
    div.className = 'schedule-item';
    div.dataset.id = entry.id;

    div.innerHTML = `
      <div class="schedule-item-header">
        <span class="schedule-item-pattern"></span>
        <div class="schedule-toggle">
          <span class="schedule-status-text"></span>
          <label class="toggle-small">
            <input type="checkbox" class="schedule-enabled" aria-label="啟用每週排程" ${schedule.enabled ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>
      </div>
      <fieldset class="schedule-body">
        <legend class="schedule-legend">每週封鎖時段</legend>
        ${WEEK_DAYS.map(day => `
          <div class="schedule-day" data-day="${day}">
            <label class="schedule-day-label">
              <input type="checkbox" class="day-check" ${schedule.daySchedules[day].enabled ? 'checked' : ''} />
              週${DAY_LABELS[day]}
            </label>
            <fieldset class="schedule-day-times" aria-label="週${DAY_LABELS[day]}的封鎖時段">
              <div class="schedule-slots"></div>
              <button type="button" class="btn btn-sm btn-secondary add-slot">＋ 新增時段</button>
            </fieldset>
          </div>
        `).join('')}
      </fieldset>
      <div class="schedule-item-actions">
        <button type="button" class="btn btn-sm btn-secondary apply-all-slot">套用至所有網站</button>
        <span class="schedule-feedback" role="status" aria-live="polite"></span>
      </div>
    `;

    div.querySelector('.schedule-item-pattern').textContent = entry.pattern;
    div.querySelector('.schedule-enabled').setAttribute('aria-label', `啟用 ${entry.pattern} 的每週排程`);
    div.querySelectorAll('.schedule-day').forEach(dayEl => {
      const daily = schedule.daySchedules[dayEl.dataset.day];
      daily.timeSlots.forEach(slot => appendScheduleSlot(dayEl, slot));
    });
    updateScheduleState(div);
    container.appendChild(div);
  });

  container.onchange = async event => {
    if (!event.target.matches('.schedule-enabled, .day-check, .schedule-start, .schedule-end')) return;
    const item = event.target.closest('.schedule-item');
    const dayEl = event.target.closest('.schedule-day');
    if (event.target.matches('.day-check') && event.target.checked && !dayEl.querySelector('.schedule-time-row')) {
      appendScheduleSlot(dayEl);
    }
    updateScheduleState(item);
    await saveScheduleChange(item);
  };

  container.onclick = async event => {
    const btn = event.target.closest('button');
    if (!btn) return;
    const item = btn.closest('.schedule-item');
    if (!item) return;

    if (btn.matches('.apply-all-slot')) {
      if (!confirm('確定要將此網站的每週排程套用到所有網站嗎？\n這將覆蓋其他網站各星期的啟用狀態與時段。')) return;
      if (await saveScheduleChange(item, true)) await renderSchedule();
      return;
    }

    const dayEl = btn.closest('.schedule-day');
    if (!dayEl) return;
    if (btn.matches('.add-slot')) {
      appendScheduleSlot(dayEl);
    } else if (btn.matches('.delete-slot')) {
      btn.closest('.schedule-time-row').remove();
      if (!dayEl.querySelector('.schedule-time-row')) dayEl.querySelector('.day-check').checked = false;
      renumberScheduleSlots(dayEl);
    } else {
      return;
    }
    updateScheduleState(item);
    await saveScheduleChange(item);
  };
}

function appendScheduleSlot(dayEl, slot = { startTime: '09:00', endTime: '18:00' }) {
  const row = document.createElement('div');
  row.className = 'schedule-time-row';
  row.innerHTML = `
    <span class="schedule-slot-label"></span>
    <input type="time" class="text-input schedule-start" required />
    <span>—</span>
    <input type="time" class="text-input schedule-end" required />
    <button type="button" class="btn-icon delete-slot" title="刪除時段">🗑</button>
  `;
  row.querySelector('.schedule-start').value = slot.startTime;
  row.querySelector('.schedule-end').value = slot.endTime;
  dayEl.querySelector('.schedule-slots').appendChild(row);
  renumberScheduleSlots(dayEl);
}

function renumberScheduleSlots(dayEl) {
  dayEl.querySelectorAll('.schedule-time-row').forEach((row, index) => {
    const label = `週${DAY_LABELS[dayEl.dataset.day]}時段 ${index + 1}`;
    row.querySelector('.schedule-slot-label').textContent = `時段 ${index + 1}`;
    row.querySelector('.schedule-start').setAttribute('aria-label', `${label}開始時間`);
    row.querySelector('.schedule-end').setAttribute('aria-label', `${label}結束時間`);
    row.querySelector('.delete-slot').setAttribute('aria-label', `刪除${label}`);
  });
}

function updateScheduleState(item) {
  const enabled = item.querySelector('.schedule-enabled').checked;
  item.querySelector('.schedule-body').disabled = !enabled;
  item.querySelector('.schedule-status-text').textContent = enabled ? '每週排程' : '全天封鎖';
  item.querySelectorAll('.schedule-day').forEach(dayEl => {
    dayEl.querySelector('.schedule-day-times').disabled = !dayEl.querySelector('.day-check').checked;
  });
}

async function saveScheduleChange(item, applyToAll = false) {
  const schedule = { enabled: item.querySelector('.schedule-enabled').checked, daySchedules: {} };
  let invalidInput = null;
  item.querySelectorAll('.schedule-day').forEach(dayEl => {
    const enabled = dayEl.querySelector('.day-check').checked;
    const timeSlots = [];
    dayEl.querySelectorAll('.schedule-time-row').forEach(row => {
      const start = row.querySelector('.schedule-start');
      const end = row.querySelector('.schedule-end');
      end.setCustomValidity(start.value && end.value && end.value <= start.value
        ? '結束時間必須晚於開始時間；跨午夜請分成兩天設定。' : '');
      if (schedule.enabled && enabled) {
        if (!start.checkValidity()) invalidInput ||= start;
        if (!end.checkValidity()) invalidInput ||= end;
      }
      timeSlots.push({ startTime: start.value, endTime: end.value });
    });
    schedule.daySchedules[dayEl.dataset.day] = { enabled, timeSlots };
  });

  const feedback = item.querySelector('.schedule-feedback');
  feedback.classList.toggle('has-error', !!invalidInput);
  if (invalidInput) {
    feedback.textContent = '尚未儲存，請填寫有效的起迄時間。';
    invalidInput.reportValidity();
    return false;
  }

  feedback.textContent = '儲存中…';
  // 逐次讀取最新清單並依 ID 更新，避免快速編輯不同網站時互相覆蓋。
  const save = scheduleSaveQueue.then(async () => {
    const data = await chrome.storage.local.get('blocklist');
    const updatedList = (data.blocklist || []).map(entry =>
      applyToAll || entry.id === item.dataset.id
        ? { ...entry, schedule: normalizeSchedule(schedule) }
        : entry
    );
    await chrome.storage.local.set({ blocklist: updatedList });
    await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
  });
  scheduleSaveQueue = save.catch(() => {});

  try {
    await save;
    feedback.textContent = '✓ 已儲存';
    return true;
  } catch (err) {
    feedback.classList.add('has-error');
    feedback.textContent = `儲存失敗：${err.message}`;
    return false;
  }
}

// ─────────────────────────────────────────────
// Focus Mode Tab
// ─────────────────────────────────────────────
async function renderFocusSettings() {
  const data = await chrome.storage.local.get('focusMode');
  const fm = data.focusMode || {};

  document.getElementById('focus-duration').value = fm.focusDuration || 25;
  document.getElementById('break-duration').value = fm.breakDuration || 5;

  document.getElementById('btn-save-focus').addEventListener('click', async () => {
    const focusDuration = parseInt(document.getElementById('focus-duration').value) || 25;
    const breakDuration = parseInt(document.getElementById('break-duration').value) || 5;

    const current = await chrome.storage.local.get('focusMode');
    await chrome.storage.local.set({
      focusMode: { ...(current.focusMode || {}), focusDuration, breakDuration }
    });

    showFeedback('focus-saved');
  });
}

// ─────────────────────────────────────────────
// Break Settings Tab
// ─────────────────────────────────────────────
async function renderBreakSettings() {
  const data = await chrome.storage.local.get('breakSettings');
  const bs = data.breakSettings || {};

  const breakType = bs.type || 'cooldown';
  document.getElementById('break-' + breakType).checked = true;
  document.getElementById('cooldown-seconds').value = bs.cooldownSeconds ?? 30;
  document.getElementById('timed-minutes').value = bs.timedMinutes ?? 5;

  toggleCooldownGroup(breakType);

  document.querySelectorAll('input[name="break-type"]').forEach(r => {
    r.addEventListener('change', () => toggleCooldownGroup(r.value));
  });

  document.getElementById('btn-save-break').addEventListener('click', async () => {
    const type = document.querySelector('input[name="break-type"]:checked').value;
    const cooldownSeconds = parseInt(document.getElementById('cooldown-seconds').value) || 30;
    const timedMinutes = parseInt(document.getElementById('timed-minutes').value) || 5;

    await chrome.storage.local.set({ breakSettings: { type, cooldownSeconds, timedMinutes } });
    showFeedback('break-saved');
  });
}

function toggleCooldownGroup(type) {
  document.getElementById('cooldown-sec-group').style.display =
    type === 'cooldown' ? 'block' : 'none';
  document.getElementById('password-setup-hint').style.display =
    type === 'password' ? 'block' : 'none';
}

// ─────────────────────────────────────────────
// Stats Tab
// ─────────────────────────────────────────────
function setupStatsButtons() {
  document.getElementById('btn-7days').addEventListener('click', async () => {
    document.getElementById('btn-7days').classList.add('active-period');
    document.getElementById('btn-30days').classList.remove('active-period');
    await renderStats(7);
  });
  document.getElementById('btn-30days').addEventListener('click', async () => {
    document.getElementById('btn-30days').classList.add('active-period');
    document.getElementById('btn-7days').classList.remove('active-period');
    await renderStats(30);
  });
  document.getElementById('btn-clear-stats').addEventListener('click', async () => {
    if (confirm('確定要清除所有統計資料嗎？')) {
      await clearStats();
      await renderStats(7);
    }
  });
}

async function renderStats(days) {
  const statsData = await getStatsForDays(days);

  renderBarChart('chart-blocked', statsData.map(d => ({
    label: d.date.slice(5),
    value: d.blockedTotal,
    color: '#6366f1'
  })));

  renderBarChart('chart-focus', statsData.map(d => ({
    label: d.date.slice(5),
    value: d.focusSessions,
    color: '#10b981'
  })));
}

function renderBarChart(containerId, items) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const maxVal = Math.max(...items.map(i => i.value), 1);

  items.forEach(item => {
    const group = document.createElement('div');
    group.className = 'chart-bar-group';

    const heightPct = (item.value / maxVal) * 100;

    group.innerHTML = `
      <span class="chart-value">${item.value || ''}</span>
      <div class="chart-bar" style="height: ${heightPct}%; background: ${item.color};"></div>
      <span class="chart-label">${item.label}</span>
    `;
    container.appendChild(group);
  });
}

// ─────────────────────────────────────────────
// Password Tab
// ─────────────────────────────────────────────
async function renderPasswordTab() {
  const data = await chrome.storage.local.get(['passwordHash', 'passwordHint']);
  const hasPassword = !!data.passwordHash;

  const statusEl = document.getElementById('current-password-status');
  statusEl.textContent = hasPassword
    ? `✅ 已設定密碼保護${data.passwordHint ? '　提示：' + data.passwordHint : ''}`
    : '⚠️ 尚未設定密碼';

  const oldPwInput = document.getElementById('pw-old');
  const removePwBtn = document.getElementById('btn-remove-password');

  if (hasPassword) {
    oldPwInput.style.display = 'block';
    oldPwInput.placeholder = '舊密碼（驗證用）';
    removePwBtn.style.display = 'inline-flex';
    document.getElementById('pw-action-label').textContent = '變更密碼';
  }

  document.getElementById('btn-save-password').addEventListener('click', async () => {
    const pwNew = document.getElementById('pw-new').value;
    const pwConfirm = document.getElementById('pw-confirm').value;
    const pwHint = document.getElementById('pw-hint').value.trim();
    const errorEl = document.getElementById('pw-error');

    errorEl.style.display = 'none';

    if (hasPassword) {
      const pwOld = oldPwInput.value;
      const oldHash = await sha256(pwOld);
      if (oldHash !== data.passwordHash) {
        errorEl.textContent = '舊密碼錯誤，請重試。';
        errorEl.style.display = 'block';
        return;
      }
    }

    if (!pwNew) {
      errorEl.textContent = '密碼不得為空。';
      errorEl.style.display = 'block';
      return;
    }
    if (pwNew !== pwConfirm) {
      errorEl.textContent = '兩次密碼輸入不一致。';
      errorEl.style.display = 'block';
      return;
    }

    const hash = await sha256(pwNew);
    await chrome.storage.local.set({ passwordHash: hash, passwordHint: pwHint });

    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
    oldPwInput.value = '';

    showFeedback('pw-saved');
    setTimeout(() => renderPasswordTab(), 1500);
  });

  removePwBtn.addEventListener('click', async () => {
    const pwOld = oldPwInput.value;
    const oldHash = await sha256(pwOld);
    const errorEl = document.getElementById('pw-error');

    if (oldHash !== data.passwordHash) {
      errorEl.textContent = '密碼錯誤，無法移除。';
      errorEl.style.display = 'block';
      return;
    }

    await chrome.storage.local.set({ passwordHash: null, passwordHint: '' });
    showFeedback('pw-saved');
    setTimeout(() => renderPasswordTab(), 1500);
  });
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function showFeedback(id) {
  const el = document.getElementById(id);
  el.style.display = 'inline';
  setTimeout(() => { el.style.display = 'none'; }, 2000);
}
