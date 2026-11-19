import test from 'node:test';
import assert from 'node:assert/strict';
import { hasVolumeInDates } from './hubRows.js';

test('a hub line has numbers only when some shown day has volume', () => {
  const stats = {
    'HUBID_a_2026-11-16': { tot: 0, ont: 0 }, 'HUBID_a_2026-11-17': { tot: 0, ont: 0 },
    'HUBID_b_2026-11-16': { tot: 3, ont: 3 },
    'HUBID_c_2026-11-17': { tot: null, ont: null, incomplete: true },
    'HUBID_d_2026-11-01': { tot: 50, ont: 50 }
  };
  const days = ['2026-11-16', '2026-11-17'];
  assert.equal(hasVolumeInDates(stats, 'HUBID_a', days), false, 'toàn 0 -> ẩn');
  assert.equal(hasVolumeInDates(stats, 'HUBID_b', days), true);
  assert.equal(hasVolumeInDates(stats, 'HUBID_c', days), true, 'PUD chưa đủ dữ liệu không bị giấu');
  assert.equal(hasVolumeInDates(stats, 'HUBID_d', days), false, 'số nằm ngoài ngày đang xem thì không tính');
  assert.equal(hasVolumeInDates(stats, 'HUBID_missing', days), false);
  assert.equal(hasVolumeInDates(stats, 'HUBID_b', []), false);
});
