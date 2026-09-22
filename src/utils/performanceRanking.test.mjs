import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePerformanceRanking,
  getMetricDef,
  getHubIdentityKey,
  SUPPORTED_KPIS
} from './performanceRanking.js';

test('SUPPORTED_KPIS contains 4 standard KPIs with valid targets', () => {
  assert.equal(SUPPORTED_KPIS.length, 4);
  const ids = SUPPORTED_KPIS.map(k => k.id);
  assert.deepEqual(ids, ['p1st', 'popr', 'd1st', 'dodr']);

  const p1st = getMetricDef('p1st');
  assert.equal(p1st.label, '1st Pickup');
  assert.equal(p1st.isDeli, false);
  assert.equal(p1st.target, 97.0);

  const popr = getMetricDef('popr');
  assert.equal(popr.label, 'OPR');
  assert.equal(popr.isDeli, false);
  assert.equal(popr.target, 90.0);

  const d1st = getMetricDef('d1st');
  assert.equal(d1st.label, '1st Deli');
  assert.equal(d1st.isDeli, true);
  assert.equal(d1st.target, 95.0);

  const dodr = getMetricDef('dodr');
  assert.equal(dodr.label, 'ODR');
  assert.equal(dodr.isDeli, true);
  assert.equal(dodr.target, 90.0);
});

test('getHubIdentityKey creates stable composite key from region, hub, and hubType', () => {
  const row1 = { region: 'HNO', hub: 'BC Cầu Giấy', hub_type: 'Hub LM' };
  assert.equal(getHubIdentityKey(row1), 'HNO::BC Cầu Giấy::Hub LM');

  const row2 = { region: 'HCM', hub: 'BC Cầu Giấy', hub_type: 'Mega Hub' };
  assert.equal(getHubIdentityKey(row2), 'HCM::BC Cầu Giấy::Mega Hub');

  // Same name, different region -> distinct keys
  assert.notEqual(getHubIdentityKey(row1), getHubIdentityKey(row2));
});

test('does NOT merge two Hubs with the same name in different regions or hubTypes', () => {
  const pickRows = [
    { report_date: '2026-08-05', hub: 'BC Trung Tâm', region: 'HNO', hub_type: 'Mega Hub', mau_pu: 200, ontime_pu_1st: 190 }, // 95%
    { report_date: '2026-08-05', hub: 'BC Trung Tâm', region: 'HCM', hub_type: 'Hub LM', mau_pu: 100, ontime_pu_1st: 98 }, // 98%
    { report_date: '2026-08-05', hub: 'BC Trung Tâm', region: 'HCM', hub_type: 'Hub Tỉnh', mau_pu: 150, ontime_pu_1st: 135 }, // 90%
  ];

  const result = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    clientFilter: 'ALL'
  });

  // Must be 3 distinct entities
  assert.equal(result.ranked.length, 3);
  assert.equal(result.totalCount, 3);

  // Top 1 should be HCM::BC Trung Tâm::Hub LM (98%)
  assert.equal(result.ranked[0].id, 'HCM::BC Trung Tâm::Hub LM');
  assert.equal(result.ranked[0].rank, 1);
  assert.equal(result.ranked[0].kpiD1, 98);
  assert.ok(result.ranked[0].isDisambiguated);
  assert.equal(result.ranked[0].displayName, 'BC Trung Tâm (HCM · Hub LM)');

  // Top 2 should be HNO::BC Trung Tâm::Mega Hub (95%)
  assert.equal(result.ranked[1].id, 'HNO::BC Trung Tâm::Mega Hub');
  assert.equal(result.ranked[1].rank, 2);
  assert.equal(result.ranked[1].kpiD1, 95);
  assert.ok(result.ranked[1].isDisambiguated);
  assert.equal(result.ranked[1].displayName, 'BC Trung Tâm (HNO · Mega Hub)');

  // Top 3 should be HCM::BC Trung Tâm::Hub Tỉnh (90%)
  assert.equal(result.ranked[2].id, 'HCM::BC Trung Tâm::Hub Tỉnh');
  assert.equal(result.ranked[2].rank, 3);
  assert.equal(result.ranked[2].kpiD1, 90);
  assert.ok(result.ranked[2].isDisambiguated);
});

