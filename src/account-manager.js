const { v4: uuidv4 } = require('uuid');
const { loadCredentials, saveCredentials } = require('./config');
const jb = require('./jb-client');

let accounts = [];
let roundRobinIndex = 0;
let refreshTimer = null;

function init() {
  accounts = loadCredentials();
  startRefreshLoop();
  console.log(`Account manager: loaded ${accounts.length} account(s)`);
}

function getAll() {
  return accounts.map(a => ({
    id: a.id,
    email: a.email,
    status: a.status,
    license_id: a.license_id,
    added_at: a.added_at,
    last_used_at: a.last_used_at,
  }));
}

async function addFromOAuth(tokens, licenseId) {
  const { id_token, refresh_token } = tokens;
  if (!licenseId) throw new Error('License ID is required');

  const payload = jb.decodeJwtPayload(id_token);
  const email = payload.email || payload.preferred_username || 'unknown';

  const existing = accounts.find(a => a.email === email);
  if (existing) {
    existing.refresh_token = refresh_token;
    existing.id_token = id_token;
    existing.id_token_expires_at = (payload.exp || 0) * 1000;
    existing.license_id = licenseId;
    existing.status = 'active';
    await refreshJwt(existing);
    persist();
    return existing;
  }

  const userInfo = await jb.getUserInfo(id_token);
  if (!userInfo.ok) {
    await jb.registerGrazie(id_token);
  }

  const account = {
    id: uuidv4(),
    email,
    refresh_token,
    license_id: licenseId,
    id_token,
    id_token_expires_at: (payload.exp || 0) * 1000,
    jwt: null,
    jwt_expires_at: 0,
    status: 'active',
    added_at: Date.now(),
    last_used_at: null,
  };

  await refreshJwt(account);
  accounts.push(account);
  persist();
  return account;
}

async function addManual(refreshToken, licenseId) {
  if (!licenseId) throw new Error('License ID is required');

  const tokens = await jb.refreshIdToken(refreshToken);
  const payload = jb.decodeJwtPayload(tokens.id_token);
  const email = payload.email || payload.preferred_username || 'unknown';

  const existing = accounts.find(a => a.email === email);
  if (existing) {
    existing.refresh_token = tokens.refresh_token || refreshToken;
    existing.license_id = licenseId;
    existing.id_token = tokens.id_token;
    existing.id_token_expires_at = (payload.exp || 0) * 1000;
    existing.status = 'active';
    await refreshJwt(existing);
    persist();
    return existing;
  }

  const userInfo = await jb.getUserInfo(tokens.id_token);
  if (!userInfo.ok) {
    await jb.registerGrazie(tokens.id_token);
  }

  const account = {
    id: uuidv4(),
    email,
    refresh_token: tokens.refresh_token || refreshToken,
    license_id: licenseId,
    id_token: tokens.id_token,
    id_token_expires_at: (payload.exp || 0) * 1000,
    jwt: null,
    jwt_expires_at: 0,
    status: 'active',
    added_at: Date.now(),
    last_used_at: null,
  };

  await refreshJwt(account);
  accounts.push(account);
  persist();
  return account;
}

function remove(id) {
  const idx = accounts.findIndex(a => a.id === id);
  if (idx === -1) return false;
  accounts.splice(idx, 1);
  persist();
  return true;
}

function getNext() {
  const active = accounts.filter(a => a.status === 'active');
  if (active.length === 0) return null;
  const account = active[roundRobinIndex % active.length];
  roundRobinIndex++;
  account.last_used_at = Date.now();
  return account;
}

async function ensureValidJwt(account) {
  const now = Date.now();

  if (!account.id_token || now > account.id_token_expires_at - 300000) {
    try {
      const tokens = await jb.refreshIdToken(account.refresh_token);
      account.id_token = tokens.id_token;
      if (tokens.refresh_token) account.refresh_token = tokens.refresh_token;
      const payload = jb.decodeJwtPayload(tokens.id_token);
      account.id_token_expires_at = (payload.exp || 0) * 1000;
    } catch (err) {
      account.status = 'error';
      persist();
      throw new Error(`Failed to refresh id_token for ${account.email}: ${err.message}`);
    }
  }

  if (!account.jwt || now > account.jwt_expires_at - 1800000) {
    await refreshJwt(account);
  }

  persist();
  return account.jwt;
}

async function refreshJwt(account) {
  try {
    const result = await jb.provideAccess(account.id_token, account.license_id);
    if (!result.token) throw new Error('No token in provide-access response');
    account.jwt = result.token;
    const jwtPayload = jb.decodeJwtPayload(result.token);
    account.jwt_expires_at = (jwtPayload.exp || 0) * 1000;
    account.status = 'active';
  } catch (err) {
    account.status = 'error';
    persist();
    throw new Error(`Failed to get JWT for ${account.email}: ${err.message}`);
  }
}

async function updateLicenseId(id, licenseId) {
  const account = accounts.find(a => a.id === id);
  if (!account) throw new Error('Account not found');
  account.license_id = licenseId;
  const now = Date.now();
  if (!account.id_token || now > account.id_token_expires_at - 300000) {
    const tokens = await jb.refreshIdToken(account.refresh_token);
    account.id_token = tokens.id_token;
    if (tokens.refresh_token) account.refresh_token = tokens.refresh_token;
    const payload = jb.decodeJwtPayload(tokens.id_token);
    account.id_token_expires_at = (payload.exp || 0) * 1000;
  }
  await refreshJwt(account);
  persist();
  return account;
}

async function forceRefresh(id) {
  const account = accounts.find(a => a.id === id);
  if (!account) throw new Error('Account not found');
  await ensureValidJwt(account);
  persist();
  return account;
}

async function getQuotaForAccount(id) {
  const account = accounts.find(a => a.id === id);
  if (!account) throw new Error('Account not found');
  const jwt = await ensureValidJwt(account);
  return jb.getQuota(jwt);
}

function startRefreshLoop() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    for (const account of accounts) {
      if (account.status !== 'active') continue;
      try {
        await ensureValidJwt(account);
      } catch (err) {
        console.error(`Auto-refresh failed for ${account.email}: ${err.message}`);
      }
    }
  }, 600000);
}

function persist() {
  saveCredentials(accounts);
}

module.exports = {
  init, getAll, addFromOAuth, addManual, remove, updateLicenseId,
  getNext, ensureValidJwt, forceRefresh, getQuotaForAccount,
};
