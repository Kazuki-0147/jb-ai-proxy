document.addEventListener('DOMContentLoaded', loadAccounts);

// 通用：给按钮加 loading 状态
async function withLoading(btn, text, fn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = text;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function loadAccounts() {
  const container = document.getElementById('accounts-list');
  container.innerHTML = '<p class="muted">加载中...</p>';
  try {
    const res = await fetch('/api/accounts');
    const accounts = await res.json();

    if (accounts.length === 0) {
      container.innerHTML = '<p class="muted">暂无账号</p>';
      return;
    }

    container.innerHTML = accounts.map(acc => `
      <div class="account-row">
        <div class="account-info">
          <div class="account-email">${esc(acc.email)}</div>
          <div class="account-meta">
            <span class="status status-${acc.status}">${statusText(acc.status)}</span>
            <span>${esc(acc.license_id || '')}</span>
          </div>
          <div id="quota-${acc.id}"></div>
        </div>
        <div class="account-actions">
          <button class="btn-sm" onclick="withLoading(this,'查询中...',()=>loadQuota('${acc.id}'))">配额</button>
          <button class="btn-sm" onclick="withLoading(this,'刷新中...',()=>refreshAccount('${acc.id}'))">刷新</button>
          <button class="btn-danger" onclick="deleteAccount(this,'${acc.id}')">删除</button>
        </div>
      </div>`).join('');
  } catch (err) {
    container.innerHTML = `<p class="muted">加载失败: ${esc(err.message)}</p>`;
  }
}

function statusText(s) {
  const map = { active: '正常', error: '异常', quota_exhausted: '配额耗尽' };
  return map[s] || s;
}

async function loadQuota(id) {
  const el = document.getElementById(`quota-${id}`);
  el.innerHTML = '<span class="muted">查询中...</span>';
  try {
    const res = await fetch(`/api/accounts/${id}/quota`);
    const d = await res.json();
    const used = parseFloat(d.current?.tariffQuota?.current?.amount || d.current?.current?.amount || 0);
    const max = parseFloat(d.current?.tariffQuota?.maximum?.amount || d.current?.maximum?.amount || 1000000);
    const pct = Math.max(0, Math.min(100, ((max - used) / max) * 100));
    el.innerHTML = `
      <div class="account-meta">已用 ${used.toFixed(0)} / ${max.toFixed(0)}</div>
      <div class="quota-bar"><div class="quota-fill" style="width:${pct}%"></div></div>`;
  } catch (err) {
    el.innerHTML = `<span class="muted">${err.message}</span>`;
  }
}

async function refreshAccount(id) {
  try {
    await fetch(`/api/accounts/${id}/refresh`, { method: 'POST' });
    await loadAccounts();
  } catch (err) {
    alert('刷新失败: ' + err.message);
  }
}

async function deleteAccount(btn, id) {
  if (!confirm('确定删除该账号？')) return;
  await withLoading(btn, '删除中...', async () => {
    try {
      await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      await loadAccounts();
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  });
}

async function startOAuth() {
  try {
    const res = await fetch('/auth/start');
    const data = await res.json();
    document.getElementById('oauth-url').href = data.url;
    document.getElementById('oauth-form').classList.remove('hidden');
    document.getElementById('manual-form').classList.add('hidden');
  } catch (err) {
    alert('启动登录失败: ' + err.message);
  }
}

async function submitOAuthCallback(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  await withLoading(btn, '添加中...', async () => {
    const callbackUrl = document.getElementById('oauth-callback').value.trim();
    const licenseId = document.getElementById('oauth-license').value.trim();
    const res = await fetch('/auth/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_url: callbackUrl, license_id: licenseId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    hideOAuthForm();
    await loadAccounts();
  }).catch(err => alert('添加失败: ' + err.message));
}

function hideOAuthForm() {
  document.getElementById('oauth-form').classList.add('hidden');
  document.getElementById('oauth-callback').value = '';
  document.getElementById('oauth-license').value = '';
}

function showManualForm() {
  document.getElementById('manual-form').classList.remove('hidden');
  document.getElementById('oauth-form').classList.add('hidden');
}

function hideManualForm() {
  document.getElementById('manual-form').classList.add('hidden');
}

async function addManual(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  await withLoading(btn, '添加中...', async () => {
    const rt = document.getElementById('manual-rt').value.trim();
    const lid = document.getElementById('manual-lid').value.trim();
    const res = await fetch('/api/accounts/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt, license_id: lid }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    hideManualForm();
    document.getElementById('manual-rt').value = '';
    document.getElementById('manual-lid').value = '';
    await loadAccounts();
  }).catch(err => alert('添加失败: ' + err.message));
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
