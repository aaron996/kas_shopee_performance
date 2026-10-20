import test from 'node:test';
import assert from 'node:assert/strict';
import { chartFromEvidence } from './charts.js';
import { toPublicSource } from './context.js';
import { executeChatTool } from './tools.js';
import { isFastPathEligible } from './fast-path.js';
import { isChatChart, chartNumber, preserveChartQuestion } from '../../src/utils/chatChart.js';
import { runChatAgent } from './agent.js';
import { createChatHandler } from '../../api/chat.js';
import { EventEmitter } from 'node:events';

const params = { p_metric: 'odr', p_client: 'SPB', p_grain: 'region', p_date_from: '2026-10-01', p_date_to: '2026-10-07', p_regions: ['HCM'], p_hub_types: ['BC'] };
const result = (rows = [{ entity: 'HCM', value: '94.5', volume: '1000' }, { entity: 'HNO', value: 90, volume: 2000 }]) => ({ evidenceId: 'db_test', params, data: { metric: 'odr', rows } });
const scope = { client: 'SPB', grain: 'region', dateFrom: '2026-10-01', dateTo: '2026-10-07' };

test('chart carries only verified metric rows, numeric strings and exact source scope', () => {
  const source = toPublicSource('get_metric_summary', result());
  assert.equal(source.visualization.type, 'bar');
  assert.equal(source.visualization.points[0].value, 94.5);
  assert.equal(source.visualization.points[0].volume, 1000);
  assert.deepEqual(source.scope.regions, ['HCM']);
  assert.deepEqual(source.scope.hubTypes, ['BC']);
  assert.equal(source.visualization.scope.dateFrom, params.p_date_from);
  assert.equal(isChatChart(source.visualization), true);
  assert.equal('ontime' in source.visualization.points[0], false);
  const allRegions = Array.from({length:21},(_,i)=>`Vùng ${i}`);
  assert.equal(isChatChart({...source.visualization,scope:{...source.scope,regions:allRegions}}),true);
  assert.equal(isChatChart({...source.visualization,scope:{...source.scope,regions:'invalid'}}),false);
  assert.equal(chartFromEvidence('get_metric_summary',{...result(),evidenceId:123},scope),null);
});

test('single value, malformed, untrusted and unknown results never become charts', () => {
  assert.equal(chartFromEvidence('get_metric_summary', result([{entity:'Toàn quốc',value:95}]), scope), null);
  assert.equal(chartFromEvidence('get_dashboard_help', result(), scope), null);
  assert.equal(chartFromEvidence('get_metric_summary', {...result(),evidenceId:'web_fake'}, scope), null);
  for (const value of ['', ' ', '94,5%', 'NaN', Infinity, -2, 101, false, {}]) {
    assert.equal(chartFromEvidence('get_metric_summary', result([{entity:'A',value},{entity:'B',value:90}]), scope), null);
  }
  assert.equal(chartFromEvidence('get_metric_summary', result([{entity:'A',value:94},{entity:'A',value:90}]), scope), null);
  assert.equal(chartNumber(null), null);
  assert.equal(chartNumber('0'), 0);
});

test('missing daily values remain gaps, no averaging, no invented zero or target', () => {
  const trend = result(); trend.data.rows = [{date:'2026-10-03',value:90,volume:1000},{date:'2026-10-01',value:95,volume:100},{date:'2026-10-02',value:null,volume:null}];
  const chart = chartFromEvidence('get_metric_trend', trend, {...scope, grain:'day'});
  assert.equal(chart.type,'line');
  assert.deepEqual(chart.points.map(p=>p.value),[95,null,90]);
  assert.deepEqual(chart.points.map(p=>p.volume),[100,null,1000]);
  assert.equal('target' in chart, false);
  assert.equal(chartFromEvidence('get_metric_trend', {...trend,data:{...trend.data,rows:[{date:'2026-10-01',value:0,volume:0},{date:'2026-10-02',value:90,volume:100}]}}, {...scope,grain:'day'}),null);
});

test('trend uses sequential existing RPCs with exact date and intentional empty filters', async () => {
  const calls = [];
  let active = 0, maxActive = 0;
  const userClient = { async rpc(name, args) {
    active++; maxActive=Math.max(maxActive,active); calls.push({name,args});
    await new Promise(resolve=>setTimeout(resolve,1)); active--;
    return { data:{metric:'odr',rows:args.p_date_from==='2026-10-02'?[]:[{entity:'Toàn quốc',value:94.5,volume:1000,ontime:945}],dataAsOf:args.p_date_from},error:null };
  } };
  const trend = await executeChatTool({ name:'get_metric_trend',arguments:JSON.stringify({metric:'odr',client:'SPE',date_from:'2026-10-01',date_to:'2026-10-03',regions:[],hub_types:[]}) },
    { userClient, screenContext:{client:'SPB',regions:[],hubTypes:['BC']} });
  assert.equal(maxActive,1);
  assert.equal(calls.length,3);
  assert.ok(calls.every(({name,args})=>name==='get_ai_chat_metric' && args.p_client==='SPB' && args.p_grain==='nationwide' && args.p_date_from===args.p_date_to && args.p_regions[0]==='__NO_MATCH__' && args.p_hub_types[0]==='BC'));
  assert.deepEqual(trend.data.rows.map(row=>row.value),[94.5,null,94.5]);
  assert.equal(trend.data.scope.grain,'day');
  assert.equal(toPublicSource('get_metric_trend',trend).visualization.type,'line');
});

