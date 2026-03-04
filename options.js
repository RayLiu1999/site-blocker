// options.js

import { sha256, QUICK_BLOCK_CATEGORIES, generateId } from './utils.js';
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
      schedule: { enabled: false, days: [1,2,3,4,5], startTime: '09:00', endTime: '18:00' }
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
            schedule: { enabled: false, days: [1,2,3,4,5], startTime: '09:00', endTime: '18:00' }
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

async function renderSchedule() {
  const data = await chrome.storage.local.get('blocklist');
  const blocklist = data.blocklist || [];
  const container = document.getElementById('schedule-list');

  if (!blocklist.length) {
    container.innerHTML = '<p class="empty-hint">封鎖清單為空，請先至「封鎖清單」頁面新增網站。</p>';
    return;
  }

  container.innerHTML = '';

  blocklist.forEach((entry, index) => {
    const schedule = entry.schedule || { enabled: false, days: [1,2,3,4,5], startTime: '09:00', endTime: '18:00' };
    const div = document.createElement('div');
    div.className = 'schedule-item';

    div.innerHTML = `
      <div class="schedule-item-header">
        <span class="schedule-item-pattern">${entry.pattern}</span>
        <label class="toggle-small">
          <input type="checkbox" class="schedule-enabled" data-index="${index}" ${schedule.enabled ? 'checked' : ''} />
          <span class="slider"></span>
        </label>
        <span style="font-size:12px;color:var(--text-muted);">${schedule.enabled ? '排程啟用' : '排程停用'}</span>
      </div>
      <div class="schedule-body" style="${schedule.enabled ? '' : 'opacity:0.4;pointer-events:none;'}">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">封鎖星期</div>
        <div class="schedule-days">
          ${DAY_LABELS.map((d, i) => `
            <label class="day-label">
              <input type="checkbox" class="day-check" data-index="${index}" data-day="${i}" ${(schedule.days || []).includes(i) ? 'checked' : ''} />
              ${d}
            </label>
          `).join('')}
        </div>
        <div class="schedule-time-row">
          <span style="font-size:12px;color:var(--text-muted);">時段：</span>
          <input type="time" class="text-input w120 schedule-start" data-index="${index}" value="${schedule.startTime || '09:00'}" />
          <span>—</span>
          <input type="time" class="text-input w120 schedule-end" data-index="${index}" value="${schedule.endTime || '18:00'}" />
        </div>
      </div>
    `;

    container.appendChild(div);
  });

  // Event listeners for schedule changes
  container.querySelectorAll('.schedule-enabled').forEach(el => {
    el.addEventListener('change', () => saveScheduleChange(container, blocklist));
  });
  container.querySelectorAll('.day-check').forEach(el => {
    el.addEventListener('change', () => saveScheduleChange(container, blocklist));
  });
  container.querySelectorAll('.schedule-start, .schedule-end').forEach(el => {
    el.addEventListener('change', () => saveScheduleChange(container, blocklist));
  });
}

async function saveScheduleChange(container, blocklist) {
  const updatedList = [...blocklist];

  container.querySelectorAll('.schedule-item').forEach((item, index) => {
    const enabledEl = item.querySelector('.schedule-enabled');
    if (!enabledEl) return;

    const enabled = enabledEl.checked;
    const days = [];
    item.querySelectorAll('.day-check').forEach(dc => {
      if (dc.checked) days.push(parseInt(dc.dataset.day));
    });
    const startTime = item.querySelector('.schedule-start')?.value || '09:00';
    const endTime = item.querySelector('.schedule-end')?.value || '18:00';

    updatedList[index] = {
      ...updatedList[index],
      schedule: { enabled, days, startTime, endTime }
    };

    // Toggle body opacity
    const body = item.querySelector('.schedule-body');
    if (body) {
      body.style.opacity = enabled ? '1' : '0.4';
      body.style.pointerEvents = enabled ? '' : 'none';
    }
    const label = item.querySelector('.schedule-item-header span:last-child');
    if (label) label.textContent = enabled ? '排程啟用' : '排程停用';
  });

  await chrome.storage.local.set({ blocklist: updatedList });
  await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
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
