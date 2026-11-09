// options.js — 所有事件只在初始化時綁定一次，render 函式只負責更新畫面

import {
  sha256, QUICK_BLOCK_CATEGORIES, generateId, normalizeSchedule, normalizePattern, clampInt,
} from './utils.js';
import { getStatsForDays, clearStats } from './stats.js';

const $ = id => document.getElementById(id);
const listKey = mode => (mode === 'whitelist' ? 'whitelist' : 'blocklist');
const CATEGORY_LABELS = { social: '社群', news: '新聞', video: '影音', gaming: '遊戲' };

document.addEventListener('DOMContentLoaded', async () => {
  const { passwordHash, passwordHint } = await chrome.storage.local.get(['passwordHash', 'passwordHint']);
  if (passwordHash) await waitForUnlock(passwordHash, passwordHint);
  $('options-layout').hidden = false;
  await start();
});

async function start() {
  setupNavigation();
  setupBlocklistTab();
  setupCategoryButtons();
  setupExportImport();
  setupScheduleTab();
  setupFocusTab();
  setupBreakTab();
  setupStatsTab();
  setupPasswordTab();
  $('about-version').textContent = `版本 ${chrome.runtime.getManifest().version}`;

  await Promise.all([renderBlocklist(), renderSchedule(), loadFocusSettings(), loadBreakSettings(), refreshPasswordTab()]);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (['blocklist', 'whitelist', 'mode', 'ruleStatus'].some(key => key in changes)) renderBlocklist();
  });
}

// ─────────────────────────────────────────────
// 密碼鎖
// ─────────────────────────────────────────────
function waitForUnlock(passwordHash, passwordHint) {
  $('lock-screen').hidden = false;
  if (passwordHint) {
    $('lock-hint').textContent = `提示：${passwordHint}`;
    $('lock-hint').hidden = false;
  }
  const input = $('lock-input');
  input.focus();

  return new Promise(resolve => {
    $('lock-form').addEventListener('submit', async event => {
      event.preventDefault();
      if ((await sha256(input.value)) === passwordHash) {
        $('lock-screen').hidden = true;
        input.value = '';
        resolve();
      } else {
        $('lock-error').hidden = false;
        input.value = '';
        input.focus();
      }
    });
  });
}

// ─────────────────────────────────────────────
// 分頁切換
// ─────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => showTab(item.dataset.tab));
  });
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.goto));
  });
}

function showTab(tab) {
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.dataset.tab === tab) n.setAttribute('aria-current', 'page');
    else n.removeAttribute('aria-current');
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));

  if (tab === 'stats') renderStats(currentStatsPeriod());
  if (tab === 'schedule') renderSchedule();
}

// ─────────────────────────────────────────────
// 封鎖清單
// ─────────────────────────────────────────────
function setupBlocklistTab() {
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      await chrome.storage.local.set({ mode: radio.value });
      await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
      await renderBlocklist();
    });
  });

  $('add-pattern-form').addEventListener('submit', async event => {
    event.preventDefault();
    await addPattern();
  });

  $('new-pattern').addEventListener('input', () => { $('add-error').hidden = true; });

  // 刪除按鈕使用事件委派，清單重新渲染也不需重新綁定
  $('blocklist-items').addEventListener('click', async event => {
    const btn = event.target.closest('button[data-delete-id]');
    if (!btn) return;
    const data = await chrome.storage.local.get(['mode', 'blocklist', 'whitelist']);
    const key = listKey(data.mode);
    await chrome.storage.local.set({ [key]: (data[key] || []).filter(e => e.id !== btn.dataset.deleteId) });
    await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
    await renderBlocklist();
  });
}

