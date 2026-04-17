const express = require('express');
const { convertRequest } = require('../converter/openai-to-jb');
const { convertStreamToOpenAI } = require('../converter/jb-to-openai');
const { endpointFor } = require('../converter/parameters');
const modelId = require('../model-id');
const accountManager = require('../account-manager');
const jb = require('../jb-client');

const router = express.Router();

router.get('/v1/models', async (req, res) => {
  try {
    const account = accountManager.getNext();
    if (!account) return res.status(503).json({ error: { message: 'No active accounts', type: 'server_error' } });

    const jwt = await accountManager.ensureValidJwt(account);
    const profiles = await jb.getProfiles(jwt);

    const models = (profiles.profiles || []).map(p => ({
      id: p.id,
      object: 'model',
      created: 0,
      owned_by: p.provider || 'jetbrains',
    }));

    res.json({ object: 'list', data: models });
  } catch (err) {
    console.error('GET /v1/models error:', err.message);
    res.status(500).json({ error: { message: err.message, type: 'server_error' } });
  }
});

router.post('/v1/chat/completions', async (req, res) => {
  try {
    const account = accountManager.getNext();
    if (!account) return res.status(503).json({ error: { message: 'No active accounts', type: 'server_error' } });

    const jwt = await accountManager.ensureValidJwt(account);

    // Native OpenAI passthrough — route GPT/o-series requests directly to
    // the JB /openai/v1/chat/completions endpoint, preserving native fields
    // (response_format, logprobs, parallel_tool_calls, etc.) unchanged.
    const mapping = modelId.resolve(req.body.model);
    if (mapping && mapping.family === 'openai') {
      return proxyNativeOpenai(req, res, jwt, account, mapping.nativeId);
    }

    // Aggregated fallback for cross-provider requests and for codex/embedding
    // profiles that the native endpoint doesn't accept.
    const jbBody = convertRequest(req.body);
    const call = endpointFor(req.body.model) === 'responses' ? jb.responsesStream : jb.chatStream;
    const jbRes = await call(jwt, jbBody);

    if (!jbRes.ok) {
      const errText = await jbRes.text();
      const status = jbRes.status === 477 ? 429 : jbRes.status;
      if (jbRes.status === 477) account.status = 'quota_exhausted';
      return res.status(status).json({ error: { message: errText, type: 'api_error' } });
    }

    const isStream = req.body.stream !== false;
    await convertStreamToOpenAI(jbRes.body, res, req.body.model, isStream);
  } catch (err) {
    console.error('POST /v1/chat/completions error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  }
});

async function proxyNativeOpenai(req, res, jwt, account, nativeId) {
  const body = { ...req.body, model: nativeId };
  const jbRes = await jb.nativeOpenaiChatCompletions(jwt, body);

  if (!jbRes.ok) {
    const errText = await jbRes.text();
    const status = jbRes.status === 477 ? 429 : jbRes.status;
    if (jbRes.status === 477) account.status = 'quota_exhausted';
    try {
      const parsed = JSON.parse(errText);
      if (parsed && parsed.error) {
        return res.status(status).json(parsed);
      }
    } catch {}
    return res.status(status).json({
      error: { message: errText, type: 'api_error' },
    });
  }

  const ct = jbRes.headers.get('content-type') || 'application/json';
  res.status(jbRes.status);
  res.setHeader('Content-Type', ct);
  if (ct.includes('text/event-stream')) {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  for await (const chunk of jbRes.body) {
    if (!res.write(chunk)) {
      await new Promise(resolve => res.once('drain', resolve));
    }
  }
  res.end();
}

module.exports = router;
