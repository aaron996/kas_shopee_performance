// Birth poses remain attached to the travelling world, not the current leader.
export function createLeaderTrail(capacity) {
  return { particles: Array.from({ length: capacity }, () => ({ born: -Infinity })), cursor: 0, lastBirth: -Infinity, leader: null };
}
export function emitLeaderTrail(pool, leader, time, distance, region, interval = 0.06) {
  if (!leader || time - pool.lastBirth < interval) return false;
  pool.leader = leader.id; pool.lastBirth = time;
  Object.assign(pool.particles[pool.cursor], { born: time, distance, roadX: leader.roadX, roadZ: leader.roadZ, region,
    phase: pool.cursor * 2.399, source: leader.id });
  pool.cursor = (pool.cursor + 1) % pool.particles.length;
  return true;
}
export function sampleTrailParticle(particle, time, distance) {
  const age = time - particle.born;
  if (age < 0 || age >= 1.65) return null;
  const t = age / 1.65;
  return { roadX: particle.roadX - 1.5 - (distance - particle.distance),
    roadZ: particle.roadZ + Math.sin(particle.phase) * (0.15 + age * 0.2),
    y: 0.22 + age * 0.24, size: 0.32 + age * 0.8,
    alpha: Math.min(1, age / 0.12) * (1 - t) ** 1.7 * 0.22, roll: particle.phase + age * 0.2 };
}