async function addPattern() {
  const input = $('new-pattern');
  const pattern = normalizePattern(input.value);
  if (!pattern) {
    showAddError(input.value.trim()
      ? '無法辨識這個網址。請輸入像 youtube.com、*.reddit.com 或 youtube.com/shorts* 的格式。'
      : '請先輸入網址。');
    return;
  }

  const data = await chrome.storage.local.get(['mode', 'blocklist', 'whitelist']);
  const key = listKey(data.mode);
  const list = data[key] || [];
  if (list.some(e => normalizePattern(e.pattern) === pattern)) {
    showAddError(`${pattern} 已經在清單裡了。`);
    return;
  }

  list.push({ id: generateId(), pattern, category: 'manual', schedule: normalizeSchedule() });
  await chrome.storage.local.set({ [key]: list });
  await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
  input.value = '';
  await renderBlocklist();
}

function showAddError(message) {
  $('add-error').textContent = message;
  $('add-error').hidden = false;
  $('new-pattern').focus();
}

async function renderBlocklist() {
  const data = await chrome.storage.local.get(['mode', 'blocklist', 'whitelist', 'ruleStatus']);
  const mode = data.mode === 'whitelist' ? 'whitelist' : 'blocklist';
  const isWL = mode === 'whitelist';
  const list = data[listKey(mode)] || [];

  $(`mode-${mode}`).checked = true;
  $('list-display-title').textContent = isWL ? '白名單' : '封鎖清單';
  $('list-display-desc').textContent = isWL
    ? '只有清單內的網站可以開啟，其他網站一律封鎖。'
    : '清單內的網站會被封鎖，可以搭配排程只在特定時段封鎖。';
  $('add-list-title').textContent = isWL ? '加入白名單' : '加入封鎖清單';
  $('category-block').hidden = isWL;

  const skipped = data.ruleStatus?.skipped || 0;
  $('rule-limit-warning').hidden = skipped === 0;
  $('rule-limit-warning').textContent = `網站數量超過瀏覽器的規則上限，最後 ${skipped} 筆目前沒有生效。請刪除不需要的網站，或改用 *.網域 合併子網域。`;

  $('list-count').textContent = list.length;
  $('blocklist-empty').hidden = list.length > 0;

  const listEl = $('blocklist-items');
  listEl.replaceChildren(...list.map(entry => renderSiteItem(entry, isWL)));
}

function renderSiteItem(entry, isWhitelist) {
  const li = document.createElement('li');
  li.className = 'site-item';

  const name = document.createElement('span');
  name.className = 'site-item-pattern';
  name.textContent = entry.pattern;

  const meta = document.createElement('span');
  meta.className = 'site-item-meta';
  const addTag = (text, extra = '') => {
    const tag = document.createElement('span');
    tag.className = `tag ${extra}`.trim();
    tag.textContent = text;
    meta.append(tag);
  };
  if (!normalizePattern(entry.pattern)) addTag('格式無效，未生效', 'tag-invalid');
  if (!isWhitelist && entry.schedule?.enabled) addTag('依排程', 'tag-schedule');
  if (CATEGORY_LABELS[entry.category]) addTag(CATEGORY_LABELS[entry.category]);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn-icon';
  del.dataset.deleteId = entry.id;
  del.title = `刪除 ${entry.pattern}`;
  del.setAttribute('aria-label', `刪除 ${entry.pattern}`);
  del.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  meta.append(del);

  li.append(name, meta);
  return li;
}

// ─────────────────────────────────────────────
// 快速分類
// ─────────────────────────────────────────────
function setupCategoryButtons() {
  document.querySelectorAll('.chip[data-category]').forEach(btn => {
    const label = btn.textContent;
    btn.addEventListener('click', async () => {
      const category = btn.dataset.category;
      const cat = QUICK_BLOCK_CATEGORIES[category];
      if (!cat) return;

      const data = await chrome.storage.local.get('blocklist');
      const list = data.blocklist || [];
      const existing = new Set(list.map(e => normalizePattern(e.pattern)));
      let added = 0;
      for (const domain of cat.domains) {
        if (existing.has(domain)) continue;
        list.push({ id: generateId(), pattern: domain, category, schedule: normalizeSchedule() });
        existing.add(domain);
        added++;
      }

      await chrome.storage.local.set({ blocklist: list });
      await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
      await renderBlocklist();

      btn.textContent = added ? `已加入 ${added} 個網站` : '都已在清單裡';
      btn.classList.add('is-done');
      setTimeout(() => {
        btn.textContent = label;
        btn.classList.remove('is-done');
      }, 2000);
    });
  });
}

