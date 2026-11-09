// utils.js — 共用函式：hash、時間比對、萬用字元匹配

/**
 * 計算字串的 SHA-256 hash（16進位字串）
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 將使用者輸入的網址 / 網域整理成統一格式；無效時回傳 null。
 * 規則：
 *   - example.com        → 只比對 example.com 與 www.example.com
 *   - *.example.com      → 比對 example.com 與所有子網域
 *   - example.com/path*  → 比對該網域（含 www）下以 /path 開頭的網址，* 為萬用字元
 * 會去除 scheme、www.、port、結尾的 / 或 /*，並轉小寫、將國際化網域轉為 punycode。
 * @param {string} input
 * @returns {string|null}
 */
export function normalizePattern(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;

  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split('#')[0];

  let wildcardSubdomains = false;
  if (s.startsWith('*.')) {
    wildcardSubdomains = true;
    s = s.slice(2);
  }

  const restIndex = s.search(/[/?]/);
  let host = restIndex === -1 ? s : s.slice(0, restIndex);
  let rest = restIndex === -1 ? '' : s.slice(restIndex);

  host = host.replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  if (!host || host.includes('*')) return null;

  try {
    host = new URL('http://' + host).hostname;
  } catch {
    return null;
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host)) return null;

  rest = rest.replace(/\/\*$/, '/');
  if (rest === '/') rest = '';
  if (rest.startsWith('?')) rest = '/' + rest;
  if (/\s/.test(rest)) return null;

  return (wildcardSubdomains ? '*.' : '') + host + rest;
}

