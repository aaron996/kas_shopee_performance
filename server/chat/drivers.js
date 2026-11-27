import { createHash } from 'node:crypto';

// Pure decomposition of a ratio KPI change (ontime / volume) into per-entity
// contributions, so "why did it drop" is answered from computed evidence and
// not from the model eyeballing two tables. Contributions sum to the total
// change in percentage points: ΔR = Σ (N1_i / D1 − N0_i / D0).
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function computeDrivers({ previous, current, previousRows, currentRows, top = 8, lowerIsBetter = false }) {
  const D0 = num(previous.volume), N0 = num(previous.ontime);
  const D1 = num(current.volume), N1 = num(current.ontime);
  if (D0 <= 0 || D1 <= 0) return null;
  const R0 = (100 * N0) / D0, R1 = (100 * N1) / D1;
  const byEntity = new Map();
  for (const [key, rows] of [['prev', previousRows], ['cur', currentRows]]) {
    for (const row of rows) {
      const entry = byEntity.get(row.entity) ?? { entity: row.entity };
      entry[key] = { volume: num(row.volume), ontime: num(row.ontime) };
      byEntity.set(row.entity, entry);
    }
  }
  const drivers = [...byEntity.values()].map(({ entity, prev, cur }) => {
    const d0 = prev?.volume ?? 0, n0 = prev?.ontime ?? 0, d1 = cur?.volume ?? 0, n1 = cur?.ontime ?? 0;
    const contribution = 100 * (n1 / D1 - n0 / D0);
    const rate0 = d0 > 0 ? (100 * n0) / d0 : null;
    const rate1 = d1 > 0 ? (100 * n1) / d1 : null;
    // Rate effect: the entity itself got better/worse. Mix effect: the rest,
    // i.e. the entity's share of volume moved.
    const rateEffect = rate0 !== null && rate1 !== null ? (d1 / D1) * (rate1 - rate0) : 0;
    return {
      entity,
      ratePrevious: rate0 === null ? null : round(rate0),
      rateCurrent: rate1 === null ? null : round(rate1),
      volumePrevious: d0, volumeCurrent: d1,
      contributionPp: round(contribution),
      rateEffectPp: round(rateEffect),
      mixEffectPp: round(contribution - rateEffect),
      // Lower-is-better metrics (FD): a positive contribution means FD went up = worse.
      ...(lowerIsBetter ? { effect: contribution === 0 ? 'neutral' : (contribution > 0 ? 'worsened' : 'improved') } : {})
    };
  }).filter(driver => driver.contributionPp !== 0)
    .sort((a, b) => Math.abs(b.contributionPp) - Math.abs(a.contributionPp));
  const explained = drivers.reduce((sum, driver) => sum + driver.contributionPp, 0);
  return {
    ratePrevious: round(R0), rateCurrent: round(R1), changePp: round(R1 - R0),
    ...(lowerIsBetter ? { direction: 'lower_is_better', overall: R1 === R0 ? 'neutral' : (R1 > R0 ? 'worsened' : 'improved') } : {}),
    volumePrevious: D0, volumeCurrent: D1,
    drivers: drivers.slice(0, top),
    otherPp: round(R1 - R0 - drivers.slice(0, top).reduce((sum, driver) => sum + driver.contributionPp, 0)),
    explainedByListedPp: round(explained)
  };
}

export function evidenceIdFor(parts) {
  return `db_${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16)}`;
}
