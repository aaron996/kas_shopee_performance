const dates = ['2026-08-07'];
const sorted = [...dates].sort();
const d1Date = sorted[sorted.length - 1];
const d1 = new Date(d1Date + 'T00:00:00');
const d1Day = d1.getDay();
const d1DayOffset = d1Day === 0 ? 6 : d1Day - 1;
const currentWeekMonday = new Date(d1);
currentWeekMonday.setDate(d1.getDate() - d1DayOffset);
const prevWeekMonday = new Date(currentWeekMonday);
prevWeekMonday.setDate(currentWeekMonday.getDate() - 7);
const toDateStr = (dt) => {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const currentMondayStr = toDateStr(currentWeekMonday);
const prevMondayStr = toDateStr(prevWeekMonday);
const weekCurrent = [];
const weekPrev = [];
sorted.forEach(dStr => {
  if (dStr >= currentMondayStr && dStr <= d1Date) {
    weekCurrent.push(dStr);
  } else if (dStr >= prevMondayStr && dStr < currentMondayStr) {
    weekPrev.push(dStr);
  }
});
console.log({ d1Day, d1DayOffset, currentMondayStr, prevMondayStr, weekCurrent, weekPrev });
