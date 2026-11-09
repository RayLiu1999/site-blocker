import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePattern, matchesPattern, patternToRegexSource, localDateStr, clampInt,
  isInSchedule, getBlockingState, shouldBlockUrl, currentSlotEnd,
} from '../utils.js';

test('normalizePattern cleans up common inputs', () => {
  assert.equal(normalizePattern('https://www.YouTube.com/'), 'youtube.com');
  assert.equal(normalizePattern('  youtube.com  '), 'youtube.com');
  assert.equal(normalizePattern('*.Reddit.com'), '*.reddit.com');
  assert.equal(normalizePattern('reddit.com/*'), 'reddit.com');
  assert.equal(normalizePattern('youtube.com:443/shorts*'), 'youtube.com/shorts*');
  assert.equal(normalizePattern('example.com/page#section'), 'example.com/page');
  assert.match(normalizePattern('巴哈姆特.tw'), /^xn--[a-z0-9-]+\.tw$/);
});

test('normalizePattern rejects input it cannot turn into a rule', () => {
  for (const input of ['', '   ', 'foo bar', '*youtube*', 'you*tube.com', 'http://', null, undefined, 42]) {
    assert.equal(normalizePattern(input), null, String(input));
  }
});

test('plain domains match the domain and www only', () => {
  const p = 'youtube.com';
  assert.equal(matchesPattern('https://youtube.com', p), true);
  assert.equal(matchesPattern('https://www.youtube.com/watch?v=1', p), true);
  assert.equal(matchesPattern('http://YOUTUBE.com:8080/x', p), true);
  assert.equal(matchesPattern('https://m.youtube.com/', p), false);
  assert.equal(matchesPattern('https://youtube.com.evil.test/', p), false);
  assert.equal(matchesPattern('https://notyoutube.com/', p), false);
  assert.equal(matchesPattern('https://google.com/?q=youtube.com', p), false);
  assert.equal(matchesPattern('chrome://youtube.com', p), false);
});

test('*.domain matches the domain and every subdomain', () => {
  const p = '*.youtube.com';
  assert.equal(matchesPattern('https://youtube.com/', p), true);
  assert.equal(matchesPattern('https://m.youtube.com/', p), true);
  assert.equal(matchesPattern('https://a.b.youtube.com/x', p), true);
  assert.equal(matchesPattern('https://youtube.community/', p), false);
});

test('path patterns match by prefix and support * wildcards', () => {
  assert.equal(matchesPattern('https://www.youtube.com/shorts/abc', 'youtube.com/shorts*'), true);
  assert.equal(matchesPattern('https://youtube.com/watch?v=1', 'youtube.com/shorts*'), false);
  assert.equal(matchesPattern('https://reddit.com/r/foo/comments/1', 'reddit.com/r/foo'), true);
  assert.equal(matchesPattern('https://reddit.com/r/bar', 'reddit.com/r/foo'), false);
  assert.equal(matchesPattern('https://reddit.com/r/anything/new', 'reddit.com/r/*/new'), true);
  assert.equal(matchesPattern('https://reddit.com/r/foo', 'Reddit.com/R/Foo'), true);
});

test('regex sources only use syntax supported by RE2', () => {
  for (const p of ['youtube.com', '*.youtube.com', 'youtube.com/shorts*', 'a.b/c?d=e']) {
    const source = patternToRegexSource(p);
    assert.ok(source.startsWith('^https?://'));
    assert.doesNotMatch(source, /\(\?[=!<]/); // 不使用 lookaround
  }
});

test('local dates and integer clamping', () => {
  assert.equal(localDateStr(new Date(2026, 0, 5, 1, 30)), '2026-01-05');
  assert.equal(localDateStr(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  assert.equal(clampInt('-5', 5, 300, 30), 5);
  assert.equal(clampInt('9999', 1, 120, 25), 120);
  assert.equal(clampInt('abc', 1, 120, 25), 25);
  assert.equal(clampInt('15', 1, 120, 25), 15);
});

test('an end time of 23:59 covers the final minute of the day', () => {
  const schedule = { enabled: true, daySchedules: { 1: { enabled: true, timeSlots: [{ startTime: '00:00', endTime: '23:59' }] } } };
  assert.equal(isInSchedule(schedule, new Date(2026, 0, 5, 23, 59)), true);
  assert.equal(isInSchedule(schedule, new Date(2026, 0, 6, 0, 0)), false);
});

test('currentSlotEnd reports when the current blocking slot ends', () => {
  const schedule = { enabled: true, daySchedules: { 1: { enabled: true, timeSlots: [
    { startTime: '09:00', endTime: '12:00' }, { startTime: '11:00', endTime: '13:30' },
  ] } } };
  assert.equal(currentSlotEnd(schedule, new Date(2026, 0, 5, 9, 30)), '12:00');
  assert.equal(currentSlotEnd(schedule, new Date(2026, 0, 5, 11, 30)), '13:30');
  assert.equal(currentSlotEnd(schedule, new Date(2026, 0, 5, 14, 0)), null);
});

test('getBlockingState respects disable, snooze, focus and break', () => {
  const now = new Date(2026, 0, 5, 15).getTime();
  const schedule = { enabled: true, daySchedules: { 1: { enabled: true, timeSlots: [{ startTime: '09:00', endTime: '10:00' }] } } };
  const base = { enabled: true, mode: 'blocklist', blocklist: [{ pattern: 'a.example', schedule }, { pattern: 'b.example' }] };

  assert.deepEqual(getBlockingState(base, now).patterns, ['b.example']);
  assert.equal(getBlockingState({ ...base, enabled: false }, now).active, false);
  assert.equal(getBlockingState({ ...base, snoozeUntil: now + 1000 }, now).active, false);
  assert.equal(getBlockingState({ ...base, snoozeUntil: now - 1000 }, now).active, true);
  assert.deepEqual(
    getBlockingState({ ...base, focusMode: { isRunning: true, phase: 'focus' } }, now).patterns,
    ['a.example', 'b.example'],
  );
  assert.equal(getBlockingState({ ...base, focusMode: { isRunning: true, phase: 'break' } }, now).active, false);

  const wl = getBlockingState({ enabled: true, mode: 'whitelist', whitelist: [{ pattern: 'ok.example' }] }, now);
  assert.equal(shouldBlockUrl(wl, 'https://ok.example/'), false);
  assert.equal(shouldBlockUrl(wl, 'https://nope.example/'), true);
  assert.equal(shouldBlockUrl(wl, 'chrome://extensions'), false);
});
