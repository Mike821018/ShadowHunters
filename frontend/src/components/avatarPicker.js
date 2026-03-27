export function bindAvatarPicker({ state, el, avatarOptions, avatarPageSize, esc }) {
  if (!el.avatarOptionGrid || !el.avatarPreview || !el.avatarValue) return;

  const fitInputWidthByDigits = (input, value, minDigits = 1) => {
    if (!input) return;
    const digits = String(value ?? '').replace(/\D/g, '').length;
    const size = Math.max(minDigits, digits || 1);
    input.style.width = `${size + 2.6}ch`;
  };

  const preventEnterSubmit = (input, commit) => {
    if (!input) return;
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commit();
    });
  };

  const renderAvatarPreview = (avatar) => {
    el.avatarPreview.innerHTML = `<img src="${esc(avatar.imageSrc)}" alt="${esc(avatar.name)}" class="avatar-preview-img" />`;
  };

  const findAvatarById = (id) => avatarOptions.find((item) => item.id === id) || null;
  const findAvatarByStoredValue = (value) => {
    const id = Number(value);
    return findAvatarById(id) || avatarOptions[0];
  };

  const setSelectedAvatar = (avatar) => {
    const nextAvatar = avatar || avatarOptions[0];
    renderAvatarPreview(nextAvatar);
    el.avatarValue.value = String(nextAvatar.id);
    if (el.avatarNumberInput) {
      el.avatarNumberInput.value = String(nextAvatar.id);
    }

    const targetPage = Math.ceil(nextAvatar.id / avatarPageSize);
    if (Number.isFinite(targetPage) && targetPage > 0) {
      state.avatarPage = targetPage;
    }
  };

  const renderAvatarPage = () => {
    const totalPages = Math.max(1, Math.ceil(avatarOptions.length / avatarPageSize));
    if (state.avatarPage < 1) state.avatarPage = 1;
    if (state.avatarPage > totalPages) state.avatarPage = totalPages;

    const start = (state.avatarPage - 1) * avatarPageSize;
    const pageItems = avatarOptions.slice(start, start + avatarPageSize);

    if (el.avatarPageInfo) el.avatarPageInfo.textContent = `/ ${totalPages} 頁`;
    if (el.avatarPageInput) {
      el.avatarPageInput.value = String(state.avatarPage);
      el.avatarPageInput.max = String(totalPages);
      fitInputWidthByDigits(el.avatarPageInput, totalPages, 2);
    }
    if (el.btnAvatarPrev) el.btnAvatarPrev.disabled = state.avatarPage <= 1;
    if (el.btnAvatarNext) el.btnAvatarNext.disabled = state.avatarPage >= totalPages;

    el.avatarOptionGrid.innerHTML = pageItems
      .map((item) => {
        const selected = Number(el.avatarValue.value) === item.id;
        const selectedClass = selected ? ' selected' : '';
        const markerColor = item.color || '#9aa4ad';
        return `
      <article class="avatar-option-card${selectedClass}" role="button" tabindex="0" aria-label="頭像 ${esc(item.name)}" aria-pressed="${selected}" data-avatar-id="${item.id}">
        <span class="avatar-option-thumb"><img src="${esc(item.imageSrc)}" alt="${esc(item.name)}" class="avatar-option-img" /></span>
        <div class="avatar-option-meta">
          <span class="avatar-option-no">(${item.id})</span>
          <span class="avatar-option-name"><span class="trip-prefix-diamond" style="color:${esc(markerColor)}" aria-hidden="true">◆</span>${esc(item.name)}</span>
        </div>
      </article>
    `;
      })
      .join('');

    const avatarCards = el.avatarOptionGrid.querySelectorAll('.avatar-option-card[data-avatar-id]');
    avatarCards.forEach((card) => {
      const pickAvatar = () => {
        const avatarId = Number(card.getAttribute('data-avatar-id'));
        setSelectedAvatar(findAvatarById(avatarId));
        renderAvatarPage();
      };

      card.addEventListener('click', pickAvatar);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          pickAvatar();
        }
      });
    });
  };

  setSelectedAvatar(findAvatarByStoredValue(el.avatarValue.value || '1'));

  if (el.btnAvatarPrev) {
    el.btnAvatarPrev.onclick = () => {
      state.avatarPage -= 1;
      renderAvatarPage();
    };
  }

  if (el.btnAvatarNext) {
    el.btnAvatarNext.onclick = () => {
      state.avatarPage += 1;
      renderAvatarPage();
    };
  }

  if (el.avatarPageInput) {
    fitInputWidthByDigits(el.avatarPageInput, el.avatarPageInput.value, 2);

    el.avatarPageInput.addEventListener('input', () => {
      fitInputWidthByDigits(el.avatarPageInput, el.avatarPageInput.value, 2);
    });

    el.avatarPageInput.onchange = () => {
      const nextPage = Number(el.avatarPageInput.value);
      if (!Number.isFinite(nextPage)) {
        el.avatarPageInput.value = String(state.avatarPage);
        fitInputWidthByDigits(el.avatarPageInput, el.avatarPageInput.value, 2);
        return;
      }
      state.avatarPage = nextPage;
      renderAvatarPage();
    };

    preventEnterSubmit(el.avatarPageInput, () => el.avatarPageInput.onchange());
  }

  if (el.avatarNumberInput) {
    fitInputWidthByDigits(el.avatarNumberInput, el.avatarNumberInput.value, 2);

    el.avatarNumberInput.addEventListener('input', () => {
      fitInputWidthByDigits(el.avatarNumberInput, el.avatarNumberInput.value, 2);
    });

    el.avatarNumberInput.onchange = () => {
      const avatarId = Number(el.avatarNumberInput.value);
      const avatar = findAvatarById(avatarId);
      if (!avatar) {
        const current = findAvatarByStoredValue(el.avatarValue.value || '1');
        el.avatarNumberInput.value = String(current.id);
        fitInputWidthByDigits(el.avatarNumberInput, el.avatarNumberInput.value, 2);
        return;
      }
      setSelectedAvatar(avatar);
      renderAvatarPage();
    };

    preventEnterSubmit(el.avatarNumberInput, () => el.avatarNumberInput.onchange());
  }

  renderAvatarPage();
}
