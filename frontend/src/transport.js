import { t } from './i18n.js';
import { createDemoDispatch } from './transport/demoEngine.js';
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
  const demoDispatch = createDemoDispatch({ withVillageSuffix, areaNames, envelope, fail });
  let clientRequestSeq = 0;

  async function transportHttp(req) {
    const resp = await apiFetch('/api/dispatch', {
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
      return body;
    }
    if (!resp.ok) return fail(req.action, 'HTTP_ERROR', `status ${resp.status}`, resp.status);
    return envelope(true, req.action, body);
  }

  async function transport(req) {
    if (state.transportMode === 'demo') return demoDispatch(req.action, req.payload);
    if (state.transportMode === 'http') return transportHttp(req);

    if (window.SHADOW_API_DISPATCH && typeof window.SHADOW_API_DISPATCH === 'function') {
      return await window.SHADOW_API_DISPATCH(req.action, req.payload);
    }

    try {
      const result = await transportHttp(req);
      if (!result.ok && result.error?.code === 'HTTP_ERROR') {
        return demoDispatch(req.action, req.payload);
      }
      return result;
    } catch {
      return demoDispatch(req.action, req.payload);
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
