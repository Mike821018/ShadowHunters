import { t } from './i18n.js';
import { apiFetch } from './utils.js';

const APP_VERSION = '1.1.0';

function envelope(ok, event, data = null, error = null) {
  return {
    ok,
    event,
    data,
    error,
    meta: { timestamp: new Date().toISOString(), version: APP_VERSION },
  };
}

function fail(event, code, detail, status = 400) {
  return envelope(false, event, null, {
    title: 'Request Failed',
    status,
    detail,
    code,
    errors: [],
  });
}

function translateApiErrorMessage(error) {
  if (!error) return 'request failed';
  const code = String(error.code || '').trim();
  if (code) {
    const key = `api_error.${code}`;
    const params = {};
    if (code === 'TRIP_GAME_COUNT_NOT_ENOUGH') {
      const matchedMin = String(error.detail || '').match(/(\d+)/);
      if (matchedMin) {
        params.min = matchedMin[1];
      }
    }
    const translated = t(key, params);
    if (translated !== key) {
      return translated;
    }
  }
  return error.detail || code || 'request failed';
}

export function createDispatch({ state, setStatus, pushLog, toast, withVillageSuffix, areaNames }) {
  let clientRequestSeq = 0;

  const shouldTryLocalFallback = () => {
    const protocol = String(window.location?.protocol || '').toLowerCase();
    const host = String(window.location?.hostname || '').toLowerCase();
    const port = String(window.location?.port || '').trim();
    if (protocol === 'file:') return true;
    if (host === 'localhost' || host === '127.0.0.1') {
      return port !== '5600';
    }
    return false;
  };

  async function postDispatch(req, dispatchUrl) {
    const resp = await apiFetch(dispatchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    let body = null;
    try {
      body = await resp.json();
    } catch {
    }
    if (body && typeof body === 'object' && 'ok' in body) {
      return { ok: true, envelope: body, httpStatus: resp.status };
    }
    if (!resp.ok) {
      return { ok: false, envelope: fail(req.action, 'HTTP_ERROR', `status ${resp.status}`, resp.status), httpStatus: resp.status };
    }
    return { ok: true, envelope: envelope(true, req.action, body), httpStatus: resp.status };
  }

  async function transportHttp(req) {
    const primary = await postDispatch(req, '/api/dispatch');
    if (primary.ok) return primary.envelope;

    const canFallback = shouldTryLocalFallback() && primary.httpStatus === 404;
    if (!canFallback) return primary.envelope;

    try {
      const fallback = await postDispatch(req, 'http://127.0.0.1:5600/api/dispatch');
      return fallback.envelope;
    } catch {
      return primary.envelope;
    }
  }

  async function transport(req) {
    if (state.transportMode === 'http') return transportHttp(req);

    if (window.SHADOW_API_DISPATCH && typeof window.SHADOW_API_DISPATCH === 'function') {
      return await window.SHADOW_API_DISPATCH(req.action, req.payload);
    }

    try {
      return await transportHttp(req);
    } catch {
      return fail(req.action, 'HTTP_ERROR', 'transport unavailable', 503);
    }
  }

  return async function dispatch(action, payload = {}, options = {}) {
    clientRequestSeq += 1;
    const requestSeq = clientRequestSeq;
    const responseEnvelope = await transport({ action, payload });
    if (!responseEnvelope.ok) {
      const msg = translateApiErrorMessage(responseEnvelope?.error);
      if (!options.silent) {
        pushLog(action, `失敗：${msg}`);
        toast(msg, 'error');
      }
      const err = new Error(msg);
      err.code = responseEnvelope?.error?.code;
      throw err;
    }
    if (!options.silent) {
      setStatus(`最後事件: ${responseEnvelope.event}`);
      pushLog(action, '成功');
    }
    const responseData = responseEnvelope.data;
    if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
      return {
        ...responseData,
        __clientRequestSeq: requestSeq,
      };
    }
    return responseData;
  };
}
