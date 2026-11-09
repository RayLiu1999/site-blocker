// 測試用的 chrome.* API mock：儲存、alarms、tabs 與 DNR 動態規則

export const EXTENSION_ORIGIN = 'chrome-extension://sitefocus-test/';

export function installChromeMock(initialData = {}) {
  let data = structuredClone(initialData);
  let rules = [];
  let tabs = [];
  const alarms = new Map();
  const tabUpdates = [];
  const listeners = { message: null, installed: [], startup: [], alarm: [], tabUpdated: [] };
  const hooks = { beforeUpdateRules: null };

  const pick = keys => {
    if (keys == null) return structuredClone(data);
    const list = typeof keys === 'string' ? [keys] : keys;
    return Object.fromEntries(list.filter(k => k in data).map(k => [k, structuredClone(data[k])]));
  };
  const listener = list => ({ addListener: fn => list.push(fn) });

  globalThis.chrome = {
    runtime: {
      getURL: path => EXTENSION_ORIGIN + path,
      getManifest: () => ({ version: 'test' }),
      onInstalled: listener(listeners.installed),
      onStartup: listener(listeners.startup),
      onMessage: { addListener: fn => { listeners.message = fn; } },
    },
    alarms: {
      onAlarm: listener(listeners.alarm),
      create: async (name, info) => { alarms.set(name, info); },
      get: async name => (alarms.has(name) ? { name, ...alarms.get(name) } : undefined),
      clear: async name => alarms.delete(name),
    },
    storage: {
      local: {
        get: async keys => pick(keys),
        set: async obj => { Object.assign(data, structuredClone(obj)); },
        remove: async keys => { for (const k of [].concat(keys)) delete data[k]; },
      },
    },
    declarativeNetRequest: {
      MAX_NUMBER_OF_REGEX_RULES: 1000,
      getDynamicRules: async () => structuredClone(rules),
      updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => {
        await hooks.beforeUpdateRules?.({ removeRuleIds, addRules });
        const next = rules.filter(rule => !removeRuleIds.includes(rule.id));
        for (const rule of addRules) {
          if (next.some(r => r.id === rule.id)) throw new Error(`Rule with id ${rule.id} already exists`);
          new RegExp(rule.condition.regexFilter); // 無效 regex 會丟出錯誤，模擬整批失敗
          next.push(structuredClone(rule));
        }
        rules = next;
      },
    },
    tabs: {
      query: async () => structuredClone(tabs),
      update: async (tabId, props) => { tabUpdates.push({ tabId, ...props }); },
      onUpdated: listener(listeners.tabUpdated),
    },
    notifications: { create: () => {} },
  };

  return {
    hooks,
    listeners,
    alarms,
    tabUpdates,
    get data() { return data; },
    get rules() { return rules; },
    reset(next) { data = structuredClone(next); },
    setTabs(next) { tabs = structuredClone(next); },
    send(msg) { return new Promise(resolve => listeners.message(msg, {}, resolve)); },
    async fireAlarm(name) { for (const fn of listeners.alarm) await fn({ name }); },
    /** 依目前的 DNR 規則判斷該網址是否會被導向封鎖頁（模擬優先度與 allow 規則） */
    isBlocked(url) {
      const matched = rules.filter(r =>
        r.condition.resourceTypes.includes('main_frame') && new RegExp(r.condition.regexFilter, 'i').test(url));
      if (!matched.length) return false;
      const top = Math.max(...matched.map(r => r.priority));
      const winners = matched.filter(r => r.priority === top);
      return !winners.some(r => r.action.type === 'allow') && winners.some(r => r.action.type === 'redirect');
    },
  };
}

/** 讓 Date / Date.now 回傳指定的本地時間 */
export function mockDate(t, initial) {
  const RealDate = Date;
  let current = initial;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [current.getTime()])); }
    static now() { return current.getTime(); }
  };
  t.after(() => { globalThis.Date = RealDate; });
  return {
    RealDate,
    set(date) { current = date; },
  };
}
