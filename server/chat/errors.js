export class ChatError extends Error {
  constructor(code, message, status = 500, options = {}) {
    super(message, options);
    this.name = 'ChatError';
    this.code = code;
    this.status = status;
    this.statusCode = status;
  }
}

export function toPublicError(error) {
  if (error instanceof ChatError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return {
    code: 'CHAT_INTERNAL_ERROR',
    message: 'Chatbot đang gặp lỗi. Vui lòng thử lại sau.',
    status: 500
  };
}

