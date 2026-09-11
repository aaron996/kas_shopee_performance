export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tạo target key duy nhất cho phạm vi cấu hình
 * - 'all' cho Toàn hệ thống
 * - 'user:<UUID>' cho User cụ thể
 * - 'user:none' khi đang ở tab User nhưng chưa chọn user
 */
export function getModelConfigTargetKey(scope, user) {
  if (scope === 'all') return 'all';
  if (scope === 'user') {
    const rawId = user?.userId;
    if (typeof rawId === 'string' && UUID_REGEX.test(rawId.trim())) {
      return `user:${rawId.trim().toLowerCase()}`;
    }
    return 'user:none';
  }
  return 'all';
}

/**
 * Trả về thông điệp kế thừa chuẩn xác khi user không có override riêng
 */
export function getInheritanceLabel(targetConfig, effectiveSource) {
  if (targetConfig) return null;
  if (effectiveSource === 'env') {
    return 'Đang dùng mặc định server';
  }
  return 'Đang kế thừa cấu hình All';
}

/**
 * Kiểm tra xem response fetch có được phép cập nhật vào UI state hay không
 * Chống race condition và response stale
 */
export function shouldAcceptConfigResponse({
  requestSeq,
  activeSeq,
  responseTargetKey,
  currentTargetKey,
  isAborted = false
}) {
  if (isAborted) return false;
  if (requestSeq !== activeSeq) return false;
  if (responseTargetKey !== currentTargetKey) return false;
  return true;
}

/**
 * Kiểm tra xem response mutation (Apply/Reset) có được phép tác động vào UI hay không
 * Nếu người dùng đã chuyển sang target khác trong lúc mutation đang gửi, kết quả cũ sẽ bị hủy
 */
export function shouldApplyMutationResponse({
  mutationTargetKey,
  currentTargetKey
}) {
  if (!mutationTargetKey || !currentTargetKey) return false;
  return mutationTargetKey === currentTargetKey;
}

/**
 * Kiểm tra đầy đủ tất cả điều kiện để bật nút Apply hoặc Reset
 */
export function isModelConfigActionEnabled({
  scope,
  user,
  modelConfigData,
  loadedTargetKey,
  currentTargetKey,
  formModel = '',
  formReasoningEffort = null,
  formReason = '',
  isModelConfigLoading = false,
  isSavingConfig = false,
  modelConfigError = '',
  actionType = 'apply' // 'apply' | 'reset'
}) {
  // 1. Không loading
  if (isModelConfigLoading) return false;

  // 2. Không saving
  if (isSavingConfig) return false;

  // 3. Không có modelConfigError
  if (modelConfigError) return false;

  // 4. Có modelConfigData
  if (!modelConfigData) return false;

  // 5. loadedTargetKey === currentTargetKey
  if (!loadedTargetKey || loadedTargetKey !== currentTargetKey) return false;

  // 6. Có allowedModels
  const allowedModels = modelConfigData.allowedModels;
  if (!Array.isArray(allowedModels) || allowedModels.length === 0) return false;

  // 7. Nếu scope user thì đã có selectedUser hợp lệ
  if (scope === 'user') {
    const rawId = user?.userId;
    if (!rawId || !UUID_REGEX.test(String(rawId).trim())) {
      return false;
    }
  }

  // 8. Reason hợp lệ theo contract hiện tại (bắt buộc nhập lý do audit trail)
  if (!formReason || typeof formReason !== 'string' || formReason.trim().length === 0) {
    return false;
  }

  // 9. Kiểm tra riêng cho Apply
  if (actionType === 'apply') {
    // Model đang chọn thuộc allowedModels
    const modelDef = allowedModels.find(m => m.id === formModel);
    if (!modelDef) return false;

    // Reasoning thuộc reasoningEfforts của model hoặc null nếu model không hỗ trợ
    const efforts = modelDef.reasoningEfforts;
    if (!efforts || efforts.length === 0) {
      if (formReasoningEffort !== null) return false;
    } else {
      if (!efforts.includes(formReasoningEffort)) return false;
    }
    return true;
  }

  // 10. Kiểm tra riêng cho Reset
  if (actionType === 'reset') {
    if (scope === 'user') {
      return Boolean(modelConfigData.targetConfig);
    }
    if (scope === 'all') {
      return Boolean(modelConfigData.globalConfig);
    }
    return false;
  }

  return false;
}