test('trend rejects long/invalid dates, budget exhaustion and abort before DB access', async () => {
  let calls=0;
  const userClient={rpc:async()=>{calls++;return {data:{rows:[]},error:null};}};
  const call = (from,to)=>({name:'get_metric_trend',arguments:JSON.stringify({metric:'odr',client:'SPB',date_from:from,date_to:to,regions:[],hub_types:[]})});
  await assert.rejects(executeChatTool(call('2026-10-01','2026-10-15'),{userClient}),/14 ngày/);
  await assert.rejects(executeChatTool(call('2026-02-30','2026-03-03'),{userClient}),/không hợp lệ/);
  await assert.rejects(executeChatTool(call('2026-10-01','2026-10-03'),{userClient,trendBudget:{remaining:2}}),/14 điểm/);
  await assert.rejects(executeChatTool(call('2026-10-01','2026-10-03'),{userClient,signal:AbortSignal.abort()}),/Đã dừng/);
  assert.equal(calls,0);
});

test('chart and daily trend requests bypass nationwide fast path', () => {
  for (const question of ['Vẽ biểu đồ ODR','Xu hướng ODR theo ngày','Show trend chart']) {
    assert.equal(isFastPathEligible({question,query:{metric:'odr',client:'SPB',dateMode:'latest'}}),false);
  }
  const confirmed = 'Xem ODR, SPB, 7 ngày dữ liệu gần nhất.';
  const resumed = preserveChartQuestion(confirmed, 'Vẽ biểu đồ xu hướng ODR theo ngày');
  assert.match(resumed,/xu hướng ODR theo ngày/);
  assert.ok(resumed.startsWith(confirmed));
  assert.equal(isFastPathEligible({question:resumed,query:{metric:'odr',client:'SPB',dateMode:'trailing_7d'}}),false);
  assert.equal(preserveChartQuestion(confirmed,'Xem ODR'),confirmed);
});

test('API streams a grounded chart source through the real agent and RPC tool, then completes', async () => {
  let plans=0;
  const config={model:'gpt-5.6-luna',reasoningEffort:'low',maxOutputTokens:1024,turnTimeoutMs:5000,webSearchEnabled:false};
  const openai={responses:{create:async()=>++plans===1
    ? {status:'completed',output:[{type:'function_call',call_id:'chart-call',name:'get_metric_summary',arguments:JSON.stringify({metric:'odr',client:'SPB',date_from:'2026-10-01',date_to:'2026-10-07',grain:'region',regions:[],hub_types:[],limit:10,sort:'worst'})}]}
    : {status:'completed',output:[{type:'message',content:[{type:'output_text',text:'So sánh ODR theo vùng từ dữ liệu truy vấn.'}]}]}}};
  let rpcCalls=0, finalized=false;
  const handler=createChatHandler({
    readConfig:()=>config,resolveEffectiveConfig:async()=>config,
    authenticate:async()=>({user:{id:'fixture-user'},serviceClient:{},userClient:{rpc:async()=>{rpcCalls++;return {data:result().data,error:null};}}}),
    reserve:async()=>({remainingTurns:9}),
    runAgent:options=>runChatAgent(options,{openai}),
    finalize:async()=>{finalized=true;},
  });
  const req={method:'POST',headers:{authorization:'Bearer fixture'},body:{requestId:'550e8400-e29b-41d4-a716-446655440000',question:'Vẽ biểu đồ ODR SPB theo vùng từ 01/10 đến 07/10/2026',history:[]}};
  const res=new EventEmitter();Object.assign(res,{body:'',headersSent:false,writableEnded:false,setHeader(){},flushHeaders(){this.headersSent=true;},write(chunk){this.body+=chunk;return true;},end(){this.writableEnded=true;}});
  await handler(req,res);
  const frames=res.body.split('\n\n').filter(Boolean).map(frame=>({event:frame.split('\n')[0].slice(7),data:JSON.parse(frame.split('\n')[1].slice(6))}));
  assert.equal(rpcCalls,1); assert.equal(finalized,true);
  const source=frames.find(frame=>frame.event==='source').data;
  assert.equal(source.visualization.points[0].value,94.5);
  assert.equal(source.scope.dateFrom,'2026-10-01');
  assert.equal(frames.at(-1).event,'message_end');
  assert.ok(frames.some(frame=>frame.event==='text_delta'));
});

test('daily Reverse charts retain canonical client and the authenticated history adapter', async () => {
  const calls=[];
  const client={async rpc(name,params){
    calls.push({name,params});
    return {data:{cols:['report_date','region','hub','hub_type','client_name','mau_pu','ontime_pu_1st','ontime_pu_opr'],rows:[[params.date_from,'HCM','Hub A','BC','SPE Reverse',100,97,90]]},error:null};
  }};
  const call=metric=>({name:'get_metric_trend',arguments:JSON.stringify({metric,client:'224845',date_from:'2026-10-01',date_to:'2026-10-02',regions:[],hub_types:[]})});
  const trend=await executeChatTool(call('opr'),{userClient:client,question:'Vẽ xu hướng OPR Reverse theo ngày'});
  assert.equal(trend.data.scope.client,'SPE Reverse');
  assert.ok(calls.every(item=>item.name==='get_kas_daily_range_compact'&&item.params.dataset==='reverse'));
  assert.deepEqual(toPublicSource('get_metric_trend',trend).visualization.points.map(point=>point.value),[90,90]);
  const previous=calls.length;
  await assert.rejects(executeChatTool(call('odr'),{userClient:client,question:'ODR Reverse'}),error=>error.code==='CHAT_DATASET_UNSUPPORTED');
  assert.equal(calls.length,previous);
});
