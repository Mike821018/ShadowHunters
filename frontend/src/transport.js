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

// 2026-10-09 修正：BAD_REQUEST、INVALID_PAYLOAD 這兩個錯誤代碼，後端很多不同 API
// 共用，每個呼叫點實際失敗原因都不一樣（例如評價功能的「TRIP 未登記」「已經評價過」
// 「評價次數已達上限」），對應的翻譯文字本來就設計成很籠統的提示（「請求資料錯誤」），
// 不是給使用者看的最終答案，而是「真正有用的原因在 error.detail 裡，由呼叫端自己
// 判斷」。但這裡原本的寫法只要 code 有對應翻譯就直接回傳，等於把 error.detail 裡
// 真正的原因整個丟掉——像房間頁的評價功能就是靠讀 error.message 判斷關鍵字（例如
// 'not registered'）來顯示「此玩家尚未登記 TRIP」這類正確提示，結果因為這裡提早
// 回傳籠統文字，讀到的永遠是「請求資料錯誤」這幾個字，關鍵字永遠比對不到，顯示
// 的提示因此錯誤。這幾個「代碼本身不代表具體原因」的籠統代碼，改成優先使用
// error.detail（真正的原因），只有在 detail 也是空的時候才退回籠統翻譯文字。
const GENERIC_ERROR_CODES = new Set(['BAD_REQUEST', 'INVALID_PAYLOAD']);

function translateApiErrorMessage(error) {
  if (!error) return 'request failed';
  const code = String(error.code || '').trim();
  if (code && GENERIC_ERROR_CODES.has(code) && error.detail) {
    return error.detail;
  }
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
