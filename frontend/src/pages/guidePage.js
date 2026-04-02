const GUIDE_GREEN_CARDS = ['Aid', 'Anger', 'Blackmail', 'Bully', 'Exorcism', 'Greed', 'Huddle', 'Nurturance', 'Prediction', 'Slap', 'Spell', 'Tough Lesson'];
const GUIDE_WHITE_CARDS = ['Talisman', 'Fortune Brooch', 'Mystic Compass', 'Holy Robe', 'Silver Rosary', 'Spear of Longinus', 'Holy Water of Healing', 'Advent', 'Chocolate', 'Blessing', 'Concealed Knowledge', 'Guardian Angel', 'Flare of Judgement', 'Disenchant Mirror', 'First Aid'];
const GUIDE_BLACK_CARDS = ['Chainsaw', 'Butcher Knife', 'Rusted Broad Axe', 'Masamune', 'Machine Gun', 'Handgun', 'Vampire Bat', 'Bloodthirsty Spider', 'Moody Goblin', 'Spiritual Doll', 'Dynamite', 'Diabolic Ritual', 'Banana Peel'];
const GUIDE_EQUIPMENT_ICONS = {
  'Talisman': '🔮',
  'Fortune Brooch': '💠',
  'Mystic Compass': '🧭',
  'Holy Robe': '🧥',
  'Silver Rosary': '📿',
  'Spear of Longinus': '🗡️',
  'Chainsaw': '⚙️',
  'Butcher Knife': '🔪',
  'Rusted Broad Axe': '🪓',
  'Masamune': '⚔️',
  'Machine Gun': '🔫',
  'Handgun': '🎯',
};

function initGuideSectionCollapse(page) {
  if (page !== 'guide' && page !== 'operation') return;
  document.querySelectorAll('.guide-section').forEach((section) => {
    const h2 = section.querySelector(':scope > h2');
    const body = section.querySelector(':scope > .card-body');
    if (!h2 || !body) return;
    h2.classList.add('guide-collapsible');
    h2.setAttribute('tabindex', '0');
    h2.setAttribute('role', 'button');
    h2.setAttribute('aria-expanded', 'true');
    const onToggle = () => {
      const collapsed = body.classList.toggle('guide-section-collapsed');
      h2.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    };
    h2.addEventListener('click', onToggle);
    h2.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggle();
      }
    });
  });
}

function initGuideSubsectionCollapse(page) {
  if (page !== 'guide' && page !== 'operation') return;

  document.querySelectorAll('.guide-subsection').forEach((subsection) => {
    if (subsection.classList.contains('no-subsection-collapse-item')) return;
    if (subsection.closest('.guide-section.no-subsection-collapse') && !subsection.classList.contains('allow-subsection-collapse')) return;
    const title = subsection.querySelector(':scope > h4');
    if (!title) return;
    const bodyNodes = Array.from(subsection.children).filter((node) => node !== title);
    if (!bodyNodes.length) return;

    title.classList.add('guide-subsection-collapsible');
    title.setAttribute('tabindex', '0');
    title.setAttribute('role', 'button');
    title.setAttribute('aria-expanded', 'false');
    bodyNodes.forEach((node) => node.classList.add('guide-subsection-collapsed'));

    const onToggle = () => {
      const collapsed = bodyNodes[0].classList.toggle('guide-subsection-collapsed');
      bodyNodes.slice(1).forEach((node) => node.classList.toggle('guide-subsection-collapsed', collapsed));
      title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    };
    title.addEventListener('click', onToggle);
    title.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggle();
      }
    });
  });
}

