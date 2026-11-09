import assert from 'node:assert/strict';
import test from 'node:test';
import { installChromeMock, mockDate, EXTENSION_ORIGIN } from './helpers/chrome-mock.mjs';

const BLOCKED_PAGE = EXTENSION_ORIGIN + 'blocked.html';
const slot = (startTime, endTime) => ({ startTime, endTime });
// 只在週一 09:00–10:00 封鎖
const mondayMorning = { enabled: true, daySchedules: { 1: { enabled: true, timeSlots: [slot('09:00', '10:00')] } } };

test('background blocking behaviour', async t => {
  const clock = mockDate(t, new Date(2026, 0, 5, 15)); // 週一 15:00
  const chromeMock = installChromeMock({});
  t.after(() => { delete globalThis.chrome; });
  await import('../background.js');

  const rebuild = async () => assert.deepEqual(await chromeMock.send({ type: 'REBUILD_RULES' }), { ok: true });

  await t.test('whitelist allows listed sites even when typed directly, and blocks everything else', async () => {
    chromeMock.reset({
      enabled: true,
      mode: 'whitelist',
      whitelist: [{ id: 'a', pattern: 'docs.example.com' }, { id: 'b', pattern: '*.allowed.example' }],
    });
    await rebuild();

    assert.equal(chromeMock.isBlocked('https://docs.example.com/page'), false);
    assert.equal(chromeMock.isBlocked('https://www.docs.example.com/'), false);
    assert.equal(chromeMock.isBlocked('https://allowed.example/'), false);
    assert.equal(chromeMock.isBlocked('https://deep.sub.allowed.example/x'), false);
    assert.equal(chromeMock.isBlocked('https://other.example/'), true);
    assert.equal(chromeMock.isBlocked('https://docs.example.com.evil.test/'), true);
  });

  await t.test('redirects carry the full original URL in the hash', async () => {
    chromeMock.reset({ enabled: true, mode: 'blocklist', blocklist: [{ id: 'y', pattern: '*.youtube.com' }] });
    await rebuild();
    const [rule] = chromeMock.rules;
    assert.equal(rule.action.redirect.regexSubstitution, `${BLOCKED_PAGE}#\\0`);
    const url = 'https://m.youtube.com/watch?v=abc&t=10';
    const match = url.match(new RegExp(rule.condition.regexFilter, 'i'));
    assert.equal(match[0], url);
  });

  await t.test('invalid stored patterns are skipped instead of breaking every rule', async () => {
    chromeMock.reset({
      enabled: true,
      mode: 'blocklist',
      blocklist: [{ id: '1', pattern: '' }, { id: '2', pattern: 'foo bar' }, { id: '3', pattern: 'HTTPS://Valid.Example/' }, { id: '4' }],
    });
    await rebuild();
    assert.equal(chromeMock.rules.length, 1);
    assert.equal(chromeMock.isBlocked('https://valid.example/'), true);
  });

  await t.test('a failing batch update falls back to adding rules one by one', async () => {
    chromeMock.reset({
      enabled: true,
      mode: 'blocklist',
      blocklist: [{ id: '1', pattern: 'one.example' }, { id: '2', pattern: 'two.example' }],
    });
    let calls = 0;
    chromeMock.hooks.beforeUpdateRules = ({ addRules }) => {
      calls++;
      if (addRules.length > 1) throw new Error('simulated batch failure');
    };
    t.after(() => { chromeMock.hooks.beforeUpdateRules = null; });
    await rebuild();
    chromeMock.hooks.beforeUpdateRules = null;

    assert.ok(calls > 1);
    assert.equal(chromeMock.isBlocked('https://one.example/'), true);
    assert.equal(chromeMock.isBlocked('https://two.example/'), true);
  });

  await t.test('concurrent rebuilds do not collide on rule ids', async () => {
    chromeMock.reset({
      enabled: true,
      mode: 'blocklist',
      blocklist: [{ id: '1', pattern: 'a.example' }, { id: '2', pattern: 'b.example' }],
    });
    chromeMock.hooks.beforeUpdateRules = () => new Promise(resolve => setTimeout(resolve, 5));
    const results = await Promise.all([1, 2, 3].map(() => chromeMock.send({ type: 'REBUILD_RULES' })));
    chromeMock.hooks.beforeUpdateRules = null;
    assert.deepEqual(results, [{ ok: true }, { ok: true }, { ok: true }]);
    assert.equal(chromeMock.rules.length, 2);
  });

  await t.test('focus phase blocks every entry regardless of schedule; break unblocks', async () => {
    chromeMock.reset({
      enabled: true,
      mode: 'blocklist',
      blocklist: [{ id: 's', pattern: 'scheduled.example', schedule: mondayMorning }],
    });
    await rebuild();
    assert.equal(chromeMock.isBlocked('https://scheduled.example/'), false);

    await chromeMock.send({ type: 'START_FOCUS', focusDuration: 25, breakDuration: 5 });
    assert.equal(chromeMock.data.focusMode.phase, 'focus');
    assert.equal(chromeMock.isBlocked('https://scheduled.example/'), true);

    await chromeMock.fireAlarm('focus-timer');
    assert.equal(chromeMock.data.focusMode.phase, 'break');
    assert.equal(chromeMock.rules.length, 0);
    assert.equal(chromeMock.data.stats.daily['2026-01-05'].focusSessions, 1);

    await chromeMock.send({ type: 'STOP_FOCUS' });
    assert.equal(chromeMock.data.focusMode.isRunning, false);
    assert.equal(chromeMock.isBlocked('https://scheduled.example/'), false);
  });

  await t.test('snooze removes rules until its alarm fires', async () => {
    chromeMock.reset({ enabled: true, mode: 'blocklist', blocklist: [{ id: '1', pattern: 'snooze.example' }] });
    await chromeMock.send({ type: 'START_SNOOZE', minutes: 5 });
    assert.equal(chromeMock.rules.length, 0);
    assert.ok(chromeMock.alarms.has('snooze-end'));

    await chromeMock.fireAlarm('snooze-end');
    assert.equal(chromeMock.data.snoozeUntil, undefined);
    assert.equal(chromeMock.isBlocked('https://snooze.example/'), true);
  });

  await t.test('open tabs and SPA navigations to blocked sites are redirected', async () => {
    chromeMock.reset({ enabled: true, mode: 'blocklist', blocklist: [{ id: '1', pattern: 'youtube.com/shorts*' }] });
    chromeMock.setTabs([
      { id: 1, url: 'https://www.youtube.com/shorts/abc' },
      { id: 2, url: 'https://www.youtube.com/watch?v=1' },
      { id: 3, url: 'chrome://newtab/' },
    ]);
    chromeMock.tabUpdates.length = 0;
    await rebuild();
    assert.deepEqual(chromeMock.tabUpdates, [{ tabId: 1, url: `${BLOCKED_PAGE}#https://www.youtube.com/shorts/abc` }]);

    chromeMock.tabUpdates.length = 0;
    for (const fn of chromeMock.listeners.tabUpdated) {
      await fn(2, { url: 'https://www.youtube.com/shorts/xyz' });
      await fn(2, { url: 'https://www.youtube.com/watch?v=2' });
    }
    assert.deepEqual(chromeMock.tabUpdates, [{ tabId: 2, url: `${BLOCKED_PAGE}#https://www.youtube.com/shorts/xyz` }]);
    chromeMock.setTabs([]);
  });

  await t.test('startup restores a lost focus alarm, or advances an expired phase', async () => {
    const future = Date.now() + 10 * 60 * 1000;
    chromeMock.reset({
      enabled: true,
      mode: 'blocklist',
      blocklist: [],
      focusMode: { focusDuration: 25, breakDuration: 5, isRunning: true, phase: 'focus', endTime: future },
    });
    chromeMock.alarms.clear();
    for (const fn of chromeMock.listeners.startup) await fn();
    assert.equal(chromeMock.alarms.get('focus-timer').when, future);
    assert.ok(chromeMock.alarms.has('schedule-check'));

    chromeMock.reset({
      enabled: true,
      mode: 'blocklist',
      blocklist: [],
      focusMode: { focusDuration: 25, breakDuration: 5, isRunning: true, phase: 'focus', endTime: Date.now() - 1000 },
    });
    chromeMock.alarms.clear();
    for (const fn of chromeMock.listeners.startup) await fn();
    assert.equal(chromeMock.data.focusMode.phase, 'break');
    assert.ok(chromeMock.alarms.get('focus-timer').when > Date.now());
  });

  await t.test('install fills in missing defaults without overwriting existing settings', async () => {
    chromeMock.reset({ blocklist: [{ id: 'keep', pattern: 'keep.example' }], mode: 'whitelist' });
    for (const fn of chromeMock.listeners.installed) await fn({ reason: 'update' });
    assert.equal(chromeMock.data.enabled, true);
    assert.equal(chromeMock.data.mode, 'whitelist');
    assert.equal(chromeMock.data.blocklist[0].pattern, 'keep.example');
    assert.equal(chromeMock.data.breakSettings.type, 'cooldown');
  });

  void clock;
});
