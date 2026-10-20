import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSuggestionPlan } from '../../src/utils/suggestionPlans.js';
import { MIEN_REGIONS } from '../../src/data/defaultDataset.js';
import { executeRegionComparison, parseRegionComparison, compareRegionRows } from './region-comparison.js';
import { runChatAgent } from './agent.js';

const suggestion = (period='last7',signals=null) => compileSuggestionPlan({intent:'improvement',metric:'d1st',period,grain:'region'},{client:'SPB'},signals);
const request = {question:suggestion().question,history:[],screenContext:{client:'SPB',regions:Object.values(MIEN_REGIONS).flat(),hubTypes:['BC','GXT']}};
const row = (entity,value,volume=100) => ({entity,value,volume,ontime:value === null ? null : value*volume/100});
const result = (params,data) => ({evidenceId:'db_test',params,data});

test('comparison parser accepts compiled relative/fixed plans and rejects other requests', () => {
  for (const period of ['last7','last14','last30','month']) assert.ok(parseRegionComparison({question:suggestion(period).question}));
  const signals = {kind:'kpi',kpis:[{metric:'d1st',dataAsOf:'2026-10-19',dateFrom:'2026-09-01'}]};
  assert.deepEqual(parseRegionComparison({question:suggestion('last7',signals).question}),{
    metric:'d1st',client:'SPB',dateFrom:'2026-10-13',dateTo:'2026-10-19',previousFrom:'2026-10-06',previousTo:'2026-10-12'});
  assert.equal(parseRegionComparison({...request,query:{metric:'odr'}}),null);
  for (const question of ['So sánh D1ST SPB',request.question.replace('theo vùng','theo hub'),
    suggestion('last7',signals).question.replace('2026-10-06','2026-10-05'),
    suggestion('last7',signals).question.replace('2026-10-13','2026-02-30')]) assert.equal(parseRegionComparison({question}),null);
});

test('current cohort owns previous filters and numeric change order, without any model call', async () => {
  const calls=[],texts=[];
  const current=[row('DSH',97),row('ĐCL',99),row('HCM',90)];
  const previous=[row('HCM',95),row('DSH',93),row('ĐCL',98)];
  const output=await runChatAgent({config:{openaiApiKey:'test'},request,onText:text=>texts.push(text)}, {
    openai:{responses:{create:()=>assert.fail('compiled comparison must not call the model')}},
    callRpc:async (_client,name,params) => {
      calls.push({name,params});
      return result(params,name==='get_ai_chat_coverage'
        ? {dataAsOf:'2026-10-19',dateFrom:'2026-09-01'}
        : {metric:'d1st',rows:calls.length===2?current:previous,dataAsOf:params.p_date_to,syncedAt:'2026-10-20T01:40:00Z'});
    }
  });
  assert.equal(calls.length,3);
  assert.deepEqual(calls[1].params.p_regions,request.screenContext.regions);
  assert.deepEqual(calls[2].params.p_regions,['DSH','ĐCL','HCM']);
  assert.deepEqual(calls[2].params.p_hub_types,['BC','GXT']);
  assert.equal(calls[1].params.p_date_from,'2026-10-13');
  assert.equal(calls[2].params.p_date_from,'2026-10-06');
  assert.equal(calls[2].params.p_date_to,'2026-10-12');
  assert.equal(output.actualMicrousd,0);
  assert.deepEqual(output.usage,[]);
  const text=texts.join('');
  assert.ok(text.indexOf('| DSH |') < text.indexOf('| ĐCL |'));
  assert.ok(text.indexOf('| ĐCL |') < text.indexOf('| HCM |'));
  assert.match(text,/\+4,00/);
  assert.match(text,/-5,00/);
  assert.match(text,/db_test/);
});

test('missing previous regions and zero denominators stay unknown, not zero improvement', () => {
  const compared=compareRegionRows([row('Missing',95),row('Zero',null,0),row('Drop',90),row('Up',98)],
    [row('Zero',80),row('Drop',95),row('Up',90)]);
  assert.deepEqual(compared.map(r=>r.entity),['Up','Drop','Missing','Zero']);
  assert.deepEqual(compared.map(r=>r.delta),[8,-5,null,null]);
  assert.equal(compared[2].previousValue,null);
});

test('deselected regions/hub types stay empty and an empty current period skips previous RPC', async () => {
  const calls=[],texts=[];
  await executeRegionComparison({request:{...request,screenContext:{...request.screenContext,regions:[],hubTypes:[]}},onText:t=>texts.push(t)}, {
    callRpc:async (_client,name,params)=>{ calls.push(params); return result(params,name==='get_ai_chat_coverage'?{dataAsOf:'2026-10-19'}:{rows:[]}); }
  });
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1].p_regions,['__NO_MATCH__']);
  assert.deepEqual(calls[1].p_hub_types,['__NO_MATCH__']);
  assert.match(texts.join(''),/Không có dữ liệu/);
});

test('comparison stops on cancellation and rejects unrelated/malformed previous data', async () => {
  const controller=new AbortController(); controller.abort();
  await assert.rejects(executeRegionComparison({request,signal:controller.signal},{callRpc:()=>assert.fail('already aborted')}),{code:'CHAT_TIMEOUT'});
  let count=0;
  await assert.rejects(executeRegionComparison({request},{callRpc:async (_client,name,params)=>{
    count++;
    return result(params,name==='get_ai_chat_coverage'?{dataAsOf:'2026-10-19'}:{rows:[row(count===2?'Current':'Other',90)]});
  }}),{code:'CHAT_DATA_UNAVAILABLE'});
});

test('partial historical coverage never produces a misleading period change', async () => {
  const texts=[];
  await executeRegionComparison({request,onText:t=>texts.push(t)},{callRpc:async (_client,name,params)=>
    result(params,name==='get_ai_chat_coverage'?{dataAsOf:'2026-10-19',dateFrom:'2026-10-10'}:{rows:[row('DSH',95)]})});
  assert.match(texts.join(''),/\| DSH \| 95,00% \| — \| — \|/);
  assert.match(texts.join(''),/không đủ dữ liệu cho toàn kỳ/);
});
