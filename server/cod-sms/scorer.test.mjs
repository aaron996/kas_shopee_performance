import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSmsSource, validateModelAssessment } from './scorer.js';

const source = {
  suspicionType: 'Gối đầu COD',
  driverId: '3100818',
  orderCode: 'GY8CFXTR',
  driverName: 'Đinh Xuân Hậu',
  codAmount: 12490000,
  messages: [
    {
      smsTime: '2026-08-14T03:28:17',
      recipientType: 'NN',
      content: '19037209614016\nTech\nĐinh xuân hậu\n12tr490k'
    },
    {
      smsTime: '2026-08-14T03:46:00',
      recipientType: 'NN',
      content: 'Quy khach da hen giao lai don hang GY8CFXTR vao ngay 16-08-2026.'
    }
  ],
  otherOrderSequences: []
};

test('validates Mẫu 1 + Mẫu 3 as score 6 with verbatim evidence', () => {
  const result = validateModelAssessment({
    order_code: 'GY8CFXTR',
    diem_sms: 6,
    muc_do_tin_cay: 'cao',
    mau_hinh_phat_hien: ['mau_1', 'mau_3'],
    bang_chung: source.messages.map(message => message.content),
    giai_thich: 'Có tín hiệu tài khoản khớp tên tài xế, sau đó có SMS hẹn giao lại trong 24 giờ.'
  }, source);

  assert.equal(result.smsScore, 6);
  assert.deepEqual(result.detectedPatterns, ['mau_1', 'mau_3']);
  assert.deepEqual(result.evidence, source.messages.map(message => message.content));
});

test('phone number and numeric order code without banking context remain no_evidence', () => {
  const falsePositiveSource = {
    ...source,
    orderCode: '123456789012',
    messages: [{
      smsTime: '2026-08-14T03:28:17',
      recipientType: 'NN',
      content: 'Liên hệ số điện thoại 0901234567 cho đơn 123456789012.'
    }]
  };

  const result = validateModelAssessment({
    order_code: falsePositiveSource.orderCode,
    diem_sms: 0,
    muc_do_tin_cay: 'khong_co_bang_chung',
    mau_hinh_phat_hien: [],
    bang_chung: [],
    giai_thich: 'Chỉ có số điện thoại và mã đơn, không có ngữ cảnh ngân hàng.'
  }, falsePositiveSource);
  assert.equal(result.smsScore, 0);

  assert.throws(() => validateModelAssessment({
    order_code: falsePositiveSource.orderCode,
    diem_sms: 1,
    muc_do_tin_cay: 'thap',
    mau_hinh_phat_hien: ['mau_4'],
    bang_chung: [falsePositiveSource.messages[0].content],
    giai_thich: 'Sai: nhận nhầm chuỗi số là tài khoản.'
  }, falsePositiveSource), error => error.code === 'COD_SMS_MODEL_SCHEMA_INVALID');
});

test('rejects model JSON that does not match the required schema', async () => {
  const openai = {
    responses: {
      create: async () => ({
        status: 'completed',
        output_text: JSON.stringify({ order_code: 'GY8CFXTR', diem_sms: 6 })
      })
    }
  };

  await assert.rejects(
    scoreSmsSource(source, {
      openaiApiKey: 'test',
      model: 'gpt-5.6-luna',
      reasoningEffort: 'low',
      maxOutputTokens: 1200,
      modelTimeoutMs: 30000
    }, { openai }),
    error => error.code === 'COD_SMS_MODEL_SCHEMA_INVALID'
  );
});

