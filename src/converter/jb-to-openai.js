const { v4: uuidv4 } = require('uuid');

/**
 * Parse JB SSE stream and convert to OpenAI SSE format or buffered JSON.
 */
async function convertStreamToOpenAI(jbStream, res, model, stream = true) {
  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  const buffer = { content: '', tool_calls: [], finish_reason: null };
  const activeToolCalls = new Map();

  const decoder = new TextDecoder();
  let leftover = '';

  for await (const chunk of jbStream) {
    const text = leftover + decoder.decode(chunk, { stream: true });
    const lines = text.split('\n');
    leftover = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (dataStr === 'end' || dataStr === '') continue;

      let event;
      try { event = JSON.parse(dataStr); } catch { continue; }

      if (event.type === 'Content') {
        if (stream) {
          res.write(`data: ${JSON.stringify(makeChunk(id, created, model, { content: event.content || '' }))}\n\n`);
        } else {
          buffer.content += event.content || '';
        }
      } else if (event.type === 'ToolCall') {
        const idx = event.parallelToolIndex || 0;

        if (event.id && event.name) {
          activeToolCalls.set(idx, { id: event.id, name: event.name, arguments: '' });
          if (stream) {
            res.write(`data: ${JSON.stringify(makeChunk(id, created, model, {
              tool_calls: [{ index: idx, id: event.id, type: 'function', function: { name: event.name, arguments: '' } }],
            }))}\n\n`);
          }
        } else if (event.content) {
          const tc = activeToolCalls.get(idx);
          if (tc) tc.arguments += event.content;
          if (stream) {
            res.write(`data: ${JSON.stringify(makeChunk(id, created, model, {
              tool_calls: [{ index: idx, function: { arguments: event.content } }],
            }))}\n\n`);
          }
        }
      } else if (event.type === 'FinishMetadata') {
        const finishReason = event.reason === 'tool_call' ? 'tool_calls' : 'stop';
        if (stream) {
          res.write(`data: ${JSON.stringify(makeChunk(id, created, model, {}, finishReason))}\n\n`);
        } else {
          buffer.finish_reason = finishReason;
          for (const [, tc] of activeToolCalls) {
            buffer.tool_calls.push({
              id: tc.id, type: 'function',
              function: { name: tc.name, arguments: tc.arguments },
            });
          }
        }
      }
    }
  }

  if (stream) {
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    const response = {
      id, object: 'chat.completion', created, model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: buffer.content || null,
        },
        finish_reason: buffer.finish_reason || 'stop',
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    if (buffer.tool_calls.length > 0) {
      response.choices[0].message.tool_calls = buffer.tool_calls;
      if (!buffer.content) response.choices[0].message.content = null;
    }
    res.json(response);
  }
}

function makeChunk(id, created, model, delta, finishReason = null) {
  return {
    id, object: 'chat.completion.chunk', created, model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

module.exports = { convertStreamToOpenAI };
