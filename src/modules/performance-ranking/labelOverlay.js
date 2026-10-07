// Draws the scene labels (truck tags, checkpoint pills, lane names) on a 2D canvas that sits
// over the WebGL canvas.
//
// They used to be DOM nodes moved with `transform` every frame. On the ranking page (which also
// holds a ~1,000-row audit table) any per-frame DOM change over the WebGL canvas made the browser
// repaint the whole document, and orbiting dropped to a few fps. A second canvas redrawn each frame
// behaves like the WebGL canvas itself: no DOM or layout work at all.
//
// Label specs (plain data, built in RoadScene3D):
//   { kind: 'tag',  rank, name, kpi, good, delta: { text, tone: 'up' | 'down' | 'none' } | null, warn, state: 'rest' | 'hover' | 'selected' }
//   { kind: 'pill', text, color }
//   { kind: 'lane', text }

import { LABEL_PALETTE as P } from '../../utils/sceneLabelStyle.js';

const rgba = (fill) => {
  const h = fill.color.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${fill.alpha})`;
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function metrics(compact) {
  return compact
    ? { padX: 5, padY: 3, nameMax: 64, rank: 9.5, name: 10, kpi: 9.5, chip: 8.5, rowGap: 1, gap: 3 }
    : { padX: 6, padY: 4, nameMax: 95, rank: 11, name: 11.5, kpi: 11, chip: 9.5, rowGap: 2, gap: 4 };
}

function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

const toneStyle = { up: P.deltaUp, down: P.deltaDown, none: P.deltaNone };

/** Computes a label's box and the draw instructions (so measuring and drawing agree). */
export function layoutLabel(ctx, spec, fonts, compact) {
  const m = metrics(compact);
  if (spec.kind === 'pill') {
    ctx.font = `600 ${compact ? 10 : 11}px ${fonts.family}`;
    const w = Math.ceil(ctx.measureText(spec.text).width) + 18;
    return { w, h: compact ? 18 : 20, m };
  }
  if (spec.kind === 'lane') {
    ctx.font = `700 ${compact ? 10 : 11}px ${fonts.family}`;
    return { w: Math.ceil(ctx.measureText(spec.text).width) + 12, h: compact ? 16 : 18, m };
  }
  // tag
  if (spec.medal) { m.name += 1; m.rank += 1; m.kpi += 1; m.nameMax += compact ? 8 : 16; }
  ctx.font = `700 ${m.rank}px ${fonts.family}`;
  const rankText = `#${spec.rank}`;
  const rankW = ctx.measureText(rankText).width;
  ctx.font = `600 ${m.name}px ${fonts.family}`;
  const nameText = fit(ctx, spec.name, m.nameMax);
  const nameW = ctx.measureText(nameText).width;
  ctx.font = `700 ${m.kpi}px ${fonts.mono}`;
  const kpiW = ctx.measureText(spec.kpi).width;

  const chips = [];
  if (!compact) {
    ctx.font = `600 ${m.chip}px ${fonts.mono}`;
    if (spec.delta) chips.push({ text: spec.delta.text, style: toneStyle[spec.delta.tone] || P.deltaNone, w: ctx.measureText(spec.delta.text).width + 6 });
    if (spec.warn) chips.push({ text: '!', style: P.warning, w: ctx.measureText('!').width + 6 });
  }
  const chipsW = chips.reduce((a, c) => a + c.w + m.gap, 0);
  const row1W = rankW + m.gap + nameW;
  const row2W = kpiW + chipsW;
  const w = Math.ceil(Math.max(row1W, row2W) + m.padX * 2);
  const rowH = Math.ceil(m.name + 3);
  const h = m.padY * 2 + rowH * 2 + m.rowGap + 2; // + 2px accent bar
  const medalH = spec.medal ? compact ? 30 : 36 : 0;
  return { w, h: h + medalH, medalH, m, rankText, rankW, nameText, kpiW, chips, rowH };
}

