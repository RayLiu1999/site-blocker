import assert from 'node:assert/strict';
import test from 'node:test';

test('background rules follow each website’s weekday schedule', async t => {
  const RealDate = Date;
  const previousChrome = globalThis.chrome;
  let currentTime = new RealDate(2026, 0, 5, 10);
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [currentTime.getTime()]));
    }
    static now() { return currentTime.getTime(); }
  };
  t.after(() => {
    globalThis.Date = RealDate;
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  });

  const slot = (startTime, endTime) => ({ startTime, endTime });
  const data = {
    enabled: true,
    mode: 'blocklist',
    blocklist: [
      {
        id: 'first', pattern: 'first.example',
        schedule: { enabled: true, daySchedules: {
          1: { enabled: true, timeSlots: [slot('09:00', '12:00')] },
          2: { enabled: true, timeSlots: [slot('14:00', '18:00')] },
        } },
      },
      {
        id: 'second', pattern: 'second.example',
        schedule: { enabled: true, daySchedules: {
          1: { enabled: true, timeSlots: [slot('16:00', '20:00')] },
        } },
      },
      {
        id: 'legacy', pattern: 'legacy.example',
        schedule: { enabled: true, days: [2], timeSlots: [slot('10:00', '11:00')] },
      },
      { id: 'always', pattern: 'always.example', schedule: { enabled: false } },
    ],
  };
  let rules = [];
  let onMessage;
  const alarmHandlers = [];
  const ignoreListener = { addListener() {} };
  globalThis.chrome = {
    runtime: {
      getURL: path => `chrome-extension://sitefocus-test/${path}`,
      onInstalled: ignoreListener,
      onStartup: ignoreListener,
      onMessage: { addListener: handler => { onMessage = handler; } },
    },
    alarms: { onAlarm: { addListener: handler => alarmHandlers.push(handler) } },
    storage: { local: { get: async () => structuredClone(data) } },
    declarativeNetRequest: {
      getDynamicRules: async () => structuredClone(rules),
      updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => {
        rules = rules.filter(rule => !removeRuleIds.includes(rule.id)).concat(addRules);
      },
    },
  };
  await import('../background.js');

  async function rebuildAt(day, hour, minute = 0) {
    currentTime = new RealDate(2026, 0, 4 + day, hour, minute);
    const response = await new Promise(resolve => onMessage({ type: 'REBUILD_RULES' }, {}, resolve));
    assert.deepEqual(response, { ok: true });
    return blockedDomains();
  }
  function blockedDomains() {
    return [...new Set(rules.map(rule => new URL(rule.condition.urlFilter.slice(1)).hostname.replace(/^www\./, '')))].sort();
  }

  await t.test('Monday morning blocks only the first site and all-day entries', async () => {
    assert.deepEqual(await rebuildAt(1, 10), ['always.example', 'first.example']);
    assert.deepEqual(await rebuildAt(1, 12), ['always.example']);
  });
  await t.test('Tuesday uses different hours and continues to accept legacy data', async () => {
    assert.deepEqual(await rebuildAt(2, 10), ['always.example', 'legacy.example']);
    assert.deepEqual(await rebuildAt(2, 15), ['always.example', 'first.example']);
  });
  await t.test('the schedule alarm refreshes rules for the other website', async () => {
    currentTime = new RealDate(2026, 0, 5, 17);
    for (const handler of alarmHandlers) await handler({ name: 'schedule-check' });
    assert.deepEqual(blockedDomains(), ['always.example', 'second.example']);
  });
  await t.test('unselected weekdays leave only all-day entries blocked', async () => {
    assert.deepEqual(await rebuildAt(3, 10), ['always.example']);
  });
});