test('ranks hubs strictly by KPI D-1 descending', () => {
  const pickRows = [
    { report_date: '2026-08-05', hub: 'Hub A', region: 'HNO', mau_pu: 100, ontime_pu_1st: 90 }, // 90%
    { report_date: '2026-08-05', hub: 'Hub B', region: 'HNO', mau_pu: 100, ontime_pu_1st: 98 }, // 98%
    { report_date: '2026-08-05', hub: 'Hub C', region: 'HNO', mau_pu: 100, ontime_pu_1st: 95 }, // 95%
  ];

  const result = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    clientFilter: 'ALL'
  });

  assert.equal(result.ranked.length, 3);
  assert.equal(result.ranked[0].hub, 'Hub B');
  assert.equal(result.ranked[0].rank, 1);
  assert.equal(result.ranked[0].kpiD1, 98);

  assert.equal(result.ranked[1].hub, 'Hub C');
  assert.equal(result.ranked[1].rank, 2);
  assert.equal(result.ranked[1].kpiD1, 95);

  assert.equal(result.ranked[2].hub, 'Hub A');
  assert.equal(result.ranked[2].rank, 3);
  assert.equal(result.ranked[2].kpiD1, 90);
});

test('deterministic tie-break: higher sample size wins when KPI is equal', () => {
  const pickRows = [
    { report_date: '2026-08-05', hub: 'Hub Small', region: 'HNO', mau_pu: 100, ontime_pu_1st: 95 }, // 95%, vol 100
    { report_date: '2026-08-05', hub: 'Hub Large', region: 'HNO', mau_pu: 500, ontime_pu_1st: 475 }, // 95%, vol 500
  ];

  const result = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    clientFilter: 'ALL'
  });

  assert.equal(result.ranked.length, 2);
  assert.equal(result.ranked[0].hub, 'Hub Large');
  assert.equal(result.ranked[0].rank, 1);
  assert.equal(result.ranked[1].hub, 'Hub Small');
  assert.equal(result.ranked[1].rank, 2);
});

test('deterministic tie-break: Vietnamese locale alphabetical order when KPI and sample size are equal', () => {
  const pickRows = [
    { report_date: '2026-08-05', hub: 'BC Yên Bái', region: 'TBB', mau_pu: 200, ontime_pu_1st: 190 }, // 95%
    { report_date: '2026-08-05', hub: 'BC An Giang', region: 'TNB', mau_pu: 200, ontime_pu_1st: 190 }, // 95%
    { report_date: '2026-08-05', hub: 'BC Đà Nẵng', region: 'TTB', mau_pu: 200, ontime_pu_1st: 190 }, // 95%
  ];

  const result = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    clientFilter: 'ALL'
  });

  assert.equal(result.ranked.length, 3);
  assert.equal(result.ranked[0].hub, 'BC An Giang');
  assert.equal(result.ranked[1].hub, 'BC Đà Nẵng');
  assert.equal(result.ranked[2].hub, 'BC Yên Bái');
});

test('places hubs with denominator = 0 or missing D-1 in "unranked" (Chưa đủ dữ liệu)', () => {
  const pickRows = [
    { report_date: '2026-08-05', hub: 'Hub Có Số', region: 'HNO', mau_pu: 100, ontime_pu_1st: 96 },
    { report_date: '2026-08-05', hub: 'Hub Mẫu Không', region: 'HNO', mau_pu: 0, ontime_pu_1st: 0 },
    { report_date: '2026-07-29', hub: 'Hub Chỉ Có D8', region: 'HNO', mau_pu: 100, ontime_pu_1st: 90 },
  ];

  const result = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    clientFilter: 'ALL'
  });

  assert.equal(result.rankedCount, 1);
  assert.equal(result.ranked[0].hub, 'Hub Có Số');
  assert.equal(result.ranked[0].rank, 1);

  assert.equal(result.unrankedCount, 2);
  const unrankedHubs = result.unranked.map(u => u.hub);
  assert.ok(unrankedHubs.includes('Hub Mẫu Không'));
  assert.ok(unrankedHubs.includes('Hub Chỉ Có D8'));
  assert.equal(result.unranked[0].kpiD1, null);
  assert.equal(result.unranked[0].rank, null);
  assert.equal(result.unranked[0].hasData, false);
});

