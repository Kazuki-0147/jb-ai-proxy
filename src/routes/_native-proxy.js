/**
 * Shared pipeline for the native passthrough routes
 * (Anthropic /v1/messages, OpenAI /v1/chat/completions and /v1/responses).
 *
 * - Replaces req.body.model with the resolved nativeId, then forwards the
 *   request body as-is to a JB native endpoint.
 * - Streams the upstream response body back unchanged, with matching
 *   Content-Type so SSE vs JSON works for both sides.
 * - Wires an AbortController to req `close` so client disconnects cancel
 *   the upstream fetch instead of leaving the JB socket hanging.
 * - Maps JB's 477 "quota exhausted" to 429 and flips the account status.
 * - Preserves each provider's error body shape when present; otherwise
 *   wraps whatever upstream returned in the appropriate envelope.
 */

async function pipeNativeProxy(req, res, opts) {
  const { nativeCall, account, jwt, nativeId, errorShape } = opts;
  const body = { ...req.body, model: nativeId };

  const ctrl = new AbortController();
  const onClose = () => ctrl.abort();
  req.on('close', onClose);

  let jbRes;
  try {
    jbRes = await nativeCall(jwt, body, ctrl.signal);
  } catch (err) {
    req.off('close', onClose);
    if (err.name === 'AbortError') return;
    throw err;
  }

  if (!jbRes.ok) {
    req.off('close', onClose);
    return forwardError(res, jbRes, account, errorShape);
  }

  const ct = jbRes.headers.get('content-type') || 'application/json';
  res.status(jbRes.status);
  res.setHeader('Content-Type', ct);
  if (ct.includes('text/event-stream')) {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  try {
    for await (const chunk of jbRes.body) {
      if (ctrl.signal.aborted) break;
      if (!res.write(chunk)) {
        await waitDrainOrAbort(res, ctrl.signal);
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
  } finally {
    req.off('close', onClose);
    if (!res.writableEnded) res.end();
  }
}

function waitDrainOrAbort(res, signal) {
  return new Promise(resolve => {
    const onDrain = () => { cleanup(); resolve(); };
    const onAbort = () => { cleanup(); resolve(); };
    const cleanup = () => {
      res.off('drain', onDrain);
      signal.removeEventListener('abort', onAbort);
    };
    res.once('drain', onDrain);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function forwardError(res, jbRes, account, errorShape) {
  const errText = await jbRes.text();
  const status = jbRes.status === 477 ? 429 : jbRes.status;
  if (jbRes.status === 477) account.status = 'quota_exhausted';

  try {
    const parsed = JSON.parse(errText);
    const valid = errorShape === 'anthropic'
      ? (parsed && parsed.type === 'error')
      : (parsed && parsed.error);
    if (valid) return res.status(status).json(parsed);
  } catch {}

  if (errorShape === 'anthropic') {
    return res.status(status).json({
      type: 'error',
      error: { type: 'api_error', message: errText },
    });
  }
  return res.status(status).json({
    error: { message: errText, type: 'api_error' },
  });
}

module.exports = { pipeNativeProxy };
