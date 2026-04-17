const express = require('express');
const modelId = require('../model-id');
const accountManager = require('../account-manager');
const jb = require('../jb-client');
const { pipeNativeProxy } = require('./_native-proxy');

const router = express.Router();

router.post('/v1/responses', async (req, res) => {
  try {
    const account = accountManager.getNext();
    if (!account) {
      return res.status(503).json({ error: { message: 'No active accounts', type: 'server_error' } });
    }

    const mapping = modelId.resolve(req.body.model, 'responses');
    if (!mapping || (mapping.family !== 'openai' && mapping.family !== 'xai')) {
      return res.status(400).json({
        error: {
          message: `Model "${req.body.model}" is not supported on /v1/responses. Use an OpenAI (gpt-*, o1-o4, *-codex) or xAI (grok-*) model, or call /v1/chat/completions or /v1/messages for other providers.`,
          type: 'invalid_request_error',
        },
      });
    }

    const jwt = await accountManager.ensureValidJwt(account);
    const nativeCall = mapping.family === 'xai' ? jb.nativeXaiResponses : jb.nativeOpenaiResponses;
    return pipeNativeProxy(req, res, {
      nativeCall,
      account, jwt, nativeId: mapping.nativeId,
      errorShape: 'openai',
    });
  } catch (err) {
    console.error('POST /v1/responses error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
  }
});

module.exports = router;
