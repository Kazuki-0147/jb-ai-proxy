const { loadConfig } = require('./config');

const JB_API_BASE = 'https://api.jetbrains.ai';
const JB_OAUTH_BASE = 'https://oauth.account.jetbrains.com';

async function refreshIdToken(refreshToken) {
  const res = await fetch(`${JB_OAUTH_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: 'ide',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`refreshIdToken failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function registerGrazie(idToken) {
  const res = await fetch(`${JB_API_BASE}/auth/jetbrains-jwt/register`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'User-Agent': 'ktor-client',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`registerGrazie failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function provideAccess(idToken, licenseId) {
  const res = await fetch(`${JB_API_BASE}/auth/jetbrains-jwt/provide-access/license/v2`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ktor-client',
    },
    body: JSON.stringify({ licenseId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`provideAccess failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function getUserInfo(idToken) {
  const res = await fetch(`${JB_API_BASE}/auth/jetbrains-jwt/user-info`, {
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'User-Agent': 'ktor-client',
    },
  });
  return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : null };
}

async function getProfiles(jwt) {
  const res = await fetch(`${JB_API_BASE}/user/v5/llm/profiles/v8`, {
    headers: {
      'grazie-authenticate-jwt': jwt,
      'User-Agent': 'ktor-client',
    },
  });
  if (!res.ok) throw new Error(`getProfiles failed (${res.status})`);
  return res.json();
}

async function getQuota(jwt) {
  const res = await fetch(`${JB_API_BASE}/user/v5/quota/get`, {
    method: 'POST',
    headers: {
      'grazie-authenticate-jwt': jwt,
      'Content-Type': 'application/json',
      'User-Agent': 'ktor-client',
    },
    body: '{}',
  });
  if (!res.ok) throw new Error(`getQuota failed (${res.status})`);
  return res.json();
}

function llmStream(jwt, body, path) {
  const config = loadConfig();
  return fetch(`${JB_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Accept-Charset': 'UTF-8',
      'Cache-Control': 'no-cache',
      'grazie-authenticate-jwt': jwt,
      'grazie-agent': JSON.stringify(config.grazie_agent),
      'User-Agent': 'ktor-client',
    },
    body: JSON.stringify(body),
  });
}

function chatStream(jwt, body) {
  return llmStream(jwt, body, '/user/v5/llm/chat/stream/v8');
}

function responsesStream(jwt, body) {
  return llmStream(jwt, body, '/user/v5/llm/responses/stream/v8');
}

function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
  return JSON.parse(payload);
}

module.exports = {
  refreshIdToken, registerGrazie, provideAccess, getUserInfo,
  getProfiles, getQuota, chatStream, responsesStream, decodeJwtPayload,
  JB_API_BASE, JB_OAUTH_BASE,
};
