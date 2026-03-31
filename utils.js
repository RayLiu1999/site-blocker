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
 * 將 pattern 轉換為正則表達式
 * 支援 *.example.com 與 example.com/* 等萬用字元
 * @param {string} pattern
 * @returns {RegExp}
 */
export function patternToRegex(pattern) {
  // 移除 http:// / https:// / www. 前綴（讓比對更寬鬆）
  let p = pattern.trim();

  // 建立 escaped regex，將 * 轉為 .*
  const escaped = p
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape 特殊字元
    .replace(/\\\*/g, '.*');                  // * → .*

  return new RegExp('^' + escaped + '$', 'i');
}

/**
 * 判斷 URL 是否符合 pattern
 * @param {string} url
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchesPattern(url, pattern) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    const fullPath = hostname + urlObj.pathname;

    // 純域名模式（無路徑萬用字元）— 精確匹配特定網域 (包含 www)
    if (!pattern.includes('/') && !pattern.startsWith('*')) {
      const domain = pattern.replace(/^www\./, '');
      return hostname === domain || hostname === 'www.' + domain;
    }

    // 萬用字元前綴 *.example.com — 匹配該網域的所有子域
    if (pattern.startsWith('*.')) {
      const domain = pattern.slice(2).replace(/^www\./, '');
      return hostname === domain || hostname.endsWith('.' + domain);
    }

    // 一般 pattern 匹配（含路徑）
    const regex = patternToRegex(pattern);
    return regex.test(fullPath) || regex.test(hostname);
  } catch {
    return false;
  }
}

/**
 * 取得今天的 ISO 日期字串（YYYY-MM-DD）
 * @returns {string}
 */
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 判斷目前時間是否在排程封鎖時段內
 * @param {{ enabled: boolean, days: number[], startTime: string, endTime: string }} schedule
 * @returns {boolean}
 */
export function isInSchedule(schedule) {
  if (!schedule || !schedule.enabled) return false;

  const now = new Date();
  const day = now.getDay(); // 0=Sun

  if (!schedule.days.includes(day)) return false;

  // 兼容舊資料結構：如果只有 startTime 和 endTime，則轉為一組 timeSlots
  const timeSlots = schedule.timeSlots || [];
  if (timeSlots.length === 0 && schedule.startTime && schedule.endTime) {
    timeSlots.push({ startTime: schedule.startTime, endTime: schedule.endTime });
  }

  if (timeSlots.length === 0) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // 只要其中一個時段符合，就回傳 true
  return timeSlots.some(slot => {
    const [startH, startM] = slot.startTime.split(':').map(Number);
    const [endH, endM] = slot.endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  });
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
    password: false,
  },
  passwordHash: null,
  passwordHint: '',
  motivationalQuotes: true,
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
