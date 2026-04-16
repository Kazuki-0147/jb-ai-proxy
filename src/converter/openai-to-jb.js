const { openaiToolsToJB } = require('./tools');
const { buildParametersData } = require('./parameters');

/**
 * Convert OpenAI /v1/chat/completions request body to JB Grazie request body
 */
function convertRequest(openaiBody) {
  const messages = convertMessages(openaiBody.messages || []);
  const toolsData = openaiToolsToJB(openaiBody.tools);
  const parametersData = buildParametersData(openaiBody.model, openaiBody, toolsData);

  return {
    prompt: 'ij.chat.request.new-chat-on-start',
    profile: openaiBody.model,
    chat: { messages },
    parameters: parametersData.length > 0 ? { data: parametersData } : undefined,
  };
}

function convertMessages(openaiMessages) {
  const jbMessages = [];
  // Build tool_call_id -> function name map from assistant messages
  const toolNameMap = new Map();
  for (const msg of openaiMessages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id && tc.function?.name) {
          toolNameMap.set(tc.id, tc.function.name);
        }
      }
    }
  }

  for (const msg of openaiMessages) {
    switch (msg.role) {
      case 'system':
      case 'developer':
        jbMessages.push({
          type: 'system_message',
          content: extractTextContent(msg.content),
        });
        break;

      case 'user':
        if (Array.isArray(msg.content)) {
          const images = msg.content.filter(c => c.type === 'image_url');
          const texts = msg.content.filter(c => c.type === 'text');

          for (const img of images) {
            const { mediaType, data } = parseImageUrl(img.image_url.url);
            jbMessages.push({ type: 'media_message', mediaType, data });
          }

          jbMessages.push({
            type: 'user_message',
            content: texts.map(t => t.text).join('\n'),
          });
        } else {
          jbMessages.push({
            type: 'user_message',
            content: msg.content || '',
          });
        }
        break;

      case 'assistant':
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          if (msg.content) {
            jbMessages.push({ type: 'assistant_message_text', content: msg.content });
          }
          for (const tc of msg.tool_calls) {
            jbMessages.push({
              type: 'assistant_message_tool',
              id: tc.id,
              toolName: tc.function.name,
              content: tc.function.arguments || '{}',
            });
          }
        } else {
          jbMessages.push({
            type: 'assistant_message_text',
            content: extractTextContent(msg.content),
          });
        }
        break;

      case 'tool':
        jbMessages.push({
          type: 'tool_message',
          id: msg.tool_call_id,
          toolName: msg.name || toolNameMap.get(msg.tool_call_id) || '',
          result: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
        break;
    }
  }

  return jbMessages;
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  }
  return '';
}

function parseImageUrl(url) {
  const dataUrlMatch = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return { mediaType: dataUrlMatch[1], data: dataUrlMatch[2] };
  }
  return { mediaType: 'image/png', data: url };
}

module.exports = { convertRequest, convertMessages };
