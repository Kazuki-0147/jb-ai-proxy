const express = require('express');
const { convertRequest } = require('../converter/anthropic-to-jb');
const { convertStreamToAnthropic } = require('../converter/jb-to-anthropic');
const accountManager = require('../account-manager');
const jb = require('../jb-client');

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
    const jbBody = convertRequest(req.body);
    const jbRes = await jb.chatStream(jwt, jbBody);

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