// ─────────────────────────────────────────────
// 匯出 / 匯入
// ─────────────────────────────────────────────
function setupExportImport() {
  $('btn-export').addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['blocklist', 'whitelist', 'mode']);
    const json = JSON.stringify({
      app: 'SiteFocus',
      version: chrome.runtime.getManifest().version,
      mode: data.mode || 'blocklist',
      blocklist: data.blocklist || [],
      whitelist: data.whitelist || [],
    }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sitefocus-${new Date().toLocaleDateString('sv')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $('btn-import-trigger').addEventListener('click', () => $('btn-import').click());

  $('btn-import').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const status = $('import-status');
    status.hidden = false;
    status.classList.remove('error-msg');

    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.blocklist)) throw new Error('檔案裡找不到 blocklist 清單，請確認是 SiteFocus 匯出的檔案。');

      const blocklist = sanitizeEntries(parsed.blocklist);
      const whitelist = sanitizeEntries(Array.isArray(parsed.whitelist) ? parsed.whitelist : []);
      const mode = parsed.mode === 'whitelist' ? 'whitelist' : 'blocklist';
      const total = blocklist.valid.length + whitelist.valid.length;
      if (total === 0) throw new Error('檔案裡沒有任何有效的網址。');

      if (!confirm(`要用這個檔案取代目前的清單嗎？\n封鎖清單 ${blocklist.valid.length} 筆、白名單 ${whitelist.valid.length} 筆。`)) {
        status.hidden = true;
        return;
      }

      await chrome.storage.local.set({ blocklist: blocklist.valid, whitelist: whitelist.valid, mode });
      await chrome.runtime.sendMessage({ type: 'REBUILD_RULES' });
      await renderBlocklist();

      const skipped = blocklist.skipped + whitelist.skipped;
      status.textContent = `已匯入 ${total} 筆網址${skipped ? `，略過 ${skipped} 筆格式無效或重複的項目` : ''}。`;
    } catch (err) {
      status.classList.add('error-msg');
      status.textContent = `沒有匯入，目前的清單維持不變。${err instanceof SyntaxError ? '檔案不是有效的 JSON。' : err.message}`;
    }
  });
}

/**
 * 驗證並整理匯入的清單：正規化網址、去除重複、補上缺少的 id 與排程
 * @param {Array} entries
 * @returns {{ valid: object[], skipped: number }}
 */
function sanitizeEntries(entries) {
  const patterns = new Set();
  const ids = new Set();
  const valid = [];
  let skipped = 0;

  for (const raw of entries) {
    const pattern = normalizePattern(typeof raw === 'string' ? raw : raw?.pattern);
    if (!pattern || patterns.has(pattern)) {
      skipped++;
      continue;
    }
    let id = typeof raw?.id === 'string' && raw.id ? raw.id : generateId();
    if (ids.has(id)) id = generateId();
    patterns.add(pattern);
    ids.add(id);
    valid.push({
      id,
      pattern,
      category: typeof raw?.category === 'string' ? raw.category : 'manual',
      schedule: normalizeSchedule(raw?.schedule && typeof raw.schedule === 'object' ? raw.schedule : undefined),
    });
  }
  return { valid, skipped };
}

// ─────────────────────────────────────────────
// 排程
// ─────────────────────────────────────────────
const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];
let scheduleSaveQueue = Promise.resolve();

