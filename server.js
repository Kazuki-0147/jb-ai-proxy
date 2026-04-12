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
  if (!config.api_keys || config.api_keys.length === 0) return next();

  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  let token = apiKey;

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token || !config.api_keys.includes(token)) {
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

// Static panel
app.use('/panel', express.static(path.join(__dirname, 'panel')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', accounts: accountManager.getAll().length }));

// API routes (with API key auth)
app.use(apiKeyAuth, openaiRoutes);
app.use(apiKeyAuth, anthropicRoutes);

// Auth + panel API routes (no API key needed)
app.use(authRoutes);
app.use(panelApiRoutes);

// Initialize and start
accountManager.init();

app.listen(config.port, () => {
  console.log(`jb-ai-proxy running on http://localhost:${config.port}`);
  console.log(`Management panel: http://localhost:${config.port}/panel`);
  console.log(`OpenAI endpoint:  http://localhost:${config.port}/v1/chat/completions`);
  console.log(`Anthropic endpoint: http://localhost:${config.port}/v1/messages`);
  console.log(`API key auth: ${config.api_keys.length > 0 ? 'enabled' : 'disabled'}`);
});
