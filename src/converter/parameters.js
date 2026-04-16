/**
 * Provider identification + parameter whitelist for JetBrains Grazie API.
 *
 * JB rejects unsupported parameters with HTTP 400 rather than silently
 * ignoring them, so we must filter per-provider. Whitelist verified by
 * testing against claude-4.7-opus, gpt-5-4, o1/o3/o3-mini/o4-mini,
 * gemini-3.1-pro, grok-4.1-fast (2026-04).
 */

const JB = {
  LENGTH:    { fqdn: 'llm.parameters.length',            type: 'int' },
  TEMP:      { fqdn: 'llm.parameters.temperature',       type: 'double' },
  TOP_P:     { fqdn: 'llm.parameters.top-p',             type: 'double' },
  SEED:      { fqdn: 'llm.parameters.seed',              type: 'int' },
  N:         { fqdn: 'llm.parameters.number-of-choices', type: 'int' },
  STOP:      { fqdn: 'llm.parameters.stop-token',        type: 'text' },
  EFFORT:    { fqdn: 'llm.parameters.reasoning-effort',  type: 'text' },
  VERBOSITY: { fqdn: 'llm.parameters.verbosity',         type: 'text' },
};

const PROVIDERS = {
  codex: {
    match: p => p.startsWith('openai-') && p.includes('codex'),
    allow: new Set(),
    endpoint: 'responses',
  },
  gpt5: {
    match: p => /^openai-gpt-5/.test(p),
    allow: new Set([JB.LENGTH, JB.EFFORT, JB.VERBOSITY]),
  },
  'openai-reasoning': {
    match: p => /^openai-o\d/.test(p),
    allow: new Set([JB.LENGTH, JB.SEED, JB.EFFORT, JB.N]),
  },
  openai: {
    match: p => p.startsWith('openai-'),
    allow: new Set([JB.LENGTH, JB.TEMP, JB.TOP_P, JB.SEED, JB.N]),
  },
  anthropic: {
    match: p => p.startsWith('anthropic-'),
    allow: new Set([JB.LENGTH, JB.STOP]),
  },
  google: {
    match: p => p.startsWith('google-'),
    allow: new Set([JB.LENGTH, JB.TEMP, JB.TOP_P, JB.EFFORT]),
    clamp: { [JB.TEMP.fqdn]: [0, 1] },
  },
  xai: {
    match: p => p.startsWith('xai-'),
    allow: new Set([JB.LENGTH, JB.TEMP, JB.TOP_P, JB.SEED, JB.N]),
    clamp: { [JB.TEMP.fqdn]: [0, 2] },
  },
};

const ORDER = ['codex', 'gpt5', 'openai-reasoning', 'openai', 'anthropic', 'google', 'xai'];

function identify(profile) {
  if (!profile) return null;
  for (const name of ORDER) {
    if (PROVIDERS[name].match(profile)) return PROVIDERS[name];
  }
  return null;
}

function endpointFor(profile) {
  return identify(profile)?.endpoint || 'chat';
}

function buildParametersData(profile, body, toolsData) {
  const provider = identify(profile);

  // Providers with no allowed params (e.g. codex) also can't take tools — keep parameters omitted entirely.
  if (provider && provider.allow.size === 0) return [];

  const data = [];
  if (provider) {
    const { allow, clamp } = provider;
    const add = (jb, rawValue) => {
      if (!allow.has(jb)) return;
      let v = rawValue;
      const range = clamp?.[jb.fqdn];
      if (range && typeof v === 'number') v = Math.max(range[0], Math.min(range[1], v));
      data.push({ type: jb.type, fqdn: jb.fqdn });
      data.push({ type: jb.type, value: v });
    };

    if (Number.isInteger(body.max_tokens)) add(JB.LENGTH, body.max_tokens);
    if (typeof body.temperature === 'number') add(JB.TEMP, body.temperature);
    if (typeof body.top_p === 'number') add(JB.TOP_P, body.top_p);
    if (Number.isInteger(body.seed)) add(JB.SEED, body.seed);
    if (Number.isInteger(body.n)) add(JB.N, body.n);
    if (typeof body.reasoning_effort === 'string') add(JB.EFFORT, body.reasoning_effort);
    if (typeof body.verbosity === 'string') add(JB.VERBOSITY, body.verbosity);

    const stop = body.stop_sequences ?? body.stop;
    const stopVal = Array.isArray(stop) ? stop[0] : stop;
    if (typeof stopVal === 'string' && stopVal) add(JB.STOP, stopVal);
  }

  if (toolsData && toolsData.length > 0) data.push(...toolsData);

  return data;
}

module.exports = { buildParametersData, identify, endpointFor };
