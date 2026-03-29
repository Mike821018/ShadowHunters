import { AVATAR_PAGE_SIZE, getAvatarOptions } from '../avatarConfig.js';
import { bindAvatarPicker } from '../components/avatarPicker.js';
import { getCharacterLocalizedName, getCurrentUiLang } from '../characterInfo.js';
import { resolveLang, t } from '../i18n.js';
import { setRoomAccount } from '../session.js';
import { apiFetch } from '../utils.js';

/** 防止在表單輸入框按 Enter 意外送出，按鈕本身仍可用 Enter 觸發 */
function preventEnterSubmit(form) {
  if (!form) return;
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
    }
  });
}

function bindLoginSubmit({
  state,
  el,
  dispatch,
  persistSession,
  goToRoomPage,
  goToLobbyPage,
  isValidAsciiCredential,
  countChars,
  toast,
}) {
  if (!el.loginRoomForm || el.loginRoomForm.dataset.bound === 'true') return;

  el.loginRoomForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const room_id = Number(state.roomId);
    const account = el.loginAccount?.value.trim() || '';
    const password = el.loginPassword?.value || '';
    if (!room_id) {
      toast(t('toast.no_room'), 'error');
      return;
    }
    if (!account || !password) {
      toast(t('toast.login_required'), 'error');
      return;
    }

    if (!isValidAsciiCredential(account) || countChars(account) > 20) {
      toast(t('toast.account_invalid'), 'error');
      return;
    }
    if (!isValidAsciiCredential(password) || countChars(password) > 20) {
      toast(t('toast.password_invalid'), 'error');
      return;
    }

    try {
      const data = await dispatch('login_room', { room_id, account, password });
      state.roomId = room_id;
      setRoomAccount(state, room_id, data.login_account);
      persistSession();
      toast(t('toast.login_ok'));
      goToRoomPage(room_id);
    } catch (error) {
      if (error.code === 'ROOM_NOT_FOUND') goToLobbyPage?.();
    }
  });

  el.loginRoomForm.dataset.bound = 'true';
}

function bindRegisterSubmit({
  state,
  el,
  dispatch,
  persistSession,
  renderState,
  goToRoomPage,
  goToLobbyPage,
  isValidAsciiCredential,
  countChars,
  toast,
  nicknameMaxChars,
  requireTrip,
}) {
  if (!el.joinRoomForm || el.joinRoomForm.dataset.bound === 'true') return;

  el.joinRoomForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const room_id = Number(state.roomId);
    const account = el.account?.value.trim() || '';
    const trip = el.trip.value.trim();
    const password = el.password?.value || '';
    const name = el.nickname?.value.trim() || '';
    const avatar = Number(el.avatarValue?.value || '1');
    if (!room_id) {
      toast(t('toast.no_room'), 'error');
      return;
    }
    if (!account || !password) {
      toast(t('toast.register_required'), 'error');
      return;
    }
    if (requireTrip && !trip) {
      toast(t('toast.trip_required'), 'error');
      return;
    }
    if (!name) {
      toast(t('toast.nickname_required'), 'error');
      return;
    }

    if (!isValidAsciiCredential(account) || countChars(account) > 20) {
      toast(t('toast.account_invalid'), 'error');
      return;
    }

    if (!isValidAsciiCredential(password) || countChars(password) > 20) {
      toast(t('toast.password_invalid'), 'error');
      return;
    }

    if (!isValidAsciiCredential(trip, { allowEmpty: true }) || countChars(trip) > 20) {
      toast(t('toast.trip_invalid'), 'error');
      return;
    }

    if (countChars(name) > nicknameMaxChars) {
      toast(t('toast.nickname_too_long', { max: nicknameMaxChars }), 'error');
      return;
    }

    try {
      const data = await dispatch('join_room', {
        room_id,
        player_info: { trip, name, account, password, avatar_no: avatar },
      });
      state.roomId = room_id;
      setRoomAccount(state, room_id, data.join_account);
      persistSession();
      renderState(data);
      toast(t('toast.register_ok'));
      goToRoomPage(room_id);
    } catch (error) {
      if (error.code === 'ROOM_NOT_FOUND') goToLobbyPage?.();
    }
  });

  el.joinRoomForm.dataset.bound = 'true';
}

