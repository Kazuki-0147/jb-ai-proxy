const express = require('express');
const accountManager = require('../account-manager');

const router = express.Router();

router.get('/api/accounts', (req, res) => {
  res.json(accountManager.getAll());
});

router.post('/api/accounts/manual', async (req, res) => {
  const { refresh_token, license_id } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required' });
  }
  try {
    const account = await accountManager.addManual(refresh_token, license_id || '');
    res.json({ id: account.id, email: account.email, status: account.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/accounts/:id', (req, res) => {
  const ok = accountManager.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Account not found' });
  res.json({ ok: true });
});

router.post('/api/accounts/:id/license', async (req, res) => {
  const { license_id } = req.body;
  if (!license_id) return res.status(400).json({ error: 'license_id is required' });
  try {
    const account = await accountManager.updateLicenseId(req.params.id, license_id);
    res.json({ id: account.id, email: account.email, status: account.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/accounts/:id/refresh', async (req, res) => {
  try {
    await accountManager.forceRefresh(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/accounts/:id/quota', async (req, res) => {
  try {
    const quota = await accountManager.getQuotaForAccount(req.params.id);
    res.json(quota);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
