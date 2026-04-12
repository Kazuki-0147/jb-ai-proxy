const express = require('express');
const path = require('path');
const { loadConfig } = require('./src/config');
const accountManager = require('./src/account-manager');
const openaiRoutes = require('./src/routes/openai');
const anthropicRoutes = require('./src/routes/anthropic');
const authRoutes = require('./src/routes/auth');
const panelApiRoutes = require('./src/routes/panel-api');

const config = loadConfig();
const app = express();

app.use(express.json({ limit: '50mb' }));

// Strip undefined/null/"[undefined]" fields from request body
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = cleanBody(req.body);
  }
  next();
});

function cleanBody(obj) {
  if (Array.isArray(obj)) return obj.map(cleanBody);
  if (obj && typeof obj === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null || v === '[undefined]') continue;
      clean[k] = typeof v === 'object' ? cleanBody(v) : v;
    }
    return clean;
  }
  return obj;
}

// API Key authentication (only for /v1/* routes)
function apiKeyAuth(req, res, next) {
  if (!req.path.startsWith('/v1/')) return next();
  if (!config.api_key) return next();

  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  let token = apiKey;

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (token !== config.api_key) {
    if (req.path.startsWith('/v1/messages')) {
      return res.status(401).json({
        type: 'error',
        error: { type: 'authentication_error', message: 'Invalid API key' },
      });
    }
    return res.status(401).json({
      error: { message: 'Invalid API key', type: 'invalid_api_key' },
    });
  }

  next();
}

// Panel password auth
function panelAuth(req, res, next) {
  if (!config.panel_password) return next();
  const token = req.cookies?.panel_token || req.headers['x-panel-token'];
  if (token === config.panel_password) return next();
  const fullPath = req.baseUrl + req.path;
  // Let login page and login API through
  if (fullPath === '/panel/login.html' || fullPath === '/api/panel/login') return next();
  // Static assets (css/js) let through so login page works
  if (fullPath.startsWith('/panel/') && (fullPath.endsWith('.css') || fullPath.endsWith('.js'))) return next();
  // Redirect panel page to login
  if (fullPath.startsWith('/panel')) return res.redirect('/panel/login.html');
  // Block API calls
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Parse cookies
app.use((req, res, next) => {
  req.cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) req.cookies[k] = v.join('=');
  });
  next();
});

// Static panel (with auth)
app.use('/panel', panelAuth, express.static(path.join(__dirname, 'panel')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', accounts: accountManager.getAll().length }));

// Panel login API
app.post('/api/panel/login', (req, res) => {
  if (req.body.password === config.panel_password) {
    res.setHeader('Set-Cookie', `panel_token=${config.panel_password}; HttpOnly; Path=/; Max-Age=${7*24*3600}`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: '密码错误' });
});

// Panel logout
app.post('/api/panel/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'panel_token=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// API routes (with API key auth)
app.use(apiKeyAuth, openaiRoutes);
app.use(apiKeyAuth, anthropicRoutes);

// Auth + panel API routes (with panel password auth)
app.use(panelAuth, authRoutes);
app.use(panelAuth, panelApiRoutes);

// Initialize and start
accountManager.init();

app.listen(config.port, () => {
  console.log(`jb-ai-proxy running on http://localhost:${config.port}`);
  console.log(`Management panel: http://localhost:${config.port}/panel`);
  console.log(`OpenAI endpoint:  http://localhost:${config.port}/v1/chat/completions`);
  console.log(`Anthropic endpoint: http://localhost:${config.port}/v1/messages`);
  console.log(`API key auth: ${config.api_key ? 'enabled' : 'disabled'}`);
});
