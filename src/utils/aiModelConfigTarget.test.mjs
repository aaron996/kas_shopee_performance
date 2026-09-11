import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getModelConfigTargetKey,
  getInheritanceLabel,
  shouldAcceptConfigResponse,
  shouldApplyMutationResponse,
  isModelConfigActionEnabled
} from './aiModelConfigTarget.js';

const VALID_UUID_A = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const mockAllowedModels = [
  { id: 'gpt-5.6-luna', label: 'Luna', reasoningEfforts: ['low', 'medium', 'high'] },
  { id: 'gpt-4.1', label: 'GPT-4.1', reasoningEfforts: [] }
];

test('getModelConfigTargetKey: creates unique deterministic keys for All and Users', () => {
  assert.equal(getModelConfigTargetKey('all', null), 'all');
  assert.equal(getModelConfigTargetKey('all', { userId: VALID_UUID_A }), 'all');
  assert.equal(getModelConfigTargetKey('user', { userId: VALID_UUID_A }), `user:${VALID_UUID_A.toLowerCase()}`);
  assert.equal(getModelConfigTargetKey('user', { userId: `  ${VALID_UUID_B.toUpperCase()}  ` }), `user:${VALID_UUID_B.toLowerCase()}`);
  assert.equal(getModelConfigTargetKey('user', null), 'user:none');
  assert.equal(getModelConfigTargetKey('user', { userId: 'not-a-uuid' }), 'user:none');
});

test('getInheritanceLabel: returns correct inheritance description', () => {
  // 1. User has active override -> returns null
  assert.equal(getInheritanceLabel({ model: 'gpt-5.6-luna' }, 'user'), null);

  // 2. User has no override, global config is present -> 'Đang kế thừa cấu hình All'
  assert.equal(getInheritanceLabel(null, 'all'), 'Đang kế thừa cấu hình All');

  // 3. User has no override, global config absent -> 'Đang dùng mặc định server'
  assert.equal(getInheritanceLabel(null, 'env'), 'Đang dùng mặc định server');
});

test('shouldAcceptConfigResponse: prevents race condition and stale responses from overwriting state', () => {
  // Scenario 1: Target switched while request A in-flight
  // Request 1 started for target 'user:A', but user switched to 'user:B' (request 2)
  assert.equal(
    shouldAcceptConfigResponse({
      requestSeq: 1,
      activeSeq: 2,
      responseTargetKey: 'user:A',
      currentTargetKey: 'user:B',
      isAborted: false
    }),
    false,
    'Must reject older sequence response'
  );

  // Scenario 2: Target mismatch even if seq matched (edge case)
  assert.equal(
    shouldAcceptConfigResponse({
      requestSeq: 2,
      activeSeq: 2,
      responseTargetKey: 'user:A',
      currentTargetKey: 'user:B',
      isAborted: false
    }),
    false,
    'Must reject when response target key does not match current target key'
  );

  // Scenario 3: Request was aborted
  assert.equal(
    shouldAcceptConfigResponse({
      requestSeq: 2,
      activeSeq: 2,
      responseTargetKey: 'user:B',
      currentTargetKey: 'user:B',
      isAborted: true
    }),
    false,
    'Must reject aborted response'
  );

  // Scenario 4: Valid matching response
  assert.equal(
    shouldAcceptConfigResponse({
      requestSeq: 2,
      activeSeq: 2,
      responseTargetKey: 'user:B',
      currentTargetKey: 'user:B',
      isAborted: false
    }),
    true,
    'Must accept current and matching response'
  );
});

test('shouldApplyMutationResponse: prevents mutation response of old target from affecting new target', () => {
  assert.equal(
    shouldApplyMutationResponse({
      mutationTargetKey: 'user:A',
      currentTargetKey: 'user:B'
    }),
    false,
    'Must reject mutation completion when user navigated to another target'
  );

  assert.equal(
    shouldApplyMutationResponse({
      mutationTargetKey: 'all',
      currentTargetKey: 'all'
    }),
    true,
    'Must accept mutation completion when user remained on same target'
  );
});

