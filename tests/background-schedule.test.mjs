import assert from 'node:assert/strict';
import test from 'node:test';
import { installChromeMock, mockDate } from './helpers/chrome-mock.mjs';

test('background rules follow each website’s weekday schedule', async t => {
  const clock = mockDate(t, new Date(2026, 0, 5, 10));
  const { RealDate } = clock;

  const slot = (startTime, endTime) => ({ startTime, endTime });
  const chromeMock = installChromeMock({
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
  });
  t.after(() => { delete globalThis.chrome; });
  await import('../background.js');

  const hosts = ['always.example', 'first.example', 'legacy.example', 'second.example'];
  const blockedDomains = () => hosts.filter(host => chromeMock.isBlocked(`https://${host}/`));

  async function rebuildAt(day, hour, minute = 0) {
    clock.set(new RealDate(2026, 0, 4 + day, hour, minute));
    assert.deepEqual(await chromeMock.send({ type: 'REBUILD_RULES' }), { ok: true });
    return blockedDomains();
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
    clock.set(new RealDate(2026, 0, 5, 17));
    await chromeMock.fireAlarm('schedule-check');
    assert.deepEqual(blockedDomains(), ['always.example', 'second.example']);
  });
  await t.test('unselected weekdays leave only all-day entries blocked', async () => {
    assert.deepEqual(await rebuildAt(3, 10), ['always.example']);
  });
});