function renderGuideCardCatalogs({ esc, t, getCurrentUiLang, getCharacterLocalizedName, getAllCharacterInfos }) {
  const characterHost = document.getElementById('guideCharacterCatalog');
  const greenHost = document.getElementById('guideGreenCardCatalog');
  const whiteHost = document.getElementById('guideWhiteCardCatalog');
  const blackHost = document.getElementById('guideBlackCardCatalog');
  if (!characterHost || !greenHost || !whiteHost || !blackHost) return;

  const lang = getCurrentUiLang();
  const cardName = (card) => {
    const key = `room.active_card.names.${card}`;
    const localized = t(key);
    const baseName = localized === key ? card : localized;
    const icon = GUIDE_EQUIPMENT_ICONS[card] || '';
    return icon ? `${icon} ${baseName}` : baseName;
  };
  const cardDesc = (card) => {
    const key = `room.active_card.desc.${card}`;
    const localized = t(key);
    return localized === key ? '-' : localized;
  };

  const parseCharacterMeta = (characterKey) => {
    const desc = cardDesc(characterKey);
    const hpMatch = String(desc).match(/HP\s*(\d+)\s*(\*)?/i);
    return {
      hp: hpMatch ? hpMatch[1] : '-',
      isExpansion: Boolean(hpMatch && hpMatch[2] === '*'),
    };
  };

  const renderCharacterTable = () => {
    const characterRows = getAllCharacterInfos()
      .map(({ key, info }) => {
        const englishName = String(info?.names?.en || key || '').trim() || String(key || '').trim() || '-';
        const initial = englishName.charAt(0).toUpperCase() || '?';
        const { hp, isExpansion } = parseCharacterMeta(key);
        return {
          key,
          info,
          englishName,
          initial,
          hp,
          isExpansion,
        };
      })
      .sort((a, b) => {
        const initialCompare = a.initial.localeCompare(b.initial, 'en', { sensitivity: 'base' });
        if (initialCompare !== 0) return initialCompare;
        if (a.isExpansion !== b.isExpansion) return a.isExpansion ? 1 : -1;
        return a.englishName.localeCompare(b.englishName, 'en', { sensitivity: 'base' });
      });

    const rows = characterRows
      .map(({ key, info, hp, isExpansion }) => {
        const camp = info?.camp?.[lang] || info?.camp?.en || '-';
        const campClass = String(info?.camp?.en || '').trim().toLowerCase() || 'civilian';
        const badge = String(key || '?').trim().charAt(0).toUpperCase() || '?';
        const win = info?.win?.[lang] || info?.win?.en || '-';
        const ability = info?.ability?.[lang] || info?.ability?.en || '-';
        const localizedName = getCharacterLocalizedName(key, lang);
        return `
          <tr>
            <td><span class="damage-meter-badge ${esc(campClass)}">${esc(badge)}</span> ${esc(localizedName)}${isExpansion ? '*' : ''}</td>
            <td>${esc(hp)}</td>
            <td>${esc(camp)}</td>
            <td>${esc(win)}</td>
            <td>${esc(ability)}</td>
          </tr>
        `;
      })
      .join('');
    return `
      <table class="data-table" aria-label="${esc(t('guide.catalog.characters'))}">
        <thead>
          <tr>
            <th>${esc(t('guide.catalog.character_name'))}</th>
            <th>${esc(t('guide.catalog.character_hp'))}</th>
            <th>${esc(t('guide.catalog.camp'))}</th>
            <th>${esc(t('guide.catalog.win'))}</th>
            <th>${esc(t('guide.catalog.ability'))}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="lighttxt">${esc(t('guide.catalog.expansion_note'))}</p>
    `;
  };

  const renderCardTable = (cards, ariaLabel) => {
    const rows = cards
      .map((card) => `
        <tr>
          <td>${esc(cardName(card))}</td>
          <td>${esc(cardDesc(card))}</td>
        </tr>
      `)
      .join('');
    return `
      <table class="data-table" aria-label="${esc(ariaLabel)}">
        <thead>
          <tr>
            <th>${esc(t('guide.catalog.card_name'))}</th>
            <th>${esc(t('guide.catalog.effect'))}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  };

  characterHost.innerHTML = renderCharacterTable();
  greenHost.innerHTML = renderCardTable(GUIDE_GREEN_CARDS, t('guide.catalog.green'));
  whiteHost.innerHTML = renderCardTable(GUIDE_WHITE_CARDS, t('guide.catalog.white'));
  blackHost.innerHTML = renderCardTable(GUIDE_BLACK_CARDS, t('guide.catalog.black'));
}

export function initGuideAndOperationPages({ page, esc, t, getCurrentUiLang, getCharacterLocalizedName, getAllCharacterInfos }) {
  if (page === 'guide') {
    renderGuideCardCatalogs({ esc, t, getCurrentUiLang, getCharacterLocalizedName, getAllCharacterInfos });
  }
  initGuideSectionCollapse(page);
  initGuideSubsectionCollapse(page);
}