function bindIdentityTools({ el, toast, dispatch }) {
  if (!el.tripDirectoryTbody) return;

  const identityState = {
    trip: '',
    profileTrip: '',
    password: '',
    directoryPage: 1,
    nicknamePage: 1,
    gamePage: 1,
    ratingPage: 1,
  };

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const setManagedTrip = (trip, password) => {
    identityState.trip = String(trip || '').trim();
    identityState.password = String(password || '');
    if (el.tripAuthStatus) {
      el.tripAuthStatus.textContent = identityState.trip
        ? `目前操作 TRIP：${identityState.trip}`
        : t('identity.trip_auth_idle');
    }
  };

  const requireManagedTrip = () => {
    if (identityState.trip && identityState.password) return true;
    toast(t('identity.trip_auth_required'), 'error');
    return false;
  };

  const activateProfileTab = () => {
    document.getElementById('identityTabBtnProfile')?.click();
  };

  const activateProfileSubTab = (tab) => {
    const normalized = String(tab || '').trim().toLowerCase();
    if (normalized === 'games') {
      document.getElementById('tripProfileTabBtnGames')?.click();
      return;
    }
    if (normalized === 'ratings') {
      document.getElementById('tripProfileTabBtnRatings')?.click();
      return;
    }
    document.getElementById('tripProfileTabBtnNicknames')?.click();
  };

  const showSkillLevelDialog = (skillLevelRaw) => {
    const skillLevel = String(skillLevelRaw || '').trim();
    if (!skillLevel || skillLevel === '-') return;
    const dialog = document.getElementById('skillLevelDialog');
    const messageEl = document.getElementById('skillLevelDialogMessage');
    const titleEl = document.getElementById('skillLevelDialogTitle');
    const lang = resolveLang();
    const labelByLang = {
      beginner: { zh: '新手', en: 'Beginner', jp: '初級' },
      intermediate: { zh: '中階', en: 'Intermediate', jp: '中級' },
      advanced: { zh: '進階', en: 'Advanced', jp: '上級' },
      expert: { zh: '專家', en: 'Expert', jp: '達人' },
    };
    const criteriaByLang = {
      zh: {
        beginner: '總場數 < 10，或總場數 >= 10 且勝率 < 40%',
        intermediate: '總場數 >= 10 且勝率 >= 40%',
        advanced: '總場數 >= 10 且勝率 >= 50%',
        expert: '總場數 >= 10 且勝率 >= 60%',
      },
      en: {
        beginner: 'Games < 10, or Games >= 10 with Win Rate < 40%',
        intermediate: 'Games >= 10 and Win Rate >= 40%',
        advanced: 'Games >= 10 and Win Rate >= 50%',
        expert: 'Games >= 10 and Win Rate >= 60%',
      },
      jp: {
        beginner: '試合数 < 10、または試合数 >= 10 かつ勝率 < 40%',
        intermediate: '試合数 >= 10 かつ勝率 >= 40%',
        advanced: '試合数 >= 10 かつ勝率 >= 50%',
        expert: '試合数 >= 10 かつ勝率 >= 60%',
      },
    };
    const normalized = skillLevel.toLowerCase();
    const localizedLevel = (labelByLang[normalized] && (labelByLang[normalized][lang] || labelByLang[normalized].zh)) || skillLevelLabel(skillLevel);
    const criteriaMap = criteriaByLang[lang] || criteriaByLang.zh;
    const fallbackByLang = {
      zh: `${localizedLevel}：依總場數與勝率綜合計算。`,
      en: `${localizedLevel}: Calculated from total games and win rate.`,
      jp: `${localizedLevel}：総試合数と勝率で総合計算。`,
    };
    const message = criteriaMap[normalized]
      ? `${localizedLevel}\n${criteriaMap[normalized]}`
      : (fallbackByLang[lang] || fallbackByLang.zh);
    if (titleEl) titleEl.textContent = `評級說明：${skillLevelLabel(skillLevel)}`;
    if (messageEl) messageEl.textContent = message;
    if (dialog instanceof HTMLDialogElement) {
      dialog.showModal();
      return;
    }
    window.alert(`${skillLevelLabel(skillLevel)}\n\n${message}`);
  };

  const showAllSkillLevelDialog = () => {
    const dialog = document.getElementById('skillLevelDialog');
    const messageEl = document.getElementById('skillLevelDialogMessage');
    const titleEl = document.getElementById('skillLevelDialogTitle');
    const lang = resolveLang();
    const linesByLang = {
      zh: [
        '新手：總場數 < 10，或總場數 >= 10 且勝率 < 40%',
        '中階：總場數 >= 10 且勝率 >= 40%',
        '進階：總場數 >= 10 且勝率 >= 50%',
        '專家：總場數 >= 10 且勝率 >= 60%',
      ],
      en: [
        'Beginner: Games < 10, or Games >= 10 with Win Rate < 40%',
        'Intermediate: Games >= 10 and Win Rate >= 40%',
        'Advanced: Games >= 10 and Win Rate >= 50%',
        'Expert: Games >= 10 and Win Rate >= 60%',
      ],
      jp: [
        '初級：試合数 < 10、または試合数 >= 10 かつ勝率 < 40%',
        '中級：試合数 >= 10 かつ勝率 >= 40%',
        '上級：試合数 >= 10 かつ勝率 >= 50%',
        '達人：試合数 >= 10 かつ勝率 >= 60%',
      ],
    };
    const lines = linesByLang[lang] || linesByLang.zh;
    const titleMap = {
      zh: '評級說明（總覽）',
      en: 'Skill Criteria Overview',
      jp: '評価基準（一覧）',
    };
    if (titleEl) titleEl.textContent = titleMap[lang] || titleMap.zh;
    if (messageEl) messageEl.textContent = lines.join('\n');
    if (dialog instanceof HTMLDialogElement) {
      dialog.showModal();
      return;
    }
    window.alert(lines.join('\n'));
  };

  const skillLevelLabel = (rawLevel) => {
    const level = String(rawLevel || '').trim();
    if (!level || level === '-') return '-';
    const lang = resolveLang();
    const normalized = level.toLowerCase();
    const map = {
      beginner: { zh: '新手', en: 'Beginner', jp: '初級' },
      intermediate: { zh: '中階', en: 'Intermediate', jp: '中級' },
      advanced: { zh: '進階', en: 'Advanced', jp: '上級' },
      expert: { zh: '專家', en: 'Expert', jp: '達人' },
    };
    const picked = map[normalized];
    if (!picked) return level;
    return picked[lang] || picked.zh;
  };

  const roleBadgeClass = (camp) => {
    const normalized = String(camp || '').trim().toLowerCase();
    if (['hunter', 'hunters', '獵人', '狩人'].includes(normalized)) return 'hunter';
    if (['shadow', 'shadows', '暗影', '影', '闇'].includes(normalized)) return 'shadow';
    return 'civilian';
  };

  const setPagerInfo = (infoElementId, pagination) => {
    const info = document.getElementById(infoElementId);
    if (!info) return;
    const totalPages = Math.max(1, Math.ceil(Number(pagination?.total || 0) / Number(pagination?.page_size || 20)));
    info.textContent = `${Number(pagination?.page || 1)} / ${totalPages}`;
  };

  const setPagerButtons = (prevId, nextId, pagination, onPrev, onNext) => {
    const prev = document.getElementById(prevId);
    const next = document.getElementById(nextId);
    const totalPages = Math.max(1, Math.ceil(Number(pagination?.total || 0) / Number(pagination?.page_size || 20)));
    if (prev) {
      prev.disabled = Number(pagination?.page || 1) <= 1;
      prev.onclick = onPrev;
    }
    if (next) {
      next.disabled = Number(pagination?.page || 1) >= totalPages;
      next.onclick = onNext;
    }
  };

  const resultLabelFromCode = (resultCode, isWinner) => {
    if (resultCode === 'hunter') return t('records.winner_hunter');
    if (resultCode === 'shadow') return t('records.winner_shadow');
    if (resultCode === 'civilian') return t('records.winner_civilian');
    const parts = String(resultCode || '').split('_').filter(Boolean);
    if (parts.length >= 2) {
      const map = {
        hunter: t('records.winner_hunter'),
        shadow: t('records.winner_shadow'),
        civilian: t('records.winner_civilian'),
      };
      const ordered = parts.filter((camp) => ['hunter', 'shadow', 'civilian'].includes(camp));
      if (ordered.length) {
        return ordered.map((camp) => map[camp]).join('+');
      }
    }
    if (resultCode === 'boomed') return t('identity.boomed_yes');
    if (resultCode === 'draw') return '-';
    return isWinner ? t('identity.result_win') : t('identity.result_lose');
  };

  const resultClassFromCode = (resultCode) => {
    if (resultCode === 'hunter') return 'records-winner-hunter';
    if (resultCode === 'shadow') return 'records-winner-shadow';
    if (resultCode === 'civilian') return 'records-winner-civilian';
    if (String(resultCode || '').includes('_')) return 'records-winner-mixed';
    return '';
  };

  const resultBadgeHtmlFromCode = (resultCode, boomed = false) => {
    const map = {
      hunter: { cls: 'records-winner-hunter', label: t('records.winner_hunter') },
      shadow: { cls: 'records-winner-shadow', label: t('records.winner_shadow') },
      civilian: { cls: 'records-winner-civilian', label: t('records.winner_civilian') },
    };
    const single = map[String(resultCode || '').trim()];
    if (single) {
      const classNames = `records-winner ${single.cls}${boomed ? ' records-winner-boomed' : ''}`;
      return `<span class="${classNames}">${escapeHtml(single.label)}</span>`;
    }
    const parts = String(resultCode || '').split('_').filter(Boolean);
    if (parts.length >= 2) {
      const ordered = parts.filter((camp) => ['hunter', 'shadow', 'civilian'].includes(camp));
      if (ordered.length) {
        return `<span class="records-winner-group">${ordered.map((camp) => {
          const item = map[camp];
          const classNames = `records-winner ${item.cls}${boomed ? ' records-winner-boomed' : ''}`;
          return `<span class="${classNames}">${escapeHtml(item.label)}</span>`;
        }).join('')}</span>`;
      }
    }
    return '';
  };

  const ratingLabel = (rawRating) => {
    const value = Number(rawRating ?? 0);
    if (value > 0) {
      if (getCurrentUiLang() === 'en') return 'Positive';
      if (getCurrentUiLang() === 'jp') return '肯定';
      return '正';
    }
    if (value < 0) {
      if (getCurrentUiLang() === 'en') return 'Negative';
      if (getCurrentUiLang() === 'jp') return '否定';
      return '負';
    }
    return '0';
  };

  const renderTripProfile = (profile) => {
    if (!el.tripProfileAccounts || !el.tripProfileGamesTbody || !el.tripProfileHint || !el.tripProfileRatingsTbody) return;
    el.tripProfileHint.textContent = `TRIP：${profile?.trip || '-'}`;

    if (profile?.not_registered || profile?.registered === false) {
      const msgByLang = {
        zh: '此 TRIP 尚未登記，無統計資料。',
        en: 'This TRIP is not registered. No stats available.',
        jp: 'この TRIP は未登録のため、統計は表示されません。',
      };
      const lang = getCurrentUiLang();
      el.tripProfileAccounts.innerHTML = `<div class="identity-profile-summary"><div>${escapeHtml(msgByLang[lang] || msgByLang.zh)}</div></div>`;
      el.tripProfileGamesTbody.innerHTML = '<tr><td colspan="7" class="lighttxt">-</td></tr>';
      el.tripProfileRatingsTbody.innerHTML = '<tr><td colspan="4" class="lighttxt">-</td></tr>';
      const nicknameBody = document.getElementById('tripProfileNicknamesTbody');
      if (nicknameBody) nicknameBody.innerHTML = '<tr><td colspan="3" class="lighttxt">-</td></tr>';
      setPagerInfo('tripNicknamesPageInfo', profile?.nickname_pagination);
      setPagerInfo('tripGamesPageInfo', profile?.game_pagination);
      setPagerInfo('tripRatingsPageInfo', profile?.rating_pagination);
      setPagerButtons('tripNicknamesPrevPage', 'tripNicknamesNextPage', profile?.nickname_pagination, null, null);
      setPagerButtons('tripGamesPrevPage', 'tripGamesNextPage', profile?.game_pagination, null, null);
      setPagerButtons('tripRatingsPrevPage', 'tripRatingsNextPage', profile?.rating_pagination, null, null);
      return;
    }

    const summary = profile?.performance_summary || {};
    const summaryByLang = {
      zh: [
        `總勝率：${summary.total_win_rate || '0.00%'}`,
        `生存率：${summary.survival_rate || '0.00%'}`,
        `暴斃率：${summary.boomed_rate || '0.00%'}`,
        `總評價：${Number(summary.total_rating_score || 0)}`,
        `各陣營率（暗/獵/中）：${summary.camp_play_rates?.shadow || '0.00%'} / ${summary.camp_play_rates?.hunter || '0.00%'} / ${summary.camp_play_rates?.civilian || '0.00%'}`,
        `各陣營勝率（暗/獵/中）：${summary.camp_win_rates?.shadow || '0.00%'} / ${summary.camp_win_rates?.hunter || '0.00%'} / ${summary.camp_win_rates?.civilian || '0.00%'}`,
        `參與場次陣營勝率（暗/獵/中）：${summary.participated_games_camp_win_rates?.shadow || '0.00%'} / ${summary.participated_games_camp_win_rates?.hunter || '0.00%'} / ${summary.participated_games_camp_win_rates?.civilian || '0.00%'}`,
      ],
      en: [
        `Total Win Rate: ${summary.total_win_rate || '0.00%'}`,
        `Survival Rate: ${summary.survival_rate || '0.00%'}`,
        `Boomed Rate: ${summary.boomed_rate || '0.00%'}`,
        `Total Rating: ${Number(summary.total_rating_score || 0)}`,
        `Camp Play Rate (S/H/N): ${summary.camp_play_rates?.shadow || '0.00%'} / ${summary.camp_play_rates?.hunter || '0.00%'} / ${summary.camp_play_rates?.civilian || '0.00%'}`,
        `Camp Win Rate (S/H/N): ${summary.camp_win_rates?.shadow || '0.00%'} / ${summary.camp_win_rates?.hunter || '0.00%'} / ${summary.camp_win_rates?.civilian || '0.00%'}`,
        `Camp Win Rate in Participated Games (S/H/N): ${summary.participated_games_camp_win_rates?.shadow || '0.00%'} / ${summary.participated_games_camp_win_rates?.hunter || '0.00%'} / ${summary.participated_games_camp_win_rates?.civilian || '0.00%'}`,
      ],
      jp: [
        `総勝率：${summary.total_win_rate || '0.00%'}`,
        `生存率：${summary.survival_rate || '0.00%'}`,
        `暴斃率：${summary.boomed_rate || '0.00%'}`,
        `総評価：${Number(summary.total_rating_score || 0)}`,
        `陣営率（影/狩/中）：${summary.camp_play_rates?.shadow || '0.00%'} / ${summary.camp_play_rates?.hunter || '0.00%'} / ${summary.camp_play_rates?.civilian || '0.00%'}`,
        `陣営勝率（影/狩/中）：${summary.camp_win_rates?.shadow || '0.00%'} / ${summary.camp_win_rates?.hunter || '0.00%'} / ${summary.camp_win_rates?.civilian || '0.00%'}`,
        `参加試合の陣営勝率（影/狩/中）：${summary.participated_games_camp_win_rates?.shadow || '0.00%'} / ${summary.participated_games_camp_win_rates?.hunter || '0.00%'} / ${summary.participated_games_camp_win_rates?.civilian || '0.00%'}`,
      ],
    };
    const lang = getCurrentUiLang();
    const summaryLines = summaryByLang[lang] || summaryByLang.zh;
    el.tripProfileAccounts.innerHTML = `<div class="identity-profile-summary">${summaryLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;

    const nicknameBody = document.getElementById('tripProfileNicknamesTbody');
    if (nicknameBody) {
      nicknameBody.innerHTML = '';
      const nicknameRows = Array.isArray(profile?.nickname_rows) ? profile.nickname_rows : [];
      if (!nicknameRows.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="3" class="lighttxt">此 TRIP 暫無過去暱稱資料</td>';
        nicknameBody.appendChild(tr);
      } else {
        nicknameRows.forEach((row) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.index ?? '-'}</td>
            <td>${escapeHtml(row.nickname || '-')}</td>
            <td>${row.use_count ?? 0}</td>
          `;
          nicknameBody.appendChild(tr);
        });
      }
      setPagerInfo('tripNicknamesPageInfo', profile?.nickname_pagination);
      setPagerButtons(
        'tripNicknamesPrevPage',
        'tripNicknamesNextPage',
        profile?.nickname_pagination,
        async () => {
          identityState.nicknamePage = Math.max(1, identityState.nicknamePage - 1);
          await loadTripProfile(identityState.profileTrip || identityState.trip);
        },
        async () => {
          identityState.nicknamePage += 1;
          await loadTripProfile(identityState.profileTrip || identityState.trip);
        }
      );
    }

    el.tripProfileGamesTbody.innerHTML = '';
    const games = Array.isArray(profile?.games) ? profile.games : [];
    if (!games.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="7" class="lighttxt">此 TRIP 暫無可顯示紀錄</td>';
      el.tripProfileGamesTbody.appendChild(tr);
    } else {
      games.forEach((game) => {
        const tr = document.createElement('tr');
        const resultLabel = resultLabelFromCode(game.result_code, game.is_winner);
        const resultBadgeHtml = resultBadgeHtmlFromCode(game.result_code, game.boomed);
        const roleNameLocalized = getCharacterLocalizedName(game.character_name || '-', getCurrentUiLang());
        const roleBadge = String(game.character_name || '?').trim().charAt(0).toUpperCase() || '?';
        const roleBadgeCampClass = roleBadgeClass(game.character_camp);
        const statusLabel = game.is_alive ? t('common.alive') : t('common.dead');
        const recordHref = `./replay_room.html?roomId=${encodeURIComponent(String(game.room_id || ''))}`;
        const resultHtml = resultBadgeHtml || `<span class="lighttxt">${escapeHtml(resultLabel)}</span>`;
        tr.innerHTML = `
          <td><a href="${recordHref}">${escapeHtml(String(game.room_id ?? '-'))}</a></td>
          <td>${escapeHtml(game.player_name || '-')}</td>
          <td><span class="damage-meter-badge ${roleBadgeCampClass}">${escapeHtml(roleBadge)}</span> ${escapeHtml(roleNameLocalized || '-')}</td>
          <td>${escapeHtml(statusLabel)}</td>
          <td>${resultHtml}</td>
          <td>${game.boomed ? t('identity.boomed_yes') : '-'}</td>
          <td>${Number(game.rating_score || 0)}</td>
        `;
        el.tripProfileGamesTbody.appendChild(tr);
      });
    }
    setPagerInfo('tripGamesPageInfo', profile?.game_pagination);
    setPagerButtons(
      'tripGamesPrevPage',
      'tripGamesNextPage',
      profile?.game_pagination,
      async () => {
        identityState.gamePage = Math.max(1, identityState.gamePage - 1);
        await loadTripProfile(identityState.profileTrip || identityState.trip);
      },
      async () => {
        identityState.gamePage += 1;
        await loadTripProfile(identityState.profileTrip || identityState.trip);
      }
    );

    el.tripProfileRatingsTbody.innerHTML = '';
    const ratings = Array.isArray(profile?.ratings) ? profile.ratings : [];
    if (!ratings.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" class="lighttxt">此 TRIP 暫無評價紀錄</td>';
      el.tripProfileRatingsTbody.appendChild(tr);
      setPagerInfo('tripRatingsPageInfo', profile?.rating_pagination);
      setPagerButtons(
        'tripRatingsPrevPage',
        'tripRatingsNextPage',
        profile?.rating_pagination,
        async () => {
          identityState.ratingPage = Math.max(1, identityState.ratingPage - 1);
          await loadTripProfile(identityState.profileTrip || identityState.trip);
        },
        async () => {
          identityState.ratingPage += 1;
          await loadTripProfile(identityState.profileTrip || identityState.trip);
        }
      );
      return;
    }

    ratings.forEach((rating) => {
      const tr = document.createElement('tr');
      const gameRecordId = String(rating.game_record_id || '').trim();
      const replayRoomId = String(rating.room_id || '').trim();
      const roomHref = gameRecordId
        ? `./replay_room.html?roomId=${encodeURIComponent(replayRoomId)}`
        : '#';
      const ratingText = ratingLabel(rating.rating);
      tr.innerHTML = `
        <td class="trip-rating-col-room">${gameRecordId ? `<a href="${roomHref}">${rating.room_id ?? '-'}</a>` : `${rating.room_id ?? '-'}`}</td>
        <td class="trip-rating-col-trip"><a href="#" data-trip="${escapeHtml(rating.source_trip || '-')}">${escapeHtml(rating.source_trip || '-')}</a></td>
        <td class="trip-rating-col-score">${escapeHtml(ratingText)}</td>
        <td class="trip-rating-col-comment">${escapeHtml(rating.comment || '-')}</td>
      `;
      el.tripProfileRatingsTbody.appendChild(tr);
    });
    el.tripProfileRatingsTbody.querySelectorAll('a[data-trip]').forEach((anchor) => {
      anchor.addEventListener('click', async (event) => {
        event.preventDefault();
        const trip = String(anchor.getAttribute('data-trip') || '').trim();
        if (!trip || trip === '-') return;
        identityState.nicknamePage = 1;
        identityState.gamePage = 1;
        identityState.ratingPage = 1;
        try {
          await openTripProfile(trip, 'nicknames');
        } catch {
          toast(t('identity.trip_register_failed'), 'error');
        }
      });
    });
    setPagerInfo('tripRatingsPageInfo', profile?.rating_pagination);
    setPagerButtons(
      'tripRatingsPrevPage',
      'tripRatingsNextPage',
      profile?.rating_pagination,
      async () => {
        identityState.ratingPage = Math.max(1, identityState.ratingPage - 1);
        await loadTripProfile(identityState.profileTrip || identityState.trip);
      },
      async () => {
        identityState.ratingPage += 1;
        await loadTripProfile(identityState.profileTrip || identityState.trip);
      }
    );
  };

  const loadTripProfile = async (trip) => {
    const normalizedTrip = String(trip || '').trim();
    if (!normalizedTrip) {
      throw new Error('trip profile requires trip');
    }
    const response = await apiFetch(`/api/trip_profile?trip=${encodeURIComponent(normalizedTrip)}&limit=300&page_size=20&nickname_page=${identityState.nicknamePage}&game_page=${identityState.gamePage}&rating_page=${identityState.ratingPage}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('trip profile failed');
    const data = await response.json();
    identityState.profileTrip = normalizedTrip;
    renderTripProfile(data);
    activateProfileTab();
  };

  const openTripProfile = async (trip, profileTab = 'nicknames') => {
    const normalizedTrip = String(trip || '').trim();
    if (!normalizedTrip) return;
    identityState.profileTrip = normalizedTrip;
    identityState.nicknamePage = 1;
    identityState.gamePage = 1;
    identityState.ratingPage = 1;
    await loadTripProfile(normalizedTrip);
    activateProfileSubTab(profileTab);
  };

  const renderTripDirectory = (entries, pagination) => {
    const skillHeader = document.getElementById('tripDirectorySkillHeader');
    if (skillHeader && skillHeader.getAttribute('data-bound') !== 'true') {
      skillHeader.setAttribute('role', 'button');
      skillHeader.setAttribute('tabindex', '0');
      skillHeader.setAttribute('data-bound', 'true');
      skillHeader.addEventListener('click', () => showAllSkillLevelDialog());
      skillHeader.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          showAllSkillLevelDialog();
        }
      });
    }

    el.tripDirectoryTbody.innerHTML = '';
    if (!entries || !entries.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" class="lighttxt">${escapeHtml(t('identity.trip_directory_empty'))}</td>`;
      el.tripDirectoryTbody.appendChild(tr);
      setPagerInfo('tripDirectoryPageInfo', pagination);
      setPagerButtons(
        'tripDirectoryPrevPage',
        'tripDirectoryNextPage',
        pagination,
        async () => {
          identityState.directoryPage = Math.max(1, identityState.directoryPage - 1);
          await loadTripDirectory();
        },
        async () => {
          identityState.directoryPage += 1;
          await loadTripDirectory();
        }
      );
      return;
    }

    entries.forEach((entry) => {
      const tr = document.createElement('tr');
      const localizedSkillLevel = skillLevelLabel(entry.skill_level);
      tr.innerHTML = `
        <td>${Number(entry.registration_index || 0)}</td>
        <td><a href="#" data-trip="${entry.trip}">${entry.trip}</a></td>
        <td>${entry.total_games ?? 0}</td>
        <td>${entry.win_rate || '-'}</td>
        <td>${escapeHtml(localizedSkillLevel)}</td>
      `;
      el.tripDirectoryTbody.appendChild(tr);
    });

    setPagerInfo('tripDirectoryPageInfo', pagination);
    setPagerButtons(
      'tripDirectoryPrevPage',
      'tripDirectoryNextPage',
      pagination,
      async () => {
        identityState.directoryPage = Math.max(1, identityState.directoryPage - 1);
        await loadTripDirectory();
      },
      async () => {
        identityState.directoryPage += 1;
        await loadTripDirectory();
      }
    );

    el.tripDirectoryTbody.querySelectorAll('a[data-trip]').forEach((anchor) => {
      anchor.addEventListener('click', async (event) => {
        event.preventDefault();
        const trip = anchor.getAttribute('data-trip') || '';
        if (!trip) return;
        try {
          identityState.nicknamePage = 1;
          identityState.gamePage = 1;
          identityState.ratingPage = 1;
          await openTripProfile(trip, 'nicknames');
        } catch {
          toast('TRIP 個人紀錄載入失敗', 'error');
        }
      });
    });

  };

  const loadTripDirectory = async () => {
    const keyword = String(el.tripSearchInput?.value || '').trim();
    try {
      const params = new URLSearchParams();
      params.set('keyword', keyword);
      params.set('limit', '500');
      params.set('page', String(identityState.directoryPage));
      params.set('page_size', '20');
      const response = await apiFetch(`/api/trip_directory?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('trip directory failed');
      const data = await response.json();
      renderTripDirectory(data.entries || [], data.pagination || { page: 1, page_size: 20, total: 0 });
    } catch {
      renderTripDirectory([], { page: 1, page_size: 20, total: 0 });
      toast('TRIP 一覽載入失敗', 'error');
    }
  };

  el.tripSearchButton?.addEventListener('click', () => {
    identityState.directoryPage = 1;
    loadTripDirectory();
  });
  el.tripSearchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      identityState.directoryPage = 1;
      loadTripDirectory();
    }
  });

  if (el.tripRegisterForm && el.tripRegisterForm.dataset.bound !== 'true') {
    el.tripRegisterForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const trip = document.getElementById('tripRegisterTrip')?.value.trim() || '';
      const password = document.getElementById('tripRegisterPassword')?.value || '';
      if (!trip || !password) {
        toast(t('identity.trip_register_required'), 'error');
        return;
      }
      try {
        const data = await dispatch('register_trip', { trip, password });
        setManagedTrip(trip, password);
        identityState.directoryPage = 1;
        identityState.nicknamePage = 1;
        identityState.gamePage = 1;
        identityState.ratingPage = 1;
        toast(data.status === 'registered' ? t('identity.trip_registered') : t('identity.trip_verified'));
        el.tripRegisterForm.reset();
        await loadTripDirectory();
        await loadTripProfile(trip);
      } catch (error) {
        toast(error.message || t('identity.trip_register_failed'), 'error');
      }
    });
    el.tripRegisterForm.dataset.bound = 'true';
  }

  if (el.tripChangeForm && el.tripChangeForm.dataset.bound !== 'true') {
    el.tripChangeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const oldTrip = document.getElementById('tripChangeOldTrip')?.value.trim() || '';
      const oldPassword = document.getElementById('tripChangeOldPassword')?.value || '';
      const newTrip = document.getElementById('tripChangeNewTrip')?.value.trim() || '';
      const newPassword = document.getElementById('tripChangeNewPassword')?.value || '';
      if (!oldTrip || !oldPassword || !newTrip || !newPassword) {
        toast(t('identity.trip_change_required'), 'error');
        return;
      }
      try {
        await dispatch('change_trip', {
          old_trip: oldTrip,
          old_password: oldPassword,
          new_trip: newTrip,
          new_password: newPassword,
        });
        setManagedTrip(newTrip, newPassword);
        identityState.directoryPage = 1;
        identityState.nicknamePage = 1;
        identityState.gamePage = 1;
        identityState.ratingPage = 1;
        toast(t('identity.trip_changed'));
        el.tripChangeForm.reset();
        await loadTripDirectory();
        await loadTripProfile(newTrip);
      } catch (error) {
        toast(error.message || t('identity.trip_change_failed'), 'error');
      }
    });
    el.tripChangeForm.dataset.bound = 'true';
  }

  const bindManagedTripForm = (form, action, getPayload, missingInputKey, successKey) => {
    if (!form || form.dataset.bound === 'true') return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!requireManagedTrip()) return;
      const payload = getPayload();
      if (!payload) {
        toast(t(missingInputKey), 'error');
        return;
      }
      try {
        const data = await dispatch(action, {
          target_trip: identityState.trip,
          target_password: identityState.password,
          ...payload,
        });
        toast(t(successKey, { count: data.updated_records ?? 0 }));
        form.reset();
        await loadTripDirectory();
        await loadTripProfile(identityState.trip);
      } catch (error) {
        toast(error.message || t('identity.trip_action_failed'), 'error');
      }
    });
    form.dataset.bound = 'true';
  };

  bindManagedTripForm(
    el.tripClaimForm,
    'claim_trip_records',
    () => {
      const account = document.getElementById('tripClaimAccount')?.value.trim() || '';
      const accountPassword = document.getElementById('tripClaimPassword')?.value || '';
      const roomIdRaw = document.getElementById('tripClaimRoomId')?.value || '';
      if (!account || !accountPassword) return null;
      return {
        account,
        account_password: accountPassword,
        room_id: roomIdRaw ? Number(roomIdRaw) : undefined,
      };
    },
    'identity.trip_claim_required',
    'identity.trip_claim_done'
  );

  bindManagedTripForm(
    el.tripModifyForm,
    'modify_trip_records',
    () => {
      const account = document.getElementById('tripModifyAccount')?.value.trim() || '';
      const accountPassword = document.getElementById('tripModifyPassword')?.value || '';
      const roomIdRaw = document.getElementById('tripModifyRoomId')?.value || '';
      if (!account || !accountPassword) return null;
      return {
        account,
        account_password: accountPassword,
        room_id: roomIdRaw ? Number(roomIdRaw) : undefined,
      };
    },
    'identity.trip_modify_required',
    'identity.trip_modify_done'
  );

  bindManagedTripForm(
    el.tripDeleteForm,
    'delete_trip_records',
    () => {
      const nickname = document.getElementById('tripDeleteNickname')?.value.trim() || '';
      const roomIdRaw = document.getElementById('tripDeleteRoomId')?.value || '';
      if (!nickname) return null;
      return {
        nickname,
        room_id: roomIdRaw ? Number(roomIdRaw) : undefined,
      };
    },
    'identity.trip_delete_required',
    'identity.trip_delete_done'
  );

  loadTripDirectory();
  return { openTripProfile };
}

function bindIdentityTabs() {
  const tabLists = Array.from(document.querySelectorAll('.identity-page-tabs'));
  tabLists.forEach((tabList) => {
    const tabButtons = Array.from(tabList.querySelectorAll('[data-tab-target]'));
    if (!tabButtons.length) return;
    const targetIds = tabButtons.map((button) => button.getAttribute('data-tab-target')).filter(Boolean);
    const panes = targetIds.map((id) => document.getElementById(id)).filter(Boolean);
    const activate = (targetId) => {
      panes.forEach((pane) => {
        const isCurrent = pane.id === targetId;
        pane.classList.toggle('current', isCurrent);
      });
      tabButtons.forEach((button) => {
        const isCurrent = button.getAttribute('data-tab-target') === targetId;
        button.classList.toggle('current', isCurrent);
        button.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
      });
    };

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        activate(button.getAttribute('data-tab-target'));
      });
    });
  });
}

export async function initRegisterPage({
  state,
  el,
  dispatch,
  esc,
  withVillageSuffix,
  persistSession,
  renderState,
  goToRoomPage,
  goToLobbyPage,
  isValidAsciiCredential,
  countChars,
  toast,
}) {
  bindAvatarPicker({
    state,
    el,
    avatarOptions: getAvatarOptions(),
    avatarPageSize: AVATAR_PAGE_SIZE,
    esc,
  });

  preventEnterSubmit(el.loginRoomForm);
  preventEnterSubmit(el.joinRoomForm);

  const currentLang = resolveLang();
  const nicknameMaxChars = currentLang === 'en' ? 20 : 10;

  const btnBackToRoom = document.getElementById('btnBackToRoom');
  if (btnBackToRoom instanceof HTMLButtonElement && btnBackToRoom.dataset.bound !== 'true') {
    btnBackToRoom.addEventListener('click', () => {
      const roomId = Number(state.roomId || 0);
      if (roomId > 0) {
        goToRoomPage(roomId);
        return;
      }
      goToLobbyPage?.();
    });
    btnBackToRoom.dataset.bound = 'true';
  }

  bindLoginSubmit({
    state,
    el,
    dispatch,
    persistSession,
    goToRoomPage,
    goToLobbyPage,
    isValidAsciiCredential,
    countChars,
    toast,
  });

  const identityTools = bindIdentityTools({ el, toast, dispatch }) || {};
  bindIdentityTabs();

  const targetTrip = String(new URLSearchParams(window.location.search).get('trip') || '').trim();
  const targetProfileTab = String(new URLSearchParams(window.location.search).get('profileTab') || 'nicknames').trim();
  if (targetTrip && typeof identityTools.openTripProfile === 'function') {
    try {
      await identityTools.openTripProfile(targetTrip, targetProfileTab || 'nicknames');
    } catch {
      toast(t('identity.trip_register_failed'), 'error');
    }
  }

  const hasVillageForms = Boolean(el.loginRoomForm || el.joinRoomForm);
  if (!state.roomId) {
    if (hasVillageForms && !targetTrip) {
      toast(t('toast.no_room'), 'error');
    }
    return;
  }

  let data;
  try {
    data = await dispatch('get_room_state', { room_id: state.roomId }, { silent: true });
  } catch (error) {
    if (error.code === 'ROOM_NOT_FOUND') {
      goToLobbyPage?.();
      return;
    }
    throw error;
  }
  const requireTrip = Boolean(data?.room?.require_trip);
  const villageName = withVillageSuffix(data?.room?.room_name || 'XXX');
  if (el.loginVillageTitle) {
    el.loginVillageTitle.textContent = t('register.login.title_fmt', { village: villageName });
  }
  if (el.registerVillageTitle) {
    el.registerVillageTitle.textContent = t('register.register.title_fmt', { village: villageName });
  }
  if (el.tripLabel) {
    el.tripLabel.textContent = requireTrip ? t('register.register.trip_required_label') : t('register.register.trip');
  }
  if (el.trip) {
    el.trip.setAttribute('aria-required', requireTrip ? 'true' : 'false');
    el.trip.placeholder = t('common.placeholder.ascii20');
  }

  bindRegisterSubmit({
    state,
    el,
    dispatch,
    persistSession,
    renderState,
    goToRoomPage,
    goToLobbyPage,
    isValidAsciiCredential,
    countChars,
    toast,
    nicknameMaxChars,
    requireTrip,
  });

  const status = Number(data?.room?.room_status);
  if (status !== 1) {
    const submit = el.joinRoomForm?.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
  }
}