/** Draws a label with its top-left corner at (x, y). `box` comes from layoutLabel. */
export function drawLabel(ctx, spec, box, x, y, fonts) {
  const { w } = box;
  const h = box.h - (box.medalH || 0);
  if (box.medalH) {
    const r = box.medalH === 30 ? 12 : 15;
    const cx = x + w / 2, cy = y + r + 1;
    ctx.save();
    ctx.fillStyle = '#2476c0';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(cx + side * 4, cy + 5); ctx.lineTo(cx + side * 12, cy + r + 5);
      ctx.lineTo(cx + side * 6, cy + r + 2); ctx.lineTo(cx, cy + 7); ctx.closePath(); ctx.fill();
    }
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = spec.medal; ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff5d6'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(62,43,17,0.35)'; ctx.stroke();
    ctx.font = `800 ${r + 2}px ${fonts.family}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#302818';
    ctx.fillText(String(spec.rank), cx, cy + 1); ctx.restore();
    y += box.medalH;
  }
  if (spec.kind === 'pill') {
    ctx.save();
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = rgba(P.pillBackground);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = spec.color;
    ctx.stroke();
    ctx.font = `600 ${h > 18 ? 11 : 10}px ${fonts.family}`;
    ctx.fillStyle = P.pillText;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(spec.text, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
    return;
  }
  if (spec.kind === 'lane') {
    ctx.save();
    roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = rgba(P.laneBackground);
    ctx.fill();
    ctx.font = `700 ${h > 16 ? 11 : 10}px ${fonts.family}`;
    ctx.fillStyle = P.laneText;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(spec.text, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
    return;
  }

  const { m, rankText, rankW, nameText, kpiW, chips, rowH } = box;
  const accent = spec.state === 'selected' || spec.state === 'hover' ? P.selected : (spec.good ? P.tagGood : P.tagBelow);
  ctx.save();
  if (spec.state === 'hover') {
    ctx.shadowColor = 'rgba(56, 189, 248, 0.45)';
    ctx.shadowBlur = 8;
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
  }
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = rgba(P.tagBackground);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, w, h, 6);
  ctx.clip();
  ctx.fillStyle = spec.good ? P.tagGood : P.tagBelow;
  ctx.fillRect(x, y, w, 2); // status accent bar
  ctx.restore();

  ctx.save();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
  ctx.lineWidth = 1;
  ctx.strokeStyle = spec.state === 'rest' ? (spec.medal ? spec.medal : P.tagBorder) : accent;
  if (spec.state === 'rest' && spec.medal) ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const row1Y = y + 2 + m.padY + rowH / 2;
  const row2Y = row1Y + rowH + m.rowGap;
  let cx = x + m.padX;
  ctx.font = `700 ${m.rank}px ${fonts.family}`;
  ctx.fillStyle = P.rank;
  ctx.fillText(rankText, cx, row1Y);
  cx += rankW + m.gap;
  ctx.font = `600 ${m.name}px ${fonts.family}`;
  ctx.fillStyle = P.name;
  ctx.fillText(nameText, cx, row1Y);

  cx = x + m.padX;
  ctx.font = `700 ${m.kpi}px ${fonts.mono}`;
  ctx.fillStyle = spec.good ? P.tagGood : P.tagBelow; // KPI text carries the target status too
  ctx.fillText(spec.kpi, cx, row2Y);
  cx += kpiW + m.gap;
  for (const chip of chips) {
    const chipH = m.chip + 5;
    roundRect(ctx, cx, row2Y - chipH / 2, chip.w, chipH, 3);
    ctx.fillStyle = rgba(chip.style.background);
    ctx.fill();
    ctx.font = `600 ${m.chip}px ${fonts.mono}`;
    ctx.fillStyle = chip.style.text;
    ctx.textAlign = 'center';
    ctx.fillText(chip.text, cx + chip.w / 2, row2Y + 0.5);
    ctx.textAlign = 'left';
    cx += chip.w + m.gap;
  }
  ctx.restore();
}

/**
 * Replay chip: `D-8 <date> ▬▬▬ D-1 <date>` with a progress bar, drawn on the overlay (not DOM:
 * a DOM element animating over the canvas made the browser repaint the whole page every frame).
 * The date for the half of the replay that is "current" is bright, the other one dimmed.
 */
export function drawReplayChip(ctx, fonts, { from, to, t }, width, compact) {
  const fontSize = compact ? 10.5 : 12;
  const barW = compact ? 56 : 112;
  const gap = compact ? 8 : 10;
  const padX = compact ? 10 : 14;
  const h = compact ? 22 : 26;
  ctx.save();
  ctx.font = `600 ${fontSize}px ${fonts.family}`;
  const fromW = ctx.measureText(from).width;
  const toW = ctx.measureText(to).width;
  const w = Math.ceil(padX * 2 + fromW + gap + barW + gap + toW);
  const x = Math.round((width - w) / 2);
  const y = 10;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = rgba(P.pillBackground);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const midY = y + h / 2 + 0.5;
  const dim = 0.45;
  let cx = x + padX;
  ctx.globalAlpha = t < 0.5 ? 1 : dim;
  ctx.fillStyle = P.pillText;
  ctx.fillText(from, cx, midY);
  cx += fromW + gap;

  ctx.globalAlpha = 1;
  const barY = y + h / 2 - 2;
  roundRect(ctx, cx, barY, barW, 4, 2);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.fill();
  const fillW = Math.max(0, Math.min(1, t)) * barW;
  if (fillW > 0.5) {
    roundRect(ctx, cx, barY, fillW, 4, 2);
    ctx.fillStyle = P.selected;
    ctx.fill();
  }
  cx += barW + gap;

  ctx.globalAlpha = t < 0.5 ? dim : 1;
  ctx.fillStyle = P.pillText;
  ctx.fillText(to, cx, midY);
  ctx.restore();
}
