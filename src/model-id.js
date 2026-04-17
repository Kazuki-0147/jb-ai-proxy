/**
 * Map between client-facing model IDs (JB profile IDs like
 * `anthropic-claude-4-7-opus`) and the canonical provider IDs that the
 * JB native passthrough endpoints (`/user/v5/llm/<provider>/...`) expect
 * (like `claude-opus-4-7`).
 *
 * resolve(modelId):
 *   - returns { family, nativeId } when the model can be routed to a
 *     native passthrough endpoint
 *   - returns null otherwise — caller should fall back to the aggregated
 *     chat/stream endpoint with the existing converters
 */

// JB profile ID → native Anthropic model ID. Verified from the
// /anthropic/v1/messages "Unsupported model" error list.
const ANTHROPIC_PROFILE_TO_NATIVE = {
  'anthropic-claude-4-sonnet':   'claude-sonnet-4-20250514',
  'anthropic-claude-4.1-opus':   'claude-opus-4-1-20250805',
  'anthropic-claude-4-5-sonnet': 'claude-sonnet-4-5-20250929',
  'anthropic-claude-4-5-haiku':  'claude-haiku-4-5-20251001',
  'anthropic-claude-4-5-opus':   'claude-opus-4-5-20251101',
  'anthropic-claude-4-6-opus':   'claude-opus-4-6',
  'anthropic-claude-4-6-sonnet': 'claude-sonnet-4-6',
  'anthropic-claude-4-7-opus':   'claude-opus-4-7',
};

// JB profile ID → native OpenAI model ID. Codex variants deliberately
// omitted — /openai/v1/chat/completions rejects them; they fall through
// to the aggregated responses/stream/v8 path instead.
const OPENAI_PROFILE_TO_NATIVE = {
  'openai-gpt-4':        'gpt-4',
  'openai-gpt-4-turbo':  'gpt-4-turbo',
  'openai-gpt-4o':       'gpt-4o',
  'openai-gpt-4o-mini':  'gpt-4o-mini',
  'openai-o1':           'o1',
  'openai-o3':           'o3',
  'openai-o3-mini':      'o3-mini',
  'openai-o4-mini':      'o4-mini',
  'openai-gpt4.1':       'gpt-4.1',
  'openai-gpt4.1-mini':  'gpt-4.1-mini',
  'openai-gpt4.1-nano':  'gpt-4.1-nano',
  'openai-gpt-5':        'gpt-5',
  'openai-gpt-5-mini':   'gpt-5-mini',
  'openai-gpt-5-nano':   'gpt-5-nano',
  'openai-gpt-5-1':      'gpt-5.1',
  'openai-gpt-5-2':      'gpt-5.2',
  'openai-gpt-5-4':      'gpt-5.4',
  'openai-gpt-5-4-mini': 'gpt-5.4-mini',
  'openai-gpt-5-4-nano': 'gpt-5.4-nano',
};

function resolve(modelId) {
  if (!modelId || typeof modelId !== 'string') return null;

  // Anthropic
  if (ANTHROPIC_PROFILE_TO_NATIVE[modelId]) {
    return { family: 'anthropic', nativeId: ANTHROPIC_PROFILE_TO_NATIVE[modelId] };
  }
  if (modelId.startsWith('claude-')) {
    return { family: 'anthropic', nativeId: modelId };
  }

  // OpenAI — codex variants are unsupported on chat/completions and must
  // keep using the aggregated path.
  if (modelId.includes('codex')) return null;

  if (OPENAI_PROFILE_TO_NATIVE[modelId]) {
    return { family: 'openai', nativeId: OPENAI_PROFILE_TO_NATIVE[modelId] };
  }
  // Raw OpenAI native IDs (gpt-*, o1/o3/o4, including dated pins like
  // gpt-5-2025-08-07). JB applies its own profile whitelist; if a model
  // isn't available the 400 is forwarded verbatim to the client.
  if (/^(gpt-|o[134]($|-))/.test(modelId)) {
    return { family: 'openai', nativeId: modelId };
  }

  return null;
}

module.exports = { resolve };