test('scope filter with empty array semantics ([] = no-match)', () => {
  const pickRows = [
    { report_date: '2026-08-05', hub: 'Hub A', region: 'HNO', hub_type: 'Hub LM', mau_pu: 100, ontime_pu_1st: 95 },
  ];

  const resRegionEmpty = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    selectedRegions: []
  });
  assert.equal(resRegionEmpty.scopeEmpty, true);
  assert.equal(resRegionEmpty.ranked.length, 0);

  const resHubTypesEmpty = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    selectedHubTypes: []
  });
  assert.equal(resHubTypesEmpty.scopeEmpty, true);
  assert.equal(resHubTypesEmpty.ranked.length, 0);
});

test('fair delta rank via common cohort: new Hub on D-1 does NOT distort delta rank of existing cohort', () => {
  const d1 = '2026-08-05';
  const d8 = '2026-07-29';

  const pickRows = [
    // D-8: Hub A had rank 1 (95%), Hub B had rank 2 (90%)
    { report_date: d8, hub: 'Hub A', region: 'HNO', mau_pu: 100, ontime_pu_1st: 95 },
    { report_date: d8, hub: 'Hub B', region: 'HNO', mau_pu: 100, ontime_pu_1st: 90 },

    // D-1: Hub New appears with 99%! Hub A is 95%, Hub B is 90%
    { report_date: d1, hub: 'Hub New', region: 'HNO', mau_pu: 100, ontime_pu_1st: 99 },
    { report_date: d1, hub: 'Hub A', region: 'HNO', mau_pu: 100, ontime_pu_1st: 95 },
    { report_date: d1, hub: 'Hub B', region: 'HNO', mau_pu: 100, ontime_pu_1st: 90 },
  ];

  const result = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    clientFilter: 'ALL'
  });

  // In overall D-1 population, Hub New is rank 1, Hub A is rank 2, Hub B is rank 3
  assert.equal(result.ranked[0].hub, 'Hub New');
  assert.equal(result.ranked[0].rank, 1);
  // Hub New was NOT in D-8 -> hasCommonBaseline MUST be false, deltaRank MUST be null
  assert.equal(result.ranked[0].hasCommonBaseline, false);
  assert.equal(result.ranked[0].deltaRank, null);

  // For Hub A and Hub B (the common cohort):
  // Within common cohort, Hub A was #1 on D-8 and remains #1 on D-1 -> deltaRank = 0
  assert.equal(result.ranked[1].hub, 'Hub A');
  assert.equal(result.ranked[1].rank, 2); // overall D-1 rank is 2
  assert.equal(result.ranked[1].hasCommonBaseline, true);
  assert.equal(result.ranked[1].cohortRankD1, 1);
  assert.equal(result.ranked[1].cohortRankD8, 1);
  assert.equal(result.ranked[1].deltaRank, 0); // fair comparison: performance unchanged!

  // Within common cohort, Hub B was #2 on D-8 and remains #2 on D-1 -> deltaRank = 0
  assert.equal(result.ranked[2].hub, 'Hub B');
  assert.equal(result.ranked[2].rank, 3); // overall D-1 rank is 3
  assert.equal(result.ranked[2].hasCommonBaseline, true);
  assert.equal(result.ranked[2].cohortRankD1, 2);
  assert.equal(result.ranked[2].cohortRankD8, 2);
  assert.equal(result.ranked[2].deltaRank, 0); // not unfairly penalized by Hub New's arrival
});

test('cohort delta rank captures real overtakes between D-8 and D-1', () => {
  const d1 = '2026-08-05';
  const d8 = '2026-07-29';

  const pickRows = [
    // D-8: Hub A was #1 (95%), Hub B was #2 (85%)
    { report_date: d8, hub: 'Hub A', region: 'HNO', mau_pu: 100, ontime_pu_1st: 95 },
    { report_date: d8, hub: 'Hub B', region: 'HNO', mau_pu: 100, ontime_pu_1st: 85 },

    // D-1: Hub B overtakes Hub A (98% vs 90%)
    { report_date: d1, hub: 'Hub B', region: 'HNO', mau_pu: 100, ontime_pu_1st: 98 },
    { report_date: d1, hub: 'Hub A', region: 'HNO', mau_pu: 100, ontime_pu_1st: 90 },
  ];

  const result = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    clientFilter: 'ALL'
  });

  const hubB = result.ranked[0];
  assert.equal(hubB.hub, 'Hub B');
  assert.equal(hubB.cohortRankD8, 2);
  assert.equal(hubB.cohortRankD1, 1);
  assert.equal(hubB.deltaRank, 1); // moved up from #2 to #1 (+1)

  const hubA = result.ranked[1];
  assert.equal(hubA.hub, 'Hub A');
  assert.equal(hubA.cohortRankD8, 1);
  assert.equal(hubA.cohortRankD1, 2);
  assert.equal(hubA.deltaRank, -1); // dropped from #1 to #2 (-1)
});

