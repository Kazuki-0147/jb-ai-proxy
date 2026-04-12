const { anthropicToolsToJB, buildParametersData } = require('./tools');

/**
 * Convert Anthropic /v1/messages request body to JB Grazie request body
 */
function convertRequest(anthropicBody) {
  const messages = convertMessages(anthropicBody.system, anthropicBody.messages || []);
  const toolsData = anthropicToolsToJB(anthropicBody.tools);
  const parametersData = buildParametersData(toolsData);

  return {
    prompt: 'ij.chat.request.new-chat-on-start',
    profile: anthropicBody.model,
    chat: { messages },
    parameters: parametersData.length > 0 ? { data: parametersData } : undefined,
  };
}

function convertMessages(system, anthropicMessages) {
  const jbMessages = [];

  // Build tool_use_id -> name map from assistant messages
  const toolNameMap = new Map();
  for (const msg of anthropicMessages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use' && block.id && block.name) {
          toolNameMap.set(block.id, block.name);
        }
      }
    }
  }

  if (system) {
    const systemText = typeof system === 'string'
      ? system
      : system.map(s => s.text || '').join('\n');
    jbMessages.push({ type: 'system_message', content: systemText });
  }

  for (const msg of anthropicMessages) {
    switch (msg.role) {
      case 'user':
        if (typeof msg.content === 'string') {
          jbMessages.push({ type: 'user_message', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          const images = msg.content.filter(c => c.type === 'image');
          const texts = msg.content.filter(c => c.type === 'text');
          const toolResults = msg.content.filter(c => c.type === 'tool_result');

          for (const img of images) {
            jbMessages.push({
              type: 'media_message',
              mediaType: img.source.media_type,
              data: img.source.data,
            });
          }

          if (texts.length > 0) {
            jbMessages.push({
              type: 'user_message',
              content: texts.map(t => t.text).join('\n'),
            });
          }

          for (const tr of toolResults) {
            const resultContent = typeof tr.content === 'string'
              ? tr.content
              : (Array.isArray(tr.content)
                ? tr.content.map(c => c.text || '').join('\n')
                : JSON.stringify(tr.content));
            jbMessages.push({
              type: 'tool_message',
              id: tr.tool_use_id,
              toolName: toolNameMap.get(tr.tool_use_id) || '',
              result: resultContent,
            });
          }
        }
        break;

      case 'assistant':
        if (typeof msg.content === 'string') {
          jbMessages.push({ type: 'assistant_message_text', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          const textParts = msg.content.filter(c => c.type === 'text');
          const toolUses = msg.content.filter(c => c.type === 'tool_use');

          if (textParts.length > 0) {
            jbMessages.push({
              type: 'assistant_message_text',
              content: textParts.map(t => t.text).join('\n'),
            });
          }

          for (const tu of toolUses) {
            jbMessages.push({
              type: 'assistant_message_tool',
              id: tu.id,
              toolName: tu.name,
              content: JSON.stringify(tu.input || {}),
            });
          }
        }
        break;
    }
  }

  return jbMessages;
}

module.exports = { convertRequest, convertMessages };
