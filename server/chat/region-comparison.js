import { normalizeChatClient } from '../../src/utils/chatClients.js';
import { callDashboardRpc, DASHBOARD_RPCS } from './db.js';
import { toPublicSource } from './context.js';
import { resolveEffectiveScope } from './scope.js';
import { shiftDate, formatDateVi } from './fast-path.js';
import { ChatError } from './errors.js';

// Only the app's compiled region-improvement suggestion enters this path. Free
// form analysis, structured selections and other grains keep the agent flow.
const TEMPLATE = /^So sánh (P1ST|OPR|D1ST|ODR) (SPB|SPE|SPE Reverse) theo vùng (.+)\. Truy vấn cùng nhóm tối đa 15 vùng có sản lượng lớn trong kỳ hiện tại, đối chiếu đúng tên vùng giữa hai kỳ và xếp theo số điểm phần trăm cải thiện\. Không suy rộng ngoài nhóm đã truy vấn\. Giữ nguyên các bộ lọc hiện tại\.$/iu;
const DATE = '(\\d{4}-\\d{2}-\\d{2})';
const FIXED = new RegExp(`^từ ${DATE} đến ${DATE} với kỳ liền trước từ ${DATE} đến ${DATE}$`, 'u');

export function parseRegionComparison(request) {
  if (request?.query) return null;
  const match = TEMPLATE.exec(request?.question || '');
  if (!match) return null;
  const [, metric, clientName, time] = match;
  const base = { metric: metric.toLowerCase(), client: normalizeChatClient(clientName) };
  const relative = /^(7|14|30) ngày gần nhất kết thúc ở ngày dữ liệu mới nhất với kỳ liền trước có cùng số ngày$/u.exec(time);
  if (relative) return { ...base, days: Number(relative[1]) };
  if (time === 'từ đầu tháng của ngày dữ liệu mới nhất đến ngày đó với kỳ liền trước có cùng số ngày') return { ...base, month: true };
  const fixed = FIXED.exec(time);
  if (!fixed) return null;
  const [, dateFrom, dateTo, previousFrom, previousTo] = fixed;
  const dates = [dateFrom,dateTo,previousFrom,previousTo];
  if (dates.some(d => !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10) !== d)) return null;
  const days = (Date.parse(dateTo)-Date.parse(dateFrom))/86400000+1;
  if (days < 1 || days > 90 || previousTo !== shiftDate(dateFrom,-1) || previousFrom !== shiftDate(dateFrom,-days)) return null;
  return { ...base, dateFrom, dateTo, previousFrom, previousTo };
}

function safeRows(result) {
  const rows = result?.data?.rows;
  if (!Array.isArray(rows) || rows.length > 15 || new Set(rows.map(r=>r?.entity)).size !== rows.length || rows.some(row =>
    typeof row?.entity !== 'string' || !row.entity.trim() ||
    typeof row.volume !== 'number' || !Number.isFinite(row.volume) || row.volume < 0 ||
    (row.value !== null && (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0 || row.value > 100)))) {
    throw new ChatError('CHAT_DATA_UNAVAILABLE','Dữ liệu so sánh vùng chưa hợp lệ. Vui lòng thử lại.',503);
  }
  return rows;
}

export function compareRegionRows(current, previous) {
  const old = new Map(previous.map(row=>[row.entity,row]));
  return current.map(row => {
    const before = old.get(row.entity);
    const value = row.volume === 0 ? null : row.value;
    const previousValue = !before || before.volume === 0 ? null : before.value;
    return { ...row, value, previousValue, delta: value == null || previousValue == null ? null : Math.round((value-previousValue)*100)/100 };
  }).sort((a,b) => (a.delta === null)-(b.delta === null) || (b.delta ?? 0)-(a.delta ?? 0) || a.entity.localeCompare(b.entity,'vi'));
}