function setupScheduleTab() {
  const container = $('schedule-list');

  container.addEventListener('change', async event => {
    if (!event.target.matches('.schedule-enabled, .day-check, .schedule-start, .schedule-end')) return;
    const item = event.target.closest('.schedule-item');
    const dayEl = event.target.closest('.schedule-day');
    if (event.target.matches('.day-check') && event.target.checked && !dayEl.querySelector('.schedule-time-row')) {
      appendScheduleSlot(dayEl);
    }
    updateScheduleState(item);
    await saveScheduleChange(item);
  });

  container.addEventListener('click', async event => {
    const btn = event.target.closest('button');
    const item = btn?.closest('.schedule-item');
    if (!item) return;

    if (btn.matches('.apply-all-slot')) {
      if (!confirm('要把這個網站的每週排程套用到所有網站嗎？\n其他網站原本的排程會被取代。')) return;
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
  });
}

async function renderSchedule() {
  const data = await chrome.storage.local.get(['blocklist', 'mode']);
  const blocklist = data.blocklist || [];
  const container = $('schedule-list');
  $('schedule-whitelist-note').hidden = data.mode !== 'whitelist';

  if (!blocklist.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-hint';
    empty.textContent = '封鎖清單是空的，先到「封鎖清單」加入網站。';
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren(...blocklist.map(renderScheduleItem));
}

function renderScheduleItem(entry) {
  const schedule = normalizeSchedule(entry.schedule || undefined);
  const div = document.createElement('div');
  div.className = 'schedule-item';
  div.dataset.id = entry.id;

  div.innerHTML = `
    <div class="schedule-item-header">
      <span class="schedule-item-pattern"></span>
      <label class="schedule-toggle">
        <span class="schedule-status-text"></span>
        <input type="checkbox" class="switch schedule-enabled" ${schedule.enabled ? 'checked' : ''} />
      </label>
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
            <button type="button" class="btn btn-sm btn-secondary add-slot">新增時段</button>
          </fieldset>
        </div>
      `).join('')}
    </fieldset>
    <div class="schedule-item-actions">
      <button type="button" class="btn btn-sm btn-secondary apply-all-slot">套用到所有網站</button>
      <span class="schedule-feedback" role="status" aria-live="polite"></span>
    </div>
  `;

  div.querySelector('.schedule-item-pattern').textContent = entry.pattern;
  div.querySelector('.schedule-enabled').setAttribute('aria-label', `依排程封鎖 ${entry.pattern}`);
  div.querySelectorAll('.schedule-day').forEach(dayEl => {
    schedule.daySchedules[dayEl.dataset.day].timeSlots.forEach(slot => appendScheduleSlot(dayEl, slot));
  });
  updateScheduleState(div);
  return div;
}

function appendScheduleSlot(dayEl, slot = { startTime: '09:00', endTime: '18:00' }) {
  const row = document.createElement('div');
  row.className = 'schedule-time-row';
  row.innerHTML = `
    <span class="schedule-slot-label"></span>
    <input type="time" class="text-input schedule-start" required />
    <span aria-hidden="true">到</span>
    <input type="time" class="text-input schedule-end" required />
    <button type="button" class="btn-icon delete-slot"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
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
    row.querySelector('.delete-slot').title = `刪除${label}`;
  });
}

function updateScheduleState(item) {
  const enabled = item.querySelector('.schedule-enabled').checked;
  item.querySelector('.schedule-body').disabled = !enabled;
  item.querySelector('.schedule-status-text').textContent = enabled ? '依排程封鎖' : '全天封鎖';
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
    feedback.textContent = '還沒儲存：請填寫有效的開始與結束時間。';
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
    feedback.textContent = '已儲存';
    return true;
  } catch (err) {
    feedback.classList.add('has-error');
    feedback.textContent = `儲存失敗：${err.message}`;
    return false;
  }
}

// ─────────────────────────────────────────────
// 番茄鐘
// ─────────────────────────────────────────────
function setupFocusTab() {
  $('btn-save-focus').addEventListener('click', async () => {
    const focusDuration = clampInt($('focus-duration').value, 1, 120, 25);
    const breakDuration = clampInt($('break-duration').value, 1, 60, 5);
    $('focus-duration').value = focusDuration;
    $('break-duration').value = breakDuration;

    const current = await chrome.storage.local.get('focusMode');
    await chrome.storage.local.set({
      focusMode: { ...(current.focusMode || {}), focusDuration, breakDuration },
      showFloatingTimer: $('show-floating-timer').checked,
    });
    showFeedback('focus-saved', '已儲存，下一輪開始生效');
  });
}

