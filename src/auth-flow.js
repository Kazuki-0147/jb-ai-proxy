const crypto = require('crypto');

const pendingFlows = new Map();

function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

function startOAuthFlow(port) {
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `http://localhost:${port}`;

  pendingFlows.set(state, { codeVerifier, redirectUri, createdAt: Date.now() });

  // Clean up old flows (>10 min)
  for (const [key, val] of pendingFlows) {
    if (Date.now() - val.createdAt > 600000) pendingFlows.delete(key);
  }

  const params = new URLSearchParams({
    client_id: 'ide',
    scope: 'openid offline_access r_ide_auth',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
  });

  return {
    url: `https://account.jetbrains.com/oauth/login?${params}`,
    state,
  };
}

async function exchangeCode(code, state) {
  const flow = pendingFlows.get(state);
  if (!flow) throw new Error('Invalid or expired OAuth state');
  pendingFlows.delete(state);

  const res = await fetch('https://oauth.account.jetbrains.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: flow.codeVerifier,
      client_id: 'ide',
      redirect_uri: flow.redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

module.exports = { startOAuthFlow, exchangeCode };
