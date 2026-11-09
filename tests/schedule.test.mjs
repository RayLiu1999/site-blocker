import assert from 'node:assert/strict';
import test from 'node:test';
import { isInSchedule, normalizeSchedule } from '../utils.js';

const slot = (startTime, endTime) => ({ startTime, endTime });
// 2026-01-05 為週一；使用本地時間，避免依賴執行環境的時區。
const at = (day, hour, minute = 0) => new Date(2026, 0, 4 + day, hour, minute);

test('each weekday uses its own time slots', () => {
  const schedule = {
    enabled: true,
    daySchedules: {
      1: { enabled: true, timeSlots: [slot('09:00', '12:00'), slot('19:00', '20:00')] },
      2: { enabled: true, timeSlots: [slot('14:00', '18:00')] },
      3: { enabled: false, timeSlots: [slot('09:00', '18:00')] },
      0: { enabled: true, timeSlots: [slot('10:00', '11:00')] },
    },
  };

  assert.equal(isInSchedule(schedule, at(1, 10)), true);
  assert.equal(isInSchedule(schedule, at(1, 15)), false);
  assert.equal(isInSchedule(schedule, at(1, 19, 30)), true);
  assert.equal(isInSchedule(schedule, at(2, 10)), false);
  assert.equal(isInSchedule(schedule, at(2, 15)), true);
  assert.equal(isInSchedule(schedule, at(3, 10)), false);
  assert.equal(isInSchedule(schedule, at(6, 10)), false);
  assert.equal(isInSchedule(schedule, at(0, 10)), true);
});

test('time slots include the start and exclude the end', () => {
  const schedule = {
    enabled: true,
    daySchedules: { 1: { enabled: true, timeSlots: [slot('09:00', '12:00')] } },
  };
  assert.equal(isInSchedule(schedule, at(1, 8, 59)), false);
  assert.equal(isInSchedule(schedule, at(1, 9)), true);
  assert.equal(isInSchedule(schedule, at(1, 11, 59)), true);
  assert.equal(isInSchedule(schedule, at(1, 12)), false);
});

test('legacy shared slots retain all selected days and do not mutate storage data', () => {
  const legacy = { enabled: true, days: [1, 5], timeSlots: [slot('09:00', '12:00'), slot('14:00', '18:00')] };
  const before = structuredClone(legacy);
  const schedule = normalizeSchedule(legacy);

  assert.equal(schedule.enabled, true);
  assert.equal(schedule.daySchedules[1].enabled, true);
  assert.equal(schedule.daySchedules[2].enabled, false);
  assert.equal(schedule.daySchedules[5].enabled, true);
  assert.deepEqual(schedule.daySchedules[1].timeSlots, legacy.timeSlots);
  assert.equal(isInSchedule(legacy, at(1, 10)), true);
  assert.equal(isInSchedule(legacy, at(5, 15)), true);
  assert.equal(isInSchedule(legacy, at(2, 10)), false);

  schedule.daySchedules[1].timeSlots[0].startTime = '11:00';
  assert.equal(schedule.daySchedules[5].timeSlots[0].startTime, '09:00');
  assert.deepEqual(legacy, before);
});

test('legacy single start/end times still work without modifying the source', () => {
  const legacy = { enabled: true, days: [2], startTime: '13:00', endTime: '16:00', timeSlots: [] };
  const before = structuredClone(legacy);
  assert.equal(isInSchedule(legacy, at(2, 14)), true);
  assert.equal(isInSchedule(legacy, at(1, 14)), false);
  assert.equal(isInSchedule(legacy, at(2, 16)), false);
  assert.deepEqual(legacy, before);
});

test('daily settings take precedence over legacy fields, including empty schedules', () => {
  const schedule = {
    enabled: true,
    days: [1, 2],
    timeSlots: [slot('00:00', '23:59')],
    daySchedules: { 1: { enabled: true, timeSlots: [slot('14:00', '15:00')] } },
  };
  assert.equal(isInSchedule(schedule, at(1, 10)), false);
  assert.equal(isInSchedule(schedule, at(1, 14, 30)), true);
  assert.equal(isInSchedule(schedule, at(2, 14, 30)), false);
  assert.equal(isInSchedule({ ...schedule, daySchedules: {} }, at(1, 10)), false);
});

test('disabled schedules and days never match', () => {
  const schedule = normalizeSchedule();
  assert.equal(isInSchedule(undefined, at(1, 10)), false);
  assert.equal(isInSchedule(schedule, at(1, 10)), false);
  schedule.enabled = true;
  schedule.daySchedules[1].enabled = false;
  assert.equal(isInSchedule(schedule, at(1, 10)), false);
});

test('empty, invalid, reversed and equal time ranges do not match', () => {
  const invalidSlots = [
    slot('', ''), slot('25:00', '26:00'), slot('09:60', '18:00'),
    slot('09:00', '09:00'), slot('18:00', '09:00'), null,
  ];
  for (const timeSlots of [[], invalidSlots]) {
    const schedule = { enabled: true, daySchedules: { 1: { enabled: true, timeSlots } } };
    assert.equal(isInSchedule(schedule, at(1, 10)), false);
    assert.equal(isInSchedule(schedule, at(1, 20)), false);
  }
});

test('default schedules and serialization keep days and websites independent', () => {
  const first = normalizeSchedule();
  const second = normalizeSchedule();
  first.enabled = true;
  first.daySchedules[1].timeSlots.push(slot('20:00', '21:00'));
  first.daySchedules[2].timeSlots[0].startTime = '14:00';
  const restored = normalizeSchedule(JSON.parse(JSON.stringify(first)));

  assert.deepEqual(restored, first);
  assert.equal(first.daySchedules[1].timeSlots[0].startTime, '09:00');
  assert.equal(first.daySchedules[0].enabled, false);
  assert.equal(second.daySchedules[1].timeSlots.length, 1);
  assert.equal(second.daySchedules[2].timeSlots[0].startTime, '09:00');
  assert.equal(second.enabled, false);
});
