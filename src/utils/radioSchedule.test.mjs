import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, neighbourTrack, playableTracks, resolveRadio, shuffleRadioTracks } from './radioSchedule.js';

const tracks = [
  { id: 'a', src: 'a.mp3', duration: 100 },
  { id: 'b', src: 'b.mp3', duration: 50 },
  { id: 'c', src: 'c.mp3', duration: 30 }
];
const anchor = { trackId: 'a', startedAtMs: 1_000_000 };

test('shuffle preserves every row and keeps disabled or unmeasured songs in place', () => {
  const rows = [
    { id: 'a', active: true, duration_seconds: 20 },
    { id: 'off', active: false, duration_seconds: 20 },
    { id: 'b', active: true, duration_seconds: 30 },
    { id: 'unknown', active: true, duration_seconds: null },
    { id: 'c', active: true, duration_seconds: 40 }
  ];
  const original = rows.map(row => row.id);
  const shuffled = shuffleRadioTracks(rows, () => 0);
  assert.deepEqual(shuffled.map(row => row.id), ['b', 'off', 'c', 'unknown', 'a']);
  assert.deepEqual(rows.map(row => row.id), original);
  assert.deepEqual([...shuffled].map(row => row.id).sort(), [...original].sort());
  assert.equal(shuffled[1], rows[1]);
  assert.equal(shuffled[3], rows[3]);
});

test('shuffle handles empty and single-song playlists without losing songs', () => {
  assert.deepEqual(shuffleRadioTracks([]), []);
  const one = [{ id: 'a', active: true, duration_seconds: 20 }];
  assert.deepEqual(shuffleRadioTracks(one), one);
});

test('resolveRadio starts at the anchored track and offset', () => {
  const r = resolveRadio(anchor, tracks, 1_000_000 + 40_000);
  assert.equal(r.track.id, 'a');
  assert.equal(Math.round(r.offset), 40);
});

test('resolveRadio walks into following tracks and wraps the cycle', () => {
  assert.equal(resolveRadio(anchor, tracks, 1_000_000 + 120_000).track.id, 'b');
  assert.equal(Math.round(resolveRadio(anchor, tracks, 1_000_000 + 120_000).offset), 20);
  assert.equal(resolveRadio(anchor, tracks, 1_000_000 + 160_000).track.id, 'c');
  // total cycle = 180s
  const wrapped = resolveRadio(anchor, tracks, 1_000_000 + 180_000 + 10_000);
  assert.equal(wrapped.track.id, 'a');
  assert.equal(Math.round(wrapped.offset), 10);
});

test('listeners with different clocks inside the same instant agree', () => {
  const one = resolveRadio(anchor, tracks, 5_000_000);
  const two = resolveRadio(anchor, tracks, 5_000_000);
  assert.deepEqual([one.track.id, one.offset], [two.track.id, two.offset]);
});

test('a missing anchor track falls back to the first track; clock before start is clamped', () => {
  assert.equal(resolveRadio({ trackId: 'gone', startedAtMs: 0 }, tracks, 10_000).track.id, 'a');
  assert.equal(resolveRadio(anchor, tracks, 0).offset, 0);
});

test('tracks without a duration are ignored and an empty list resolves to null', () => {
  const mixed = [{ id: 'x', src: 'x.mp3', duration: null }, ...tracks];
  assert.equal(playableTracks(mixed).length, 3);
  assert.equal(resolveRadio(anchor, [{ id: 'x', src: 'x.mp3' }], 1), null);
  assert.equal(resolveRadio(null, tracks, 1), null);
});

test('neighbourTrack wraps in both directions', () => {
  assert.equal(neighbourTrack(tracks, 0, -1).id, 'c');
  assert.equal(neighbourTrack(tracks, 2, 1).id, 'a');
});

test('formatClock renders m:ss', () => {
  assert.equal(formatClock(146.4), '2:26');
  assert.equal(formatClock(-3), '0:00');
});