async function loadFocusSettings() {
  const { focusMode: fm = {}, showFloatingTimer } = await chrome.storage.local.get(['focusMode', 'showFloatingTimer']);
  $('focus-duration').value = fm.focusDuration || 25;
  $('break-duration').value = fm.breakDuration || 5;
  $('show-floating-timer').checked = showFloatingTimer !== false;
}

// ─────────────────────────────────────────────
// 暫時解除
// ─────────────────────────────────────────────
function setupBreakTab() {
  document.querySelectorAll('input[name="break-type"]').forEach(radio => {
    radio.addEventListener('change', () => updateBreakHints(radio.value));
  });

  $('btn-save-break').addEventListener('click', async () => {
    const type = document.querySelector('input[name="break-type"]:checked')?.value || 'cooldown';
    const cooldownSeconds = clampInt($('cooldown-seconds').value, 5, 300, 30);
    const timedMinutes = clampInt($('timed-minutes').value, 1, 60, 5);
    $('cooldown-seconds').value = cooldownSeconds;
    $('timed-minutes').value = timedMinutes;

    await chrome.storage.local.set({ breakSettings: { type, cooldownSeconds, timedMinutes } });
    showFeedback('break-saved', '已儲存');
  });
}

async function loadBreakSettings() {
  const { breakSettings: bs = {} } = await chrome.storage.local.get('breakSettings');
  const type = ['cooldown', 'password', 'timed'].includes(bs.type) ? bs.type : 'cooldown';
  $(`break-${type}`).checked = true;
  $('cooldown-seconds').value = bs.cooldownSeconds ?? 30;
  $('timed-minutes').value = bs.timedMinutes ?? 5;
  await updateBreakHints(type);
}

async function updateBreakHints(type) {
  $('cooldown-sec-group').hidden = type !== 'cooldown';
  const { passwordHash } = await chrome.storage.local.get('passwordHash');
  $('password-setup-hint').hidden = !(type === 'password' && !passwordHash);
}

// ─────────────────────────────────────────────
// 統計
// ─────────────────────────────────────────────
function currentStatsPeriod() {
  return Number(document.querySelector('input[name="stats-period"]:checked')?.value) || 7;
}

function setupStatsTab() {
  document.querySelectorAll('input[name="stats-period"]').forEach(radio => {
    radio.addEventListener('change', () => renderStats(currentStatsPeriod()));
  });
  $('btn-clear-stats').addEventListener('click', async () => {
    if (!confirm('要清除所有統計資料嗎？這個動作無法復原。')) return;
    await clearStats();
    await renderStats(currentStatsPeriod());
  });
}

async function renderStats(days) {
  const stats = await getStatsForDays(days);

  const sum = key => stats.reduce((total, d) => total + d[key], 0);
  $('total-blocked').textContent = sum('blockedTotal');
  $('total-sessions').textContent = sum('focusSessions');
  $('total-minutes').textContent = sum('focusMinutes');

  const labelEvery = days > 7 ? 5 : 1;
  const toBars = key => stats.map((d, i) => ({
    value: d[key],
    label: (stats.length - 1 - i) % labelEvery === 0 ? `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8))}` : '',
    title: `${d.date}：${d[key]}`,
  }));
  renderBarChart($('chart-blocked'), toBars('blockedTotal'));
  renderBarChart($('chart-focus'), toBars('focusSessions'));

  const byDomain = {};
  for (const day of stats) {
    for (const [domain, count] of Object.entries(day.blockedByDomain)) {
      byDomain[domain] = (byDomain[domain] || 0) + count;
    }
  }
  const top = Object.entries(byDomain).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $('top-sites-empty').hidden = top.length > 0;
  const max = top[0]?.[1] || 1;
  $('top-sites').replaceChildren(...top.map(([domain, count]) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'top-site-name';
    name.textContent = domain;
    const track = document.createElement('span');
    track.className = 'top-site-track';
    const fill = document.createElement('span');
    fill.style.width = `${(count / max) * 100}%`;
    track.append(fill);
    const num = document.createElement('span');
    num.className = 'top-site-count';
    num.textContent = count;
    li.append(name, track, num);
    return li;
  }));
}

