const express = require('express');
const { convertRequest } = require('../converter/openai-to-jb');
const { convertStreamToOpenAI } = require('../converter/jb-to-openai');
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
    const jbBody = convertRequest(req.body);
    const jbRes = await jb.chatStream(jwt, jbBody);

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

module.exports = router;
