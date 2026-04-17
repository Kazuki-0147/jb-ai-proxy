const express = require('express');
const { convertRequest } = require('../converter/anthropic-to-jb');
const { convertStreamToAnthropic } = require('../converter/jb-to-anthropic');
const { endpointFor } = require('../converter/parameters');
const modelId = require('../model-id');
const accountManager = require('../account-manager');
const jb = require('../jb-client');
const { pipeNativeProxy } = require('./_native-proxy');

const router = express.Router();

router.post('/v1/messages', async (req, res) => {
  try {
    const account = accountManager.getNext();
    if (!account) {
      return res.status(503).json({
        type: 'error',
        error: { type: 'overloaded_error', message: 'No active accounts' },
      });
    }

    const jwt = await accountManager.ensureValidJwt(account);

    // Native Anthropic passthrough — full JB /anthropic/v1/messages proxy,
    // preserves extended thinking, prompt caching, and every other native
    // feature unchanged.
    const mapping = modelId.resolve(req.body.model);
    if (mapping && mapping.family === 'anthropic') {
      return pipeNativeProxy(req, res, {
        nativeCall: jb.nativeAnthropicMessages,
        account, jwt, nativeId: mapping.nativeId,
        errorShape: 'anthropic',
      });
    }

    // Aggregated fallback for cross-provider requests (e.g. Anthropic client
    // calling GPT or Gemini through /v1/messages).
    const jbBody = convertRequest(req.body);
    const call = endpointFor(req.body.model) === 'responses' ? jb.responsesStream : jb.chatStream;
    const jbRes = await call(jwt, jbBody);

    if (!jbRes.ok) {
      const errText = await jbRes.text();
      const status = jbRes.status === 477 ? 429 : jbRes.status;
      if (jbRes.status === 477) account.status = 'quota_exhausted';
      return res.status(status).json({
        type: 'error',
        error: { type: 'api_error', message: errText },
      });
    }

    const isStream = req.body.stream !== false;
    await convertStreamToAnthropic(jbRes.body, res, req.body.model, isStream);
  } catch (err) {
    console.error('POST /v1/messages error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({
        type: 'error',
        error: { type: 'api_error', message: err.message },
      });
    }
  }
});

module.exports = router;