const pct = value => value == null ? '—' : `${value.toLocaleString('vi-VN',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
const label = value => value.replaceAll('\\','\\\\').replaceAll('|','\\|').replace(/[\r\n]/g,' ');

export async function executeRegionComparison({request,userClient,signal,onStatus,onText,onSource},dependencies={}) {
  const plan = parseRegionComparison(request);
  if (!plan) return null;
  const rpc = dependencies.callRpc ?? callDashboardRpc;
  const sources = [], toolNames = [];
  const checkAbort = () => { if (signal?.aborted) throw new ChatError('CHAT_TIMEOUT','Đã dừng tra cứu so sánh vùng.',504); };
  const read = async (name,params,tool) => {
    checkAbort(); toolNames.push(tool); onStatus?.({phase:'querying_database',count:1});
    const result = await rpc(userClient,name,params);
    checkAbort(); const source = toPublicSource(tool,result); sources.push(source); onSource?.(source);
    return result;
  };
  const scope = resolveEffectiveScope({question:request.question,screenContext:request.screenContext});
  const coverage = await read(DASHBOARD_RPCS.coverage,{p_dataset:['p1st','opr'].includes(plan.metric)?'pick':'deli',p_client:plan.client},'get_data_coverage');
  const end = coverage.data?.dataAsOf;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end || '')) throw new ChatError('CHAT_DATA_EMPTY','Chưa có ngày dữ liệu phù hợp để so sánh.',422);
  const dateTo = plan.dateTo ?? end;
  const dateFrom = plan.dateFrom ?? (plan.month ? `${end.slice(0,7)}-01` : shiftDate(end,1-plan.days));
  const days = (Date.parse(dateTo)-Date.parse(dateFrom))/86400000+1;
  const previousFrom = plan.previousFrom ?? shiftDate(dateFrom,-days);
  const previousTo = plan.previousTo ?? shiftDate(dateFrom,-1);
  if (dateTo > end || (coverage.data?.dateFrom && dateFrom < coverage.data.dateFrom)) {
    throw new ChatError('CHAT_DATA_EMPTY','Lịch sử hiện có chưa đủ cho toàn bộ kỳ hiện tại. Vui lòng chọn khoảng ngày có dữ liệu.',422);
  }
  const incompletePrevious = coverage.data?.dateFrom > previousFrom;
  const params = {p_metric:plan.metric,p_client:plan.client,p_grain:'region',
    p_hub_types:scope.hubTypes === null ? [] : scope.hubTypes.length ? scope.hubTypes : ['__NO_MATCH__'],p_limit:15,p_sort:'volume_desc'};
  const current = await read(DASHBOARD_RPCS.metric,{...params,p_date_from:dateFrom,p_date_to:dateTo,
    p_regions:scope.regions === null ? [] : scope.regions.length ? scope.regions : ['__NO_MATCH__']},'get_metric_summary');
  const currentRows = safeRows(current);
  let previous = null, rows = [];
  if (currentRows.length) {
    // The previous period is restricted to the CURRENT cohort. Never rank each
    // period independently: doing so can silently replace a region at rank 15.
    previous = await read(DASHBOARD_RPCS.metric,{...params,p_date_from:previousFrom,p_date_to:previousTo,
      p_regions:currentRows.map(row=>row.entity)},'get_metric_summary');
    const previousRows = safeRows(previous);
    if (previousRows.some(row=>!currentRows.some(current=>current.entity===row.entity))) throw new ChatError('CHAT_DATA_UNAVAILABLE','Phạm vi so sánh vùng không khớp.',503);
    rows = compareRegionRows(currentRows,incompletePrevious ? [] : previousRows);
  }
  const lines = [`**${plan.metric.toUpperCase()} ${plan.client} — so sánh theo vùng**`,'',
    `Kỳ hiện tại: **${formatDateVi(dateFrom)} – ${formatDateVi(dateTo)}**. Kỳ trước: **${formatDateVi(previousFrom)} – ${formatDateVi(previousTo)}**.`,
    `Giữ nguyên bộ lọc; chọn ${currentRows.length} vùng có sản lượng lớn nhất ở kỳ hiện tại và đối chiếu đúng nhóm đó ở kỳ trước.`, ''];
  if (rows.length) {
    lines.push('| Vùng | D1ST kỳ hiện tại | Kỳ trước | Thay đổi điểm phần trăm |'.replace('D1ST',plan.metric.toUpperCase()),'|---|---:|---:|---:|');
    for (const row of rows) lines.push(`| ${label(row.entity)} | ${pct(row.value)} | ${pct(row.previousValue)} | ${row.delta === null ? '—' : `${row.delta>0?'+':''}${row.delta.toLocaleString('vi-VN',{minimumFractionDigits:2,maximumFractionDigits:2})}`} |`);
    lines.push('','Xếp theo mức thay đổi từ cao xuống thấp. “—” là không đủ dữ liệu để đối chiếu; không thay bằng 0. Chỉ kết luận trong nhóm đã truy vấn.');
  } else lines.push('Không có dữ liệu phù hợp với bộ lọc trong kỳ hiện tại.');
  if (incompletePrevious) lines.push(`Kỳ trước nằm một phần ngoài lịch sử hiện có (bắt đầu ${formatDateVi(coverage.data.dateFrom)}); không đủ dữ liệu cho toàn kỳ.`);
  lines.push('',`Ngày dữ liệu mới nhất: **${formatDateVi(end)}**.`,
    `Đồng bộ kỳ hiện tại: ${current.data?.syncedAt ?? 'chưa có'}; kỳ trước: ${previous?.data?.syncedAt ?? 'chưa có'}.`,
    `Bằng chứng: ${sources.map(source=>`\`${source.evidenceId}\``).join(', ')}.`);
  onText?.(lines.join('\n'));
  return {usage:[],toolNames,sources,actualMicrousd:0};
}