test('isModelConfigActionEnabled: validates all criteria for Apply and Reset', () => {
  const baseData = {
    targetConfig: { model: 'gpt-5.6-luna' },
    globalConfig: { model: 'gpt-5.6-luna' },
    allowedModels: mockAllowedModels
  };

  const validApplyParams = {
    scope: 'user',
    user: { userId: VALID_UUID_A, email: 'a@ghn.vn' },
    modelConfigData: baseData,
    loadedTargetKey: `user:${VALID_UUID_A.toLowerCase()}`,
    currentTargetKey: `user:${VALID_UUID_A.toLowerCase()}`,
    formModel: 'gpt-5.6-luna',
    formReasoningEffort: 'medium',
    formReason: 'Nâng cấp phục vụ kiểm thử',
    isModelConfigLoading: false,
    isSavingConfig: false,
    modelConfigError: '',
    actionType: 'apply'
  };

  // 1. All valid -> true
  assert.equal(isModelConfigActionEnabled(validApplyParams), true);

  // 2. Loading -> false
  assert.equal(isModelConfigActionEnabled({ ...validApplyParams, isModelConfigLoading: true }), false);

  // 3. Saving -> false
  assert.equal(isModelConfigActionEnabled({ ...validApplyParams, isSavingConfig: true }), false);

  // 4. Error present -> false
  assert.equal(isModelConfigActionEnabled({ ...validApplyParams, modelConfigError: 'Lỗi tải' }), false);

  // 5. Data is stale (target changed from A to B while A data in state) -> false
  assert.equal(isModelConfigActionEnabled({ ...validApplyParams, currentTargetKey: `user:${VALID_UUID_B.toLowerCase()}` }), false);

  // 6. loadedTargetKey is null (loading or reset) -> false
  assert.equal(isModelConfigActionEnabled({ ...validApplyParams, loadedTargetKey: null }), false);

  // 7. Allowed models empty -> false
  assert.equal(isModelConfigActionEnabled({ ...validApplyParams, modelConfigData: { ...baseData, allowedModels: [] } }), false);

  // 8. Reason is empty or whitespace -> false
  assert.equal(isModelConfigActionEnabled({ ...validApplyParams, formReason: '   ' }), false);

  // 9. Model invalid / not in allowedModels -> false
  assert.equal(isModelConfigActionEnabled({ ...validApplyParams, formModel: 'gpt-unknown' }), false);

  // 10. Reasoning incompatible (Luna requires one of ['low', 'medium', 'high'], got null) -> false
  assert.equal(isModelConfigActionEnabled({ ...validApplyParams, formReasoningEffort: null }), false);

  // 11. GPT-4.1 does not support reasoning: must have reasoningEffort === null
  assert.equal(
    isModelConfigActionEnabled({ ...validApplyParams, formModel: 'gpt-4.1', formReasoningEffort: 'medium' }),
    false,
    'GPT-4.1 with non-null reasoning must be disabled'
  );
  assert.equal(
    isModelConfigActionEnabled({ ...validApplyParams, formModel: 'gpt-4.1', formReasoningEffort: null }),
    true,
    'GPT-4.1 with null reasoning must be enabled'
  );

  // 12. Reset action checks
  const validResetParams = {
    ...validApplyParams,
    actionType: 'reset'
  };
  assert.equal(isModelConfigActionEnabled(validResetParams), true);

  // Reset when user has NO override -> disabled (nothing to reset)
  assert.equal(
    isModelConfigActionEnabled({
      ...validResetParams,
      modelConfigData: { ...baseData, targetConfig: null }
    }),
    false
  );

  // Reset for scope 'all' when globalConfig exists -> enabled
  assert.equal(
    isModelConfigActionEnabled({
      ...validResetParams,
      scope: 'all',
      currentTargetKey: 'all',
      loadedTargetKey: 'all',
      modelConfigData: { ...baseData, globalConfig: { model: 'gpt-5.6-luna' } }
    }),
    true
  );

  // Reset for scope 'all' when globalConfig is null (already env default) -> disabled
  assert.equal(
    isModelConfigActionEnabled({
      ...validResetParams,
      scope: 'all',
      currentTargetKey: 'all',
      loadedTargetKey: 'all',
      modelConfigData: { ...baseData, globalConfig: null }
    }),
    false
  );
});
