// Presentation adapter only. Authentication, SSE, history and quota stay in ChatPanel.
// Supplying a converter asks the runtime to normalize ThreadMessageLike values
// (metadata defaults, timestamps, attachments) before primitives consume them.
export const convertAssistantUiMessage = message => message;

export function toAssistantUiMessages(messages, pending, failedRequest) {
  const result = messages.map((message, index) => ({
    id: message.id || `kas-${index}`,
    role: message.role,
    content: [{ type: 'text', text: message.content }],
    ...(message.role === 'assistant' ? { status: { type: 'complete', reason: 'stop' } } : {}),
    metadata: { custom: { ...message, messageIndex: index } },
  }));
  if (pending) {
    result.push(
      { id: `${pending.id}-user`, role: 'user', content: [{ type: 'text', text: pending.question }] },
      {
        id: `${pending.id}-assistant`, role: 'assistant',
        content: pending.answer || pending.interaction
          ? [{ type: 'text', text: pending.answer || pending.interaction.prompt }]
          : [],
        status: { type: 'running' },
        metadata: { custom: { ...pending, isPending: true } },
      },
    );
  } else if (failedRequest) {
    result.push({ id: `${failedRequest.id}-user`, role: 'user', content: [{ type: 'text', text: failedRequest.displayQuestion }] });
  }
  return result;
}

export function getComposerQuestion(message) {
  return message.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
}
