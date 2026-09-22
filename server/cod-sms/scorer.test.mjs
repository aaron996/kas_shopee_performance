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
