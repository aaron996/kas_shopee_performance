// Default Mock Dataset for Leadtime từng chặng (SPE/SPB)
// Conforms to real schema from leadtime_chang_deli.sql:
// report_date, fromprovince_new, toprovince_new, externallane_new, client_name,
// mau, avg_lt_prepickup_hour, avg_lt_firstmile_hour, avg_lt_middlemile_hour,
// avg_lt_lastmile_hour, avg_lt_e2e_hour

export function createDefaultLeadtimeDataset() {
  const lanes = [
    // Intra city
    { from: 'Hồ Chí Minh', to: 'Hồ Chí Minh', lane: 'Intra city', spbMau: 2192, speMau: 1850, baseLt: { prepickup: 8.5, firstmile: 1.2, middlemile: 3.3, lastmile: 5.8, e2e: 18.8 } },
    { from: 'Hà Nội', to: 'Hà Nội', lane: 'Intra city', spbMau: 1740, speMau: 1420, baseLt: { prepickup: 8.8, firstmile: 1.4, middlemile: 3.5, lastmile: 6.1, e2e: 19.8 } },
    { from: 'Đà Nẵng', to: 'Đà Nẵng', lane: 'Intra city', spbMau: 40, speMau: 35, baseLt: { prepickup: 9.1, firstmile: null, middlemile: null, lastmile: 7.2, e2e: 16.3 } },
    { from: 'Bắc Ninh', to: 'Bắc Ninh', lane: 'Intra city', spbMau: 1, speMau: 4, baseLt: { prepickup: 10.2, firstmile: 0.3, middlemile: 6.22, lastmile: 0.82, e2e: 17.55 } },
    { from: 'Hải Phòng', to: 'Hải Phòng', lane: 'Intra city', spbMau: 85, speMau: 62, baseLt: { prepickup: 8.2, firstmile: 1.1, middlemile: 2.9, lastmile: 5.4, e2e: 17.6 } },
    { from: 'Bình Dương', to: 'Bình Dương', lane: 'Intra city', spbMau: 120, speMau: 95, baseLt: { prepickup: 8.4, firstmile: 1.0, middlemile: 3.1, lastmile: 5.2, e2e: 17.7 } },
    { from: 'Đồng Nai', to: 'Đồng Nai', lane: 'Intra city', spbMau: 65, speMau: 45, baseLt: { prepickup: 8.9, firstmile: null, middlemile: null, lastmile: 6.8, e2e: 15.7 } },
    { from: 'Cần Thơ', to: 'Cần Thơ', lane: 'Intra city', spbMau: 42, speMau: 30, baseLt: { prepickup: 9.0, firstmile: 1.3, middlemile: 2.8, lastmile: 6.0, e2e: 19.1 } },

    // Intra region
    { from: 'Hà Nội', to: 'Hưng Yên', lane: 'Intra region', spbMau: 5, speMau: 8, baseLt: { prepickup: null, firstmile: null, middlemile: 4.8, lastmile: 5.2, e2e: 10.1 } },
    { from: 'Hà Nội', to: 'Bắc Ninh', lane: 'Intra region', spbMau: 320, speMau: 280, baseLt: { prepickup: 7.9, firstmile: 1.8, middlemile: 5.2, lastmile: 7.0, e2e: 21.9 } },
    { from: 'Hà Nội', to: 'Hải Phòng', lane: 'Intra region', spbMau: 260, speMau: 210, baseLt: { prepickup: 8.1, firstmile: 2.1, middlemile: 6.4, lastmile: 7.5, e2e: 24.1 } },
    { from: 'Hồ Chí Minh', to: 'Bình Dương', lane: 'Intra region', spbMau: 610, speMau: 530, baseLt: { prepickup: 7.6, firstmile: 1.5, middlemile: 4.5, lastmile: 6.8, e2e: 20.4 } },
    { from: 'Hồ Chí Minh', to: 'Đồng Nai', lane: 'Intra region', spbMau: 490, speMau: 420, baseLt: { prepickup: 7.8, firstmile: 1.6, middlemile: 5.1, lastmile: 7.2, e2e: 21.7 } },
    { from: 'Hồ Chí Minh', to: 'Long An', lane: 'Intra region', spbMau: 210, speMau: 180, baseLt: { prepickup: 8.3, firstmile: 1.7, middlemile: 5.5, lastmile: 7.6, e2e: 23.1 } },
    { from: 'Tây Ninh', to: 'Hồ Chí Minh', lane: 'Intra region', spbMau: 3, speMau: 1, baseLt: { prepickup: 9.5, firstmile: null, middlemile: null, lastmile: 8.1, e2e: 17.6 } },
    { from: 'Hồ Chí Minh', to: 'Cần Thơ', lane: 'Intra region', spbMau: 180, speMau: 150, baseLt: { prepickup: 8.0, firstmile: 2.0, middlemile: 7.2, lastmile: 8.0, e2e: 25.2 } },

    // Cross region
    { from: 'Hà Nội', to: 'Hồ Chí Minh', lane: 'Cross region', spbMau: 1450, speMau: 1200, baseLt: { prepickup: 8.6, firstmile: 2.5, middlemile: 26.8, lastmile: 7.4, e2e: 45.3 } },
    { from: 'Hồ Chí Minh', to: 'Hà Nội', lane: 'Cross region', spbMau: 1620, speMau: 1380, baseLt: { prepickup: 8.4, firstmile: 2.4, middlemile: 27.2, lastmile: 7.8, e2e: 45.8 } },
    { from: 'Hà Nội', to: 'Đà Nẵng', lane: 'Cross region', spbMau: 380, speMau: 310, baseLt: { prepickup: 8.7, firstmile: 2.2, middlemile: 18.5, lastmile: 7.1, e2e: 36.5 } },
    { from: 'Hồ Chí Minh', to: 'Đà Nẵng', lane: 'Cross region', spbMau: 420, speMau: 360, baseLt: { prepickup: 8.5, firstmile: 2.3, middlemile: 19.2, lastmile: 7.3, e2e: 37.3 } },
    { from: 'Bắc Ninh', to: 'Hồ Chí Minh', lane: 'Cross region', spbMau: 190, speMau: 160, baseLt: { prepickup: 9.0, firstmile: 2.6, middlemile: 28.0, lastmile: 7.9, e2e: 47.5 } },
    { from: 'Bình Dương', to: 'Hà Nội', lane: 'Cross region', spbMau: 210, speMau: 175, baseLt: { prepickup: 8.8, firstmile: 2.5, middlemile: 28.4, lastmile: 8.2, e2e: 47.9 } },
    { from: 'Hải Phòng', to: 'Hồ Chí Minh', lane: 'Cross region', spbMau: 160, speMau: 130, baseLt: { prepickup: 8.9, firstmile: 2.7, middlemile: 29.1, lastmile: 8.0, e2e: 48.7 } }
  ];

  const rows = [];

  // Generate historical data for 30 days up to 2026-08-19
  // (2026-07-21 to 2026-08-19)
  const endDate = new Date('2026-08-19T00:00:00Z');

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const d = new Date(endDate.getTime() - dayOffset * 86400000);
    const dateStr = d.toISOString().slice(0, 10);

    // Minor deterministic fluctuations for variance across days
    const daySeed = (dayOffset % 7) * 0.04 - 0.12;

    lanes.forEach((l, laneIdx) => {
      // SPB row
      const spbNoise = Math.sin(dayOffset + laneIdx) * 0.3;
      const spbMauFactor = 1 + (Math.cos(dayOffset * 2 + laneIdx) * 0.15);
      const spbMau = Math.max(1, Math.round(l.spbMau * spbMauFactor));

      const spbPre = l.baseLt.prepickup != null ? Math.max(0.1, Number((l.baseLt.prepickup + spbNoise + daySeed).toFixed(2))) : null;
      const spbFirst = l.baseLt.firstmile != null ? Math.max(0.1, Number((l.baseLt.firstmile + spbNoise * 0.5).toFixed(2))) : null;
      const spbMid = l.baseLt.middlemile != null ? Math.max(0.1, Number((l.baseLt.middlemile + spbNoise * 1.5).toFixed(2))) : null;
      const spbLast = l.baseLt.lastmile != null ? Math.max(0.1, Number((l.baseLt.lastmile + spbNoise * 0.6).toFixed(2))) : null;
      
      // Calculate realistic e2e with small variance
      const sumStages = (spbPre || 0) + (spbFirst || 0) + (spbMid || 0) + (spbLast || 0);
      const spbE2e = sumStages > 0 ? Number((sumStages + (Math.sin(dayOffset) * 0.05)).toFixed(2)) : l.baseLt.e2e;

      rows.push({
        report_date: dateStr,
        fromprovince_new: l.from,
        toprovince_new: l.to,
        externallane_new: l.lane,
        client_name: 'SPB',
        mau: spbMau,
        avg_lt_prepickup_hour: spbPre,
        avg_lt_firstmile_hour: spbFirst,
        avg_lt_middlemile_hour: spbMid,
        avg_lt_lastmile_hour: spbLast,
        avg_lt_e2e_hour: spbE2e
      });

      // SPE row
      const speNoise = Math.cos(dayOffset + laneIdx) * 0.35;
      const speMauFactor = 1 + (Math.sin(dayOffset * 2 + laneIdx) * 0.15);
      const speMau = Math.max(1, Math.round(l.speMau * speMauFactor));

      const spePre = l.baseLt.prepickup != null ? Math.max(0.1, Number((l.baseLt.prepickup + speNoise + daySeed * 0.8).toFixed(2))) : null;
      const speFirst = l.baseLt.firstmile != null ? Math.max(0.1, Number((l.baseLt.firstmile + speNoise * 0.4).toFixed(2))) : null;
      const speMid = l.baseLt.middlemile != null ? Math.max(0.1, Number((l.baseLt.middlemile + speNoise * 1.4).toFixed(2))) : null;
      const speLast = l.baseLt.lastmile != null ? Math.max(0.1, Number((l.baseLt.lastmile + speNoise * 0.5).toFixed(2))) : null;

      const speSumStages = (spePre || 0) + (speFirst || 0) + (speMid || 0) + (speLast || 0);
      const speE2e = speSumStages > 0 ? Number((speSumStages + (Math.cos(dayOffset) * 0.05)).toFixed(2)) : l.baseLt.e2e;

      rows.push({
        report_date: dateStr,
        fromprovince_new: l.from,
        toprovince_new: l.to,
        externallane_new: l.lane,
        client_name: 'SPE',
        mau: speMau,
        avg_lt_prepickup_hour: spePre,
        avg_lt_firstmile_hour: speFirst,
        avg_lt_middlemile_hour: speMid,
        avg_lt_lastmile_hour: speLast,
        avg_lt_e2e_hour: speE2e
      });
    });

    // Special edge case in plan: Unresolved lane row on 2026-08-18 (SPE, mau=1)
    if (dateStr === '2026-08-18') {
      rows.push({
        report_date: '2026-08-18',
        fromprovince_new: null,
        toprovince_new: null,
        externallane_new: null,
        client_name: 'SPE',
        mau: 1,
        avg_lt_prepickup_hour: 12.0,
        avg_lt_firstmile_hour: null,
        avg_lt_middlemile_hour: null,
        avg_lt_lastmile_hour: 8.5,
        avg_lt_e2e_hour: 20.5
      });
    }
  }

  return rows;
}
