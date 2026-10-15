import { t } from '../i18n.js';

// 2026-10-13：問題回報頁——不需要先登記 TRIP，打個暱稱就能回報；如果是從房間裡面
//的連結點進來（網址帶 ?roomId=），會自動把目前房間號附上，送出時後端會順手存一份
//當下房間的狀態快照方便除錯（玩家本人看不到快照內容，只會拿到查詢用的回報編號）。

const STATUS_LABEL_KEYS = {
  open: 'report.lookup.status_open',
  in_progress: 'report.lookup.status_in_progress',
  resolved: 'report.lookup.status_resolved',
};

const CATEGORY_LABEL_KEYS = {
  bug: 'report.submit.category_bug',
  suggestion: 'report.submit.category_suggestion',
  other: 'report.submit.category_other',
};

function statusLabel(status) {
  const key = STATUS_LABEL_KEYS[String(status || '').trim()];
  return key ? t(key) : String(status || '');
}

function categoryLabel(category) {
  const key = CATEGORY_LABEL_KEYS[String(category || '').trim()];
  return key ? t(key) : String(category || '');
}

function bindSubmitForm({ el, state, dispatch, toast }) {
  if (!el.bugReportSubmitForm || el.bugReportSubmitForm.dataset.bound === 'true') return;

  el.bugReportSubmitForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nickname = el.bugReportNickname?.value.trim() || '';
    const category = el.bugReportCategory?.value || 'other';
    const description = el.bugReportDescription?.value.trim() || '';
    if (!nickname) {
      toast(t('toast.bug_report_nickname_required'), 'error');
      return;
    }
    if (!description) {
      toast(t('toast.bug_report_description_required'), 'error');
      return;
    }

    const trip = el.bugReportTrip?.value.trim() || '';
    const room_id = state.roomId || null;
    const data = await dispatch('submit_bug_report', { nickname, category, description, room_id, trip });

    if (el.bugReportSubmitResult) el.bugReportSubmitResult.hidden = false;
    if (el.bugReportTokenDisplay) el.bugReportTokenDisplay.textContent = data.report_token || '';
    toast(t('toast.bug_report_submitted'));
    if (el.bugReportDescription) el.bugReportDescription.value = '';
  });

  el.bugReportSubmitForm.dataset.bound = 'true';
}

function renderLookupResult({ el, esc }, report) {
  if (!el.bugReportLookupResult) return;
  const rows = [
    `<p>${esc(t('report.lookup.result_token'))}：${esc(report.report_token || '')}</p>`,
    `<p>${esc(t('report.lookup.result_category'))}：${esc(categoryLabel(report.category))}</p>`,
    `<p>${esc(t('report.lookup.result_status'))}：${esc(statusLabel(report.status))}</p>`,
  ];
  if (report.resolution_note) {
    rows.push(`<p>${esc(t('report.lookup.result_note'))}：${esc(report.resolution_note)}</p>`);
  }
  el.bugReportLookupResult.innerHTML = rows.join('\n');
}

function bindLookupForm({ el, dispatch, esc, toast }) {
  if (!el.bugReportLookupForm || el.bugReportLookupForm.dataset.bound === 'true') return;

  el.bugReportLookupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const report_token = el.bugReportLookupToken?.value.trim() || '';
    if (!report_token) {
      toast(t('toast.bug_report_token_required'), 'error');
      return;
    }
    const data = await dispatch('get_bug_report_status', { report_token });
    if (el.bugReportLookupResult) el.bugReportLookupResult.hidden = false;
    renderLookupResult({ el, esc }, data);
  });

  el.bugReportLookupForm.dataset.bound = 'true';
}


function renderTripLookupResult({ el, esc }, reports) {
  if (!el.bugReportTripLookupResult) return;
  if (!Array.isArray(reports) || reports.length === 0) {
    el.bugReportTripLookupResult.innerHTML = `<p>${esc(t('report.lookup_by_trip.empty'))}</p>`;
    return;
  }
  const items = reports.map((report) => {
    const noteRow = report.resolution_note
      ? `<p>${esc(t('report.lookup.result_note'))}：${esc(report.resolution_note)}</p>`
      : '';
    return `
      <div class="card-body">
        <p>${esc(t('report.lookup.result_token'))}：${esc(report.report_token || '')}</p>
        <p>${esc(t('report.lookup.result_category'))}：${esc(categoryLabel(report.category))}</p>
        <p>${esc(t('report.lookup.result_status'))}：${esc(statusLabel(report.status))}</p>
        ${noteRow}
      </div>
    `;
  });
  el.bugReportTripLookupResult.innerHTML = items.join('\n');
}

function bindTripLookupForm({ el, dispatch, esc, toast }) {
  if (!el.bugReportTripLookupForm || el.bugReportTripLookupForm.dataset.bound === 'true') return;

  el.bugReportTripLookupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const trip = el.bugReportTripLookupTrip?.value.trim() || '';
    if (!trip) {
      toast(t('toast.bug_report_trip_required'), 'error');
      return;
    }
    const data = await dispatch('get_bug_reports_by_trip', { trip });
    renderTripLookupResult({ el, esc }, data?.reports);
  });

  el.bugReportTripLookupForm.dataset.bound = 'true';
}

export async function initReportPage({ el, state, dispatch, esc, toast }) {
  if (state.roomId && el.bugReportRoomHint) {
    el.bugReportRoomHint.hidden = false;
    el.bugReportRoomHint.textContent = t('report.submit.room_context_hint', { room: state.roomId });
  }
  bindSubmitForm({ el, state, dispatch, toast });
  bindLookupForm({ el, dispatch, esc, toast });
  bindTripLookupForm({ el, dispatch, esc, toast });
}