test('accepts loosely spelled bank names seen in real driver SMS', () => {
  for (const [orderCode, driverName, content] of [
    ['VNGH80009359305', 'Phạm Văn Hiếu', 'VP bank 249997803 pham van hieu 1439k'],
    ['VNGH80087909201', 'Nguyễn Quốc Khánh', 'Techcobank Nguyễn Quốc Khánh 19035714995013........4256k']
  ]) {
    const bankSource = {
      ...source,
      orderCode,
      driverName,
      messages: [{ smsTime: '2026-09-16T09:45:10', recipientType: 'NN', content }]
    };
    const result = validateModelAssessment({
      order_code: orderCode,
      diem_sms: 5,
      muc_do_tin_cay: 'cao',
      mau_hinh_phat_hien: ['mau_1'],
      bang_chung: [content],
      giai_thich: 'Có số tài khoản kèm tên ngân hàng và tên khớp tài xế.'
    }, bankSource);
    assert.equal(result.smsScore, 5);
  }
});

test('schema rejection message carries the rule that failed', () => {
  assert.throws(() => validateModelAssessment({
    order_code: 'GY8CFXTR',
    diem_sms: 3,
    muc_do_tin_cay: 'cao',
    mau_hinh_phat_hien: ['mau_1'],
    bang_chung: [source.messages[0].content],
    giai_thich: 'Sai điểm.'
  }, source), error => error.code === 'COD_SMS_MODEL_SCHEMA_INVALID'
    && error.message.includes('score does not match rubric weights'));
});

const scoringConfig = { openaiApiKey: 'test', model: 'gpt-6-luna', reasoningEffort: 'max', maxOutputTokens: 8192, modelTimeoutMs: 60000 };
const completedResponse = () => ({ status: 'completed', output_text: JSON.stringify({
  order_code: source.orderCode, diem_sms: 0, muc_do_tin_cay: 'khong_co_bang_chung',
  mau_hinh_phat_hien: [], bang_chung: [], giai_thich: 'Không đủ bằng chứng.'
}) });

test('token exhaustion gets one larger retry with unchanged reasoning and a shared deadline', async () => {
  const requests = [];
  const openai = { responses: { create: async (request, options) => {
    requests.push({ request, signal: options.signal });
    return requests.length === 1 ? { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
      usage: { output_tokens: 8192, output_tokens_details: { reasoning_tokens: 8192 } } } : completedResponse();
  } } };
  const result = await scoreSmsSource(source,scoringConfig,{openai});
  assert.equal(result.smsScore,0); assert.equal(requests.length,2);
  assert.deepEqual(requests.map(x=>x.request.max_output_tokens),[8192,16384]);
  assert.equal(requests[1].request.reasoning.effort,'max');
  assert.equal(requests[0].signal,requests[1].signal);
  assert.equal(requests[1].request.store,false);
});

test('repeated token exhaustion is bounded and reports the exact budget', async () => {
  let calls=0;
  const openai={responses:{create:async()=>{calls++; return {status:'incomplete',incomplete_details:{reason:'max_output_tokens'}};}}};
  await assert.rejects(scoreSmsSource(source,scoringConfig,{openai}), e=>e.code==='COD_SMS_MODEL_INCOMPLETE' && e.message.includes('16384'));
  assert.equal(calls,2);
});

test('content filter and unknown incomplete reasons never trigger a paid retry or echo provider text', async()=>{
  for(const reason of ['content_filter','private SMS text']) {
    let calls=0;
    const openai={responses:{create:async()=>{calls++; return {status:'incomplete',incomplete_details:{reason}};}}};
    await assert.rejects(scoreSmsSource(source,scoringConfig,{openai}),e=>e.code==='COD_SMS_MODEL_INCOMPLETE' && !e.message.includes('private SMS text'));
    assert.equal(calls,1);
  }
});

test('the entire order timeout also bounds a token retry',async()=>{
  let calls=0;
  const openai={responses:{create:async(_request,{signal})=>{
    calls++;
    if(calls===1)return {status:'incomplete',incomplete_details:{reason:'max_output_tokens'}};
    await new Promise(resolve=>setTimeout(resolve,15));
    signal.throwIfAborted();
  }}};
  await assert.rejects(scoreSmsSource(source,{...scoringConfig,modelTimeoutMs:5},{openai}),e=>e.code==='COD_SMS_MODEL_TIMEOUT');
  assert.equal(calls,2);
});