test('operational metric isolation: 1st Pickup ignores deliRows, 1st Deli ignores pickRows', () => {
  const pickRows = [
    { report_date: '2026-08-05', hub: 'Pickup Hub', region: 'HNO', mau_pu: 150, ontime_pu_1st: 140 },
  ];
  const deliRows = [
    { report_date: '2026-08-05', hub: 'Deli Hub', region: 'HCM', mau_deli: 200, ontime_deli_1st: 190 },
  ];

  // 1st Pickup should only see Pickup Hub
  const pickRes = calculatePerformanceRanking({
    pickRows,
    deliRows,
    metricKey: 'p1st'
  });
  assert.equal(pickRes.ranked.length, 1);
  assert.equal(pickRes.ranked[0].hub, 'Pickup Hub');

  // 1st Deli should only see Deli Hub
  const deliRes = calculatePerformanceRanking({
    pickRows,
    deliRows,
    metricKey: 'd1st'
  });
  assert.equal(deliRes.ranked.length, 1);
  assert.equal(deliRes.ranked[0].hub, 'Deli Hub');
  assert.equal(deliRes.ranked[0].sampleD1, 200);
});

test('aggregates multi-client rows correctly without averaging percentages', () => {
  const pickRows = [
    // Same hub on D-1 with SPB and SPE rows
    { report_date: '2026-08-05', hub: 'Hub Dual', region: 'HNO', client_name: 'SPB', mau_pu: 100, ontime_pu_1st: 90 }, // 90%
    { report_date: '2026-08-05', hub: 'Hub Dual', region: 'HNO', client_name: 'SPE', mau_pu: 400, ontime_pu_1st: 380 }, // 95%
  ];

  // Under ALL: total sample = 500, total ontime = 470 -> KPI = 470 / 500 * 100 = 94.0%
  const result = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    clientFilter: 'ALL'
  });

  assert.equal(result.ranked.length, 1);
  assert.equal(result.ranked[0].sampleD1, 500);
  assert.equal(result.ranked[0].ontimeD1, 470);
  assert.equal(result.ranked[0].kpiD1, 94.0);
});

test('small sample flag is applied below threshold without excluding Hub from ranking', () => {
  const pickRows = [
    { report_date: '2026-08-05', hub: 'Hub Tiny', region: 'HNO', mau_pu: 15, ontime_pu_1st: 15 }, // 100%, vol 15 < 30
    { report_date: '2026-08-05', hub: 'Hub Big', region: 'HNO', mau_pu: 200, ontime_pu_1st: 180 }, // 90%, vol 200 >= 30
  ];

  const result = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    clientFilter: 'ALL'
  });

  assert.equal(result.ranked.length, 2);
  assert.equal(result.ranked[0].hub, 'Hub Tiny');
  assert.equal(result.ranked[0].isSmallSample, true);
  assert.equal(result.ranked[1].hub, 'Hub Big');
  assert.equal(result.ranked[1].isSmallSample, false);
});

test('road scene slot positioning math guarantees bounds [startPercent, endPercent] without negative coordinates', () => {
  // Simulate top 10 display + 1 extra selected hub at rank 150 (totalVisible = 11)
  const totalVisible = 11;
  const startPercent = 5;
  const endPercent = 88;

  for (let idx = 0; idx < totalVisible; idx++) {
    const rankProgress = totalVisible > 1
      ? 1 - (idx / (totalVisible - 1))
      : 0.5;
    const leftPos = startPercent + (rankProgress * (endPercent - startPercent));

    assert.ok(rankProgress >= 0 && rankProgress <= 1, `rankProgress for slot ${idx} must be in [0, 1]`);
    assert.ok(leftPos >= startPercent && leftPos <= endPercent, `leftPos for slot ${idx} must be in [${startPercent}, ${endPercent}]`);
  }
});