function renderBarChart(container, items) {
  const maxVal = Math.max(...items.map(i => i.value), 1);
  container.replaceChildren(...items.map(item => {
    const col = document.createElement('div');
    col.className = 'chart-col';
    col.title = item.title;

    const track = document.createElement('div');
    track.className = 'chart-track';
    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = item.value || '';
    const bar = document.createElement('div');
    bar.className = `chart-bar${item.value ? '' : ' is-zero'}`;
    bar.style.height = item.value ? `${(item.value / maxVal) * 100}%` : '2px';
    track.append(value, bar);

    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = item.label;

    col.append(track, label);
    return col;
  }));
}

// ─────────────────────────────────────────────
// 密碼
// ─────────────────────────────────────────────
function setupPasswordTab() {
  $('password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const { passwordHash } = await chrome.storage.local.get('passwordHash');
    const pwNew = $('pw-new').value;

    if (passwordHash && (await sha256($('pw-old').value)) !== passwordHash) {
      return showPasswordError('目前的密碼不正確。');
    }
    if (!pwNew) return showPasswordError('請輸入新密碼。');
    if (pwNew !== $('pw-confirm').value) return showPasswordError('兩次輸入的新密碼不一樣。');

    await chrome.storage.local.set({ passwordHash: await sha256(pwNew), passwordHint: $('pw-hint').value.trim() });
    clearPasswordInputs();
    showFeedback('pw-saved', passwordHash ? '密碼已變更' : '密碼已設定');
    await refreshPasswordTab();
  });

  $('btn-remove-password').addEventListener('click', async () => {
    const { passwordHash } = await chrome.storage.local.get('passwordHash');
    if (!passwordHash) return;
    if ((await sha256($('pw-old').value)) !== passwordHash) {
      return showPasswordError('請在「目前的密碼」輸入正確密碼才能移除。');
    }
    await chrome.storage.local.set({ passwordHash: null, passwordHint: '' });
    clearPasswordInputs();
    showFeedback('pw-saved', '密碼已移除');
    await refreshPasswordTab();
  });
}

async function refreshPasswordTab() {
  const { passwordHash, passwordHint } = await chrome.storage.local.get(['passwordHash', 'passwordHint']);
  const hasPassword = !!passwordHash;

  const status = $('current-password-status');
  status.textContent = hasPassword
    ? `已設定密碼${passwordHint ? `，提示：${passwordHint}` : ''}`
    : '尚未設定密碼，任何人都能修改設定。';
  status.classList.toggle('is-on', hasPassword);

  $('pw-old').hidden = !hasPassword;
  $('btn-remove-password').hidden = !hasPassword;
  $('pw-action-label').textContent = hasPassword ? '變更密碼' : '設定密碼';
  $('btn-save-password').textContent = hasPassword ? '變更密碼' : '設定密碼';
  $('pw-hint').value = passwordHint || '';
  $('pw-error').hidden = true;

  const type = document.querySelector('input[name="break-type"]:checked')?.value;
  if (type) await updateBreakHints(type);
}

function showPasswordError(message) {
  $('pw-error').textContent = message;
  $('pw-error').hidden = false;
}

function clearPasswordInputs() {
  $('pw-old').value = '';
  $('pw-new').value = '';
  $('pw-confirm').value = '';
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const feedbackTimers = {};
function showFeedback(id, text) {
  const el = $(id);
  if (text) el.textContent = text;
  el.hidden = false;
  clearTimeout(feedbackTimers[id]);
  feedbackTimers[id] = setTimeout(() => { el.hidden = true; }, 2500);
}
