const express = require('express');
const { startOAuthFlow, exchangeCode } = require('../auth-flow');
const accountManager = require('../account-manager');
const { loadConfig } = require('../config');

const router = express.Router();

// GET /auth/start - generate OAuth URL, return as JSON
router.get('/auth/start', (req, res) => {
  const config = loadConfig();
  const { url, state } = startOAuthFlow(config.port);
  res.json({ url, state });
});

// POST /auth/callback - user pastes the callback URL, extract code and exchange
router.post('/auth/callback', async (req, res) => {
  const { callback_url } = req.body;
  if (!callback_url) {
    return res.status(400).json({ error: 'callback_url is required' });
  }

  try {
    // Extract code and state from the pasted URL
    const url = new URL(callback_url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return res.status(400).json({ error: 'URL missing code or state parameter' });
    }

    const tokens = await exchangeCode(code, state);
    const licenseId = req.body.license_id || '';
    const account = await accountManager.addFromOAuth(tokens, licenseId);
    res.json({ id: account.id, email: account.email, status: account.status });
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// OAuth callback (local browser redirect lands here)
router.get('/', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.redirect('/panel');

  // Show a page that lets user enter license_id and complete the flow
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>OAuth Callback</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,-apple-system,sans-serif;background:#f8fafc;color:#1e293b;display:flex;justify-content:center;align-items:center;min-height:100vh}
.box{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:32px;max-width:420px;width:100%}
h2{font-size:18px;font-weight:600;margin-bottom:16px}label{display:block;font-size:12px;font-weight:500;color:#64748b;margin-bottom:4px}
input{width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;margin-bottom:14px}
input:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.1)}
button{padding:9px 18px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:none;background:#2563eb;color:#fff}
button:hover{background:#1d4ed8}button:disabled{opacity:0.5;cursor:not-allowed}
.muted{color:#64748b;font-size:12px;margin-bottom:14px}a{color:#2563eb}</style></head>
<body><div class="box">
<h2>登录成功，请输入 License ID</h2>
<p class="muted">打开 <a href="https://account.jetbrains.com/licenses" target="_blank">account.jetbrains.com/licenses</a> 页面查看</p>
<form onsubmit="handleSubmit(event)">
<label>License ID</label>
<input type="text" id="lid" required placeholder="ULJX59IS80">
<button type="submit" id="btn">完成添加</button>
</form>
<p id="msg" style="margin-top:12px;font-size:13px"></p>
</div>
<script>
async function handleSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn');
  const msg = document.getElementById('msg');
  btn.disabled = true; btn.textContent = '添加中...';
  try {
    const res = await fetch('/auth/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_url: location.href,
        license_id: document.getElementById('lid').value.trim()
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    msg.style.color = '#166534';
    msg.textContent = '添加成功: ' + data.email;
    setTimeout(() => location.href = '/panel', 1500);
  } catch (err) {
    msg.style.color = '#dc2626';
    msg.textContent = err.message;
    btn.disabled = false; btn.textContent = '完成添加';
  }
}
</script></body></html>`);
});

module.exports = router;
