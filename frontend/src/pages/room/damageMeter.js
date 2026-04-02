import { DAMAGE_ROLE_MARKERS, DAMAGE_TRACK_VALUES, PLAYER_COLOR_HEX } from '../../constants.js';

export function createDamageMeterHandlers({ t, esc }) {
  function clampDamageValue(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.max(0, Math.min(14, Math.round(numericValue)));
  }

  function jumpToPlayerCard(account) {
    const normalized = String(account || '').trim();
    if (!normalized) return;
    const card = document.querySelector(`#roomCards [data-player-account="${CSS.escape(normalized)}"]`);
    if (!(card instanceof HTMLElement)) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    card.classList.remove('jump-highlight');
    void card.offsetWidth;
    card.classList.add('jump-highlight');
  }

  function renderDamageMeter(el, data) {
    if (!el) return;

    const roleMarkersByDamage = new Map();
    DAMAGE_ROLE_MARKERS.forEach((marker) => {
      const damage = clampDamageValue(marker.hp);
      const existing = roleMarkersByDamage.get(damage) || [];
      existing.push(marker);
      roleMarkersByDamage.set(damage, existing);
    });

    const playerMarkersByDamage = new Map();
    Object.entries(data?.players || {}).forEach(([account, player]) => {
      if (!player?.alive) return;
      const damage = clampDamageValue(player?.damage);
      const existing = playerMarkersByDamage.get(damage) || [];
      existing.push({
        account,
        name: player?.name || account,
        color: player?.color || '',
        exactDamage: Number(player?.damage || 0),
      });
      playerMarkersByDamage.set(damage, existing);
    });

    const rows = [
      {
        label: t('room.damage_meter.damage'),
        type: 'scale',
      },
      {
        label: t('room.damage_meter.roles'),
        type: 'roles',
      },
      {
        label: t('room.damage_meter.players'),
        type: 'players',
      },
    ];

    el.innerHTML = `
      <div class="damage-meter-grid" role="table" aria-label="${esc(t('room.damage_meter.title'))}">
        ${rows.map((row) => `
          <div class="damage-meter-row-label" role="rowheader">${esc(row.label)}</div>
          ${DAMAGE_TRACK_VALUES.map((damage) => {
            if (row.type === 'scale') {
              return `<div class="damage-meter-cell damage-meter-scale-cell" role="cell">${damage}</div>`;
            }

            if (row.type === 'roles') {
              const markers = roleMarkersByDamage.get(damage) || [];
              return `
                <div class="damage-meter-cell" role="cell">
                  ${markers.map((marker) => `<span class="damage-meter-badge ${marker.camp.toLowerCase()}" title="${esc(`${marker.camp} ${marker.initial} / HP ${marker.hp}`)}">${esc(String(marker.initial || '').trim().charAt(0).toUpperCase() || '?')}</span>`).join('')}
                </div>
              `;
            }

            const players = playerMarkersByDamage.get(damage) || [];
            return `
              <div class="damage-meter-cell" role="cell">
                ${players.map((player) => {
                  const fill = PLAYER_COLOR_HEX[player.color] || '#cccccc';
                  const outline = player.color === 'White' ? '#9aa7b2' : 'rgba(0, 0, 0, 0.25)';
                  return `<button class="damage-meter-player-chip" type="button" data-player-account="${esc(player.account)}" title="${esc(`${player.name} / ${player.color || '-'} / ${player.exactDamage}`)}" aria-label="${esc(t('ui.player_label', { name: player.name || player.account }))}" style="background:${fill}; border-color:${outline};"></button>`;
                }).join('')}
              </div>
            `;
          }).join('')}
        `).join('')}
      </div>
    `;

    el.querySelectorAll('.damage-meter-player-chip[data-player-account]').forEach((chip) => {
      chip.addEventListener('click', () => {
        jumpToPlayerCard(chip.getAttribute('data-player-account'));
      });
    });
  }

  return {
    clampDamageValue,
    jumpToPlayerCard,
    renderDamageMeter,
  };
}
