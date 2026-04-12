const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    const defaults = { port: 3000, api_keys: [], grazie_agent: { name: 'aia:idea', version: '261.22158.366:261.22158.277' } };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }
}

function loadCredentials() {
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  } catch {
    fs.writeFileSync(CREDENTIALS_PATH, '[]');
    return [];
  }
}

function saveCredentials(credentials) {
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
}

module.exports = { loadConfig, loadCredentials, saveCredentials, CONFIG_PATH, CREDENTIALS_PATH };