test('drilldown payload contract: every ranked and unranked item has valid composite id, hub, and region', () => {
  const pickRows = [
    { report_date: '2026-08-05', hub: 'Hub Alpha', region: 'HNO', mau_pu: 100, ontime_pu_1st: 95 },
    { report_date: '2026-08-05', hub: 'Hub Zero', region: 'SGN', mau_pu: 0, ontime_pu_1st: 0 }
  ];

  const result = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st'
  });

  assert.equal(result.ranked.length, 1);
  const rankedItem = result.ranked[0];
  assert.ok(rankedItem.id && rankedItem.id.includes('::'));
  assert.equal(rankedItem.hub, 'Hub Alpha');
  assert.equal(rankedItem.region, 'HNO');

  assert.equal(result.unranked.length, 1);
  const unrankedItem = result.unranked[0];
  assert.ok(unrankedItem.id && unrankedItem.id.includes('::'));
  assert.equal(unrankedItem.hub, 'Hub Zero');
  assert.equal(unrankedItem.region, 'SGN');
});

test('two Hubs with identical name in same region but different hubType have distinct identities and drill-down targets exactly one Hub', () => {
  const pickRows = [
    { report_date: '2026-08-05', hub: 'BC Cầu Giấy', region: 'HNO', hub_type: 'Mega Hub', mau_pu: 200, ontime_pu_1st: 190 }, // 95%
    { report_date: '2026-08-05', hub: 'BC Cầu Giấy', region: 'HNO', hub_type: 'Hub LM', mau_pu: 100, ontime_pu_1st: 98 }, // 98%
  ];

  const result = calculatePerformanceRanking({
    pickRows,
    metricKey: 'p1st',
    clientFilter: 'ALL'
  });

  // Ranking must contain 2 distinct entities with distinct IDs
  assert.equal(result.ranked.length, 2);
  const hubLM = result.ranked.find(h => h.hubType === 'Hub LM');
  const megaHub = result.ranked.find(h => h.hubType === 'Mega Hub');

  assert.ok(hubLM, 'Hub LM must exist in ranking');
  assert.ok(megaHub, 'Mega Hub must exist in ranking');

  assert.equal(hubLM.id, 'HNO::BC Cầu Giấy::Hub LM');
  assert.equal(hubLM.hub, 'BC Cầu Giấy');
  assert.equal(hubLM.region, 'HNO');
  assert.equal(hubLM.kpiD1, 98);
  assert.equal(hubLM.rank, 1);

  assert.equal(megaHub.id, 'HNO::BC Cầu Giấy::Mega Hub');
  assert.equal(megaHub.hub, 'BC Cầu Giấy');
  assert.equal(megaHub.region, 'HNO');
  assert.equal(megaHub.kpiD1, 95);
  assert.equal(megaHub.rank, 2);

  // Drilldown payload targeting Mega Hub
  const drillTargetMega = {
    hubId: megaHub.id,
    hub: megaHub.hub,
    region: megaHub.region,
    hubType: megaHub.hubType,
    metricKey: 'p1st'
  };

  // Grain matching check: composite matching must select only Mega Hub
  const isMegaFocused = (rowId, rowType) => drillTargetMega.hubId === rowId && drillTargetMega.hubType === rowType;
  assert.equal(isMegaFocused(megaHub.id, megaHub.hubType), true);
  assert.equal(isMegaFocused(hubLM.id, hubLM.hubType), false);

  // Drilldown payload targeting Hub LM
  const drillTargetLM = {
    hubId: hubLM.id,
    hub: hubLM.hub,
    region: hubLM.region,
    hubType: hubLM.hubType,
    metricKey: 'p1st'
  };

  const isLMFocused = (rowId, rowType) => drillTargetLM.hubId === rowId && drillTargetLM.hubType === rowType;
  assert.equal(isLMFocused(hubLM.id, hubLM.hubType), true);
  assert.equal(isLMFocused(megaHub.id, megaHub.hubType), false);
});