function escapeRegex(text) {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 將 pattern 轉為 regex 字串（同時相容 JS RegExp 與 DNR 使用的 RE2）。
 * regex 會比對整個網址，讓 DNR 的 regexSubstitution \0 能帶出完整原始網址。
 * @param {string} pattern
 * @returns {string|null}
 */
export function patternToRegexSource(pattern) {
  const normalized = normalizePattern(pattern);
  if (!normalized) return null;

  const wildcardSubdomains = normalized.startsWith('*.');
  const body = wildcardSubdomains ? normalized.slice(2) : normalized;
  const restIndex = body.indexOf('/');
  const host = restIndex === -1 ? body : body.slice(0, restIndex);
  const path = restIndex === -1 ? '' : body.slice(restIndex);

  const hostRe = (wildcardSubdomains ? '(?:[^/?#@]+\\.)?' : '(?:www\\.)?') + escapeRegex(host);
  const pathRe = path
    ? path.split('*').map(escapeRegex).join('.*') + '.*'
    : '(?:[/?#].*)?';

  return `^https?://${hostRe}(?::\\d+)?${pathRe}$`;
}

/**
 * 將 pattern 轉換為正則表達式；無效 pattern 回傳 null
 * @param {string} pattern
 * @returns {RegExp|null}
 */
export function patternToRegex(pattern) {
  const source = patternToRegexSource(pattern);
  return source ? new RegExp(source, 'i') : null;
}

/**
 * 判斷 URL 是否符合 pattern（與 DNR 規則使用同一個 regex）
 * @param {string} url
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchesPattern(url, pattern) {
  const regex = patternToRegex(pattern);
  return !!regex && typeof url === 'string' && regex.test(url);
}

/**
 * 取得本地日期字串（YYYY-MM-DD）
 * @param {Date} [date]
 * @returns {string}
 */
export function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 取得今天的本地日期字串（YYYY-MM-DD）
 * @returns {string}
 */
export function todayStr() {
  return localDateStr();
}

/**
 * 將輸入轉為範圍內的整數，無法解析時回傳 fallback
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * 統一每週排程格式，並將舊版共用時段複製到各星期；不修改來源資料。
 * daySchedules 的 key 為 0（日）至 6（六），各日分別儲存啟用狀態與時段。
 * @param {object} [schedule]
 * @returns {{ enabled: boolean, daySchedules: Object<string, { enabled: boolean, timeSlots: Array<{ startTime: string, endTime: string }> }> }}
 */
export function normalizeSchedule(schedule = {}) {
  const legacyDays = Array.isArray(schedule.days) ? schedule.days : [1, 2, 3, 4, 5];
  let legacySlots = schedule.timeSlots;
  if (!Array.isArray(legacySlots) || legacySlots.length === 0) {
    if (schedule.startTime && schedule.endTime) {
      legacySlots = [{ startTime: schedule.startTime, endTime: schedule.endTime }];
    } else if (!Array.isArray(legacySlots)) {
      legacySlots = [{ startTime: '09:00', endTime: '18:00' }];
    }
  }

  const daySchedules = {};
  for (let day = 0; day < 7; day++) {
    const daily = schedule.daySchedules?.[day];
    const slots = schedule.daySchedules
      ? (Array.isArray(daily?.timeSlots) ? daily.timeSlots : [])
      : legacySlots;

    daySchedules[day] = {
      enabled: schedule.daySchedules ? daily?.enabled === true : legacyDays.includes(day),
      timeSlots: slots.map(slot => ({
        startTime: typeof slot?.startTime === 'string' ? slot.startTime : '',
        endTime: typeof slot?.endTime === 'string' ? slot.endTime : '',
      })),
    };
  }

  return { enabled: schedule.enabled === true, daySchedules };
}

/**
 * 判斷本地時間是否在當日排程內；起點包含、終點不包含（23:59 視為當日結束，包含最後一分鐘）。
 * 同時支援 daySchedules 與舊版 days / timeSlots / startTime / endTime。
 * @param {object} schedule
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isInSchedule(schedule, now = new Date()) {
  if (!schedule?.enabled) return false;

  const daily = normalizeSchedule(schedule).daySchedules[now.getDay()];
  if (!daily?.enabled) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

  return daily.timeSlots.some(slot => {
    if (!validTime.test(slot.startTime) || !validTime.test(slot.endTime)) return false;
    const [startH, startM] = slot.startTime.split(':').map(Number);
    const [endH, endM] = slot.endTime.split(':').map(Number);
    const end = endH * 60 + endM;
    return nowMinutes >= startH * 60 + startM && nowMinutes < (end === 23 * 60 + 59 ? 24 * 60 : end);
  });
}

/**
 * 取得目前所在排程時段的結束時間（HH:MM）；不在任何時段內時回傳 null。
 * 若有多個時段同時涵蓋現在，回傳最晚結束的那個。
 * @param {object} schedule
 * @param {Date} [now]
 * @returns {string|null}
 */
export function currentSlotEnd(schedule, now = new Date()) {
  if (!isInSchedule(schedule, now)) return null;
  const daily = normalizeSchedule(schedule).daySchedules[now.getDay()];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = t => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const ends = daily.timeSlots
    .filter(slot => isInSchedule({ enabled: true, daySchedules: { [now.getDay()]: { enabled: true, timeSlots: [slot] } } }, now))
    .map(slot => slot.endTime)
    .sort((a, b) => toMinutes(b) - toMinutes(a));
  return ends.length && toMinutes(ends[0]) > nowMinutes ? ends[0] : null;
}

/**
 * 計算目前的封鎖狀態。
 * - 停用、暫時解除中、專注休息階段 → 不封鎖
 * - 專注階段 → 封鎖清單全部生效（忽略排程）
 * - 其他時間 → 依各網站排程
 * @param {object} data storage 內容
 * @param {number} [now]
 * @returns {{ active: boolean, reason?: string, mode?: 'blocklist'|'whitelist', patterns?: string[] }}
 */
export function getBlockingState(data = {}, now = Date.now()) {
  const { enabled, mode, blocklist = [], whitelist = [], focusMode, snoozeUntil } = data;
  if (!enabled) return { active: false, reason: 'disabled' };
  if (snoozeUntil && now < snoozeUntil) return { active: false, reason: 'snooze' };
  if (focusMode?.isRunning && focusMode.phase === 'break') return { active: false, reason: 'break' };

  const validPatterns = entries => entries
    .map(e => normalizePattern(e?.pattern))
    .filter(Boolean);

  if (mode === 'whitelist') {
    return { active: true, mode: 'whitelist', patterns: validPatterns(whitelist) };
  }

  const focusing = !!(focusMode?.isRunning && focusMode.phase === 'focus');
  const date = new Date(now);
  const activeEntries = blocklist.filter(e =>
    focusing || !e?.schedule?.enabled || isInSchedule(e.schedule, date));
  return { active: true, mode: 'blocklist', patterns: validPatterns(activeEntries) };
}

/**
 * 依封鎖狀態判斷網址是否應封鎖（只處理 http / https）
 * @param {ReturnType<typeof getBlockingState>} state
 * @param {string} url
 * @returns {boolean}
 */
export function shouldBlockUrl(state, url) {
  if (!state?.active || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  const matched = state.patterns.some(p => matchesPattern(url, p));
  return state.mode === 'whitelist' ? !matched : matched;
}

/**
 * 從 URL 萃取主機名（去除 www.）
 * @param {string} url
 * @returns {string}
 */
export function extractHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * 產生 UUID v4
 * @returns {string}
 */
export function generateId() {
  return crypto.randomUUID();
}

/**
 * 預設資料結構
 */
export const DEFAULT_STORAGE = {
  enabled: true,
  mode: 'blocklist',
  blocklist: [],
  whitelist: [],
  focusMode: {
    focusDuration: 25,
    breakDuration: 5,
    isRunning: false,
    sessionStart: null,
    phase: 'focus',
    endTime: null,
  },
  breakSettings: {
    type: 'cooldown',
    cooldownSeconds: 30,
    timedMinutes: 5,
  },
  passwordHash: null,
  passwordHint: '',
  motivationalQuotes: true,
  showFloatingTimer: true,
  stats: {
    daily: {}
  }
};

/**
 * 內建激勵語句
 */
export const MOTIVATIONAL_QUOTES = [
  '專注是成功的關鍵。',
  '分心的代價比你想像的更高。',
  '你的目標比那個網站更重要。',
  '一次只做一件事，做到最好。',
  '今天的努力，是明天的成果。',
  '保持專注，保持前進。',
  'Stay focused. Stay sharp.',
  'Your future self will thank you.',
  'One task at a time.',
  'Discipline is freedom.',
];

/**
 * 隨機取一條激勵語句
 * @returns {string}
 */
export function randomQuote() {
  return MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
}

/**
 * 預設分類快速封鎖清單
 */
export const QUICK_BLOCK_CATEGORIES = {
  social: {
    label: 'Social Media',
    domains: ['facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'reddit.com', 'threads.net', 'linkedin.com']
  },
  news: {
    label: 'News',
    domains: ['cnn.com', 'bbc.com', 'news.yahoo.com', 'foxnews.com', 'nbcnews.com', 'apnews.com']
  },
  video: {
    label: 'Video / Streaming',
    domains: ['youtube.com', 'netflix.com', 'twitch.tv', 'hulu.com', 'disneyplus.com', 'primevideo.com']
  },
  gaming: {
    label: 'Gaming',
    domains: ['twitch.tv', 'steampowered.com', 'ign.com', 'gamespot.com', 'roblox.com']
  }
};
