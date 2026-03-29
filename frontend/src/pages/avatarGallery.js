import { AVATAR_PAGE_SIZE, addUploadedAvatar, getAvatarById, getAvatarOptions, loadAvatarCatalog } from '../avatarConfig.js';
import { applyI18n, t } from '../i18n.js';

let selectedAvatarId = 1;
let filteredOptions = [];
let allOptions = [];

const AVATAR_COLOR_PRESETS = ['#dcdedc', '#848284', '#fcfe04', '#fc8244', '#fc0204', '#84dafc', '#0402fc', '#04fe04', '#fc02fc', '#fcd6fc', '#9aa4ad'];

function normalizeHexColor(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : '';
}

function renderUploadPreviewCard({ src = '', name = '', color = '#9aa4ad', idLabel = 'NEW' } = {}) {
  const preview = document.getElementById('avatarUploadPreview');
  if (!preview) return;
  const safeColor = normalizeHexColor(color) || '#9aa4ad';
  const safeName = String(name || '').trim() || t('avatar.upload_name');
  const thumb = src
    ? `<img src="${src}" alt="${safeName}" class="avatar-option-img" />`
    : '<span class="lighttxt">?</span>';
  preview.innerHTML = `
    <span class="avatar-option-thumb">
      ${thumb}
    </span>
    <div class="avatar-option-meta">
      <span class="avatar-option-no">(${idLabel})</span>
      <span class="avatar-option-name"><span class="trip-prefix-diamond" style="color:${safeColor}" aria-hidden="true">◆</span>${safeName}</span>
    </div>
  `;
}

function findAvatarById(id) {
  return getAvatarById(id);
}

function renderSelectedPreview() {
  const preview = document.getElementById('avatarGalleryPreview');
  const input = document.getElementById('avatarGalleryNumberInput');
  const avatar = findAvatarById(selectedAvatarId);
  if (!preview || !avatar) return;

  preview.innerHTML = `<img src="${avatar.imageSrc}" alt="${avatar.name}" class="avatar-preview-img" />`;
  if (input) input.value = String(avatar.id);
}

function renderAvatarPage(page) {
  const grid = document.getElementById('avatarGalleryGrid');
  const pageInput = document.getElementById('avatarGalleryPageInput');
  const pageInfo = document.getElementById('avatarGalleryPageInfo');
  if (!grid || !pageInput || !pageInfo) return { page: 1, totalPages: 1 };

  const source = filteredOptions;
  const totalPages = Math.max(1, Math.ceil(source.length / AVATAR_PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * AVATAR_PAGE_SIZE;
  const items = source.slice(start, start + AVATAR_PAGE_SIZE);

  grid.innerHTML = '';
  items.forEach((avatar) => {
    const card = document.createElement('article');
    const selected = avatar.id === selectedAvatarId;
    card.className = `avatar-option-card readonly${selected ? ' selected' : ''}`;
    card.setAttribute('aria-label', `${avatar.id}. ${avatar.name}`);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.innerHTML = `
      <span class="avatar-option-thumb">
        <img src="${avatar.imageSrc}" alt="${avatar.name}" class="avatar-option-img" loading="lazy" />
      </span>
      <div class="avatar-option-meta">
        <span class="avatar-option-no">(${avatar.id})</span>
        <span class="avatar-option-name"><span class="trip-prefix-diamond" style="color:${avatar.color || '#9aa4ad'}" aria-hidden="true">◆</span>${avatar.name}</span>
      </div>
    `;
    const selectAvatar = () => {
      selectedAvatarId = avatar.id;
      renderSelectedPreview();
      renderAvatarPage(safePage);
    };
    card.addEventListener('click', selectAvatar);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectAvatar();
      }
    });
    grid.appendChild(card);
  });

  pageInput.value = String(safePage);
  pageInfo.textContent = `/ ${totalPages}`;
  return { page: safePage, totalPages };
}

function bindAvatarTabs() {
  const tabButtons = Array.from(document.querySelectorAll('.avatar-page-tabs [data-tab-target]'));
  const panes = Array.from(document.querySelectorAll('.avatar-gallery-page .identity-tab-pane'));
  if (!tabButtons.length || !panes.length) return;

  const activate = (targetId) => {
    panes.forEach((pane) => pane.classList.toggle('current', pane.id === targetId));
    tabButtons.forEach((button) => {
      const current = button.getAttribute('data-tab-target') === targetId;
      button.classList.toggle('current', current);
      button.setAttribute('aria-selected', current ? 'true' : 'false');
    });
  };

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => activate(button.getAttribute('data-tab-target')));
  });
}

function activateAvatarTab(targetId) {
  const tabButtons = Array.from(document.querySelectorAll('.avatar-page-tabs [data-tab-target]'));
  const panes = Array.from(document.querySelectorAll('.avatar-gallery-page .identity-tab-pane'));
  if (!tabButtons.length || !panes.length) return;
  panes.forEach((pane) => pane.classList.toggle('current', pane.id === targetId));
  tabButtons.forEach((button) => {
    const current = button.getAttribute('data-tab-target') === targetId;
    button.classList.toggle('current', current);
    button.setAttribute('aria-selected', current ? 'true' : 'false');
  });
}

function compressImageFileToDataUrl(file, { canvasSize = 56, mimeType = 'image/png', quality = 0.9 } = {}) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error('invalid file'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('decode_failed'));
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvasSize;
          canvas.height = canvasSize;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('canvas_failed'));
            return;
          }

          // 保持比例縮放並置中，不拉伸圖片。
          ctx.clearRect(0, 0, canvasSize, canvasSize);
          const scale = Math.min(canvasSize / image.width, canvasSize / image.height);
          const drawW = Math.max(1, Math.round(image.width * scale));
          const drawH = Math.max(1, Math.round(image.height * scale));
          const offsetX = Math.floor((canvasSize - drawW) / 2);
          const offsetY = Math.floor((canvasSize - drawH) / 2);
          ctx.drawImage(image, offsetX, offsetY, drawW, drawH);

          const output = canvas.toDataURL(mimeType, quality);
          resolve(output);
        } catch (error) {
          reject(error);
        }
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function bindUploadPreview(toast) {
  const fileInput = document.getElementById('avatarUploadFile');
  const preview = document.getElementById('avatarUploadPreview');
  const meta = document.getElementById('avatarUploadMeta');
  const nameInput = document.getElementById('avatarUploadName');
  const colorInput = document.getElementById('avatarUploadColor');
  if (!fileInput || !preview || !meta) return;

  renderUploadPreviewCard({ name: nameInput?.value || '', color: colorInput?.value || '#9aa4ad' });

  nameInput?.addEventListener('input', () => {
    const img = preview.querySelector('img');
    renderUploadPreviewCard({
      src: img?.getAttribute('src') || '',
      name: nameInput.value || '',
      color: colorInput?.value || '#9aa4ad',
    });
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      renderUploadPreviewCard({ name: nameInput?.value || '', color: colorInput?.value || '#9aa4ad' });
      meta.textContent = t('avatar.upload_meta_idle');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        renderUploadPreviewCard({
          src: String(reader.result || ''),
          name: nameInput?.value || file.name,
          color: colorInput?.value || '#9aa4ad',
        });
        meta.textContent = `${file.name}｜${img.width}x${img.height}px`;
      };
      img.onerror = () => {
        renderUploadPreviewCard({ name: nameInput?.value || '', color: colorInput?.value || '#9aa4ad' });
        meta.textContent = t('avatar.upload_failed');
        toast(t('avatar.upload_failed'), 'error');
      };
      img.src = String(reader.result || '');
    };
    reader.onerror = () => {
      renderUploadPreviewCard({ name: nameInput?.value || '', color: colorInput?.value || '#9aa4ad' });
      meta.textContent = t('avatar.upload_failed');
      toast(t('avatar.upload_failed'), 'error');
    };
    reader.readAsDataURL(file);
  });
}

function bindUploadColorControls() {
  const presetWrap = document.getElementById('avatarUploadColorPresets');
  const colorInput = document.getElementById('avatarUploadColor');
  const colorPreview = document.getElementById('avatarUploadColorPreview');
  const nameInput = document.getElementById('avatarUploadName');
  const preview = document.getElementById('avatarUploadPreview');
  if (!presetWrap || !colorInput || !colorPreview) return;

  const syncPreview = () => {
    const safeColor = normalizeHexColor(colorInput.value) || '#9aa4ad';
    colorPreview.style.background = safeColor;
    const img = preview?.querySelector('img');
    renderUploadPreviewCard({
      src: img?.getAttribute('src') || '',
      name: nameInput?.value || '',
      color: safeColor,
    });
    presetWrap.querySelectorAll('.color-swatch').forEach((button) => {
      button.classList.toggle('selected', button.getAttribute('data-color') === safeColor);
    });
  };

  presetWrap.innerHTML = '';
  AVATAR_COLOR_PRESETS.forEach((color) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-swatch';
    button.style.background = color;
    button.setAttribute('data-color', color);
    button.setAttribute('aria-label', color);
    button.addEventListener('click', () => {
      colorInput.value = color;
      syncPreview();
    });
    presetWrap.appendChild(button);
  });

  colorInput.addEventListener('input', syncPreview);
  colorInput.addEventListener('blur', () => {
    colorInput.value = normalizeHexColor(colorInput.value) || '#9aa4ad';
    syncPreview();
  });
  syncPreview();
}

export async function initAvatarGalleryPage({ toast, dispatch }) {
  let currentPage = 1;

  await loadAvatarCatalog();
  allOptions = getAvatarOptions();
  filteredOptions = allOptions.slice();

  selectedAvatarId = allOptions[0]?.id || 1;
  renderSelectedPreview();

  const applyPage = (nextPage) => {
    const result = renderAvatarPage(nextPage);
    currentPage = result.page;
  };

  applyPage(currentPage);

  const prev = document.getElementById('btnAvatarGalleryPrev');
  const next = document.getElementById('btnAvatarGalleryNext');
  const pageInput = document.getElementById('avatarGalleryPageInput');
  const numberInput = document.getElementById('avatarGalleryNumberInput');

  prev?.addEventListener('click', () => applyPage(currentPage - 1));
  next?.addEventListener('click', () => applyPage(currentPage + 1));
  pageInput?.addEventListener('change', () => {
    const requested = Number.parseInt(pageInput.value || '1', 10) || 1;
    applyPage(requested);
  });

  // Avatar name search
  const searchInput = document.getElementById('avatarSearchInput');
  const searchBtn = document.getElementById('btnAvatarSearch');
  const searchClearBtn = document.getElementById('btnAvatarSearchClear');

  const applySearch = () => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    filteredOptions = query
      ? allOptions.filter((a) => a.name.toLowerCase().includes(query) || String(a.id).includes(query))
      : allOptions.slice();
    applyPage(1);
  };

  searchBtn?.addEventListener('click', applySearch);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applySearch();
  });
  searchClearBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    filteredOptions = allOptions.slice();
    applyPage(1);
  });

  numberInput?.addEventListener('change', () => {
    const requested = Number.parseInt(numberInput.value || '1', 10) || 1;
    const avatar = findAvatarById(requested);
    if (!avatar) {
      numberInput.value = String(selectedAvatarId);
      return;
    }
    selectedAvatarId = avatar.id;
    renderSelectedPreview();
    const targetPage = Math.ceil(selectedAvatarId / AVATAR_PAGE_SIZE);
    applyPage(targetPage);
  });

  if (!allOptions.length) {
    toast('No avatars found', 'error');
  }

  bindAvatarTabs();
  bindUploadPreview(toast);
  bindUploadColorControls();

  // Upload form submit handler
  const uploadForm = document.getElementById('avatarUploadPreviewForm');
  if (uploadForm && uploadForm.dataset.bound !== 'true') {
    uploadForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const trip = document.getElementById('avatarUploadTrip')?.value.trim() || '';
      const password = document.getElementById('avatarUploadPassword')?.value || '';
      const name = document.getElementById('avatarUploadName')?.value.trim() || '';
      const color = normalizeHexColor(document.getElementById('avatarUploadColor')?.value) || '#9aa4ad';
      const file = document.getElementById('avatarUploadFile')?.files?.[0];
      if (!trip || !password || !name || !file) {
        toast(t('avatar.upload_required'), 'error');
        return;
      }
      void (async () => {
        try {
          const compressedDataUrl = await compressImageFileToDataUrl(file, { canvasSize: 56, mimeType: 'image/png', quality: 0.9 });
          const uploaded = await dispatch('upload_avatar', {
            trip,
            password,
            name,
            color,
            image_data_url: compressedDataUrl,
          });
          addUploadedAvatar(uploaded);
          allOptions = getAvatarOptions();
          filteredOptions = allOptions.slice();
          selectedAvatarId = Number(uploaded.id || selectedAvatarId);
          renderSelectedPreview();
          applyPage(Math.ceil(selectedAvatarId / AVATAR_PAGE_SIZE));

          uploadForm.reset();
          applyI18n(uploadForm);
          renderUploadPreviewCard({ name: '', color: '#9aa4ad' });
          const uploadMeta = document.getElementById('avatarUploadMeta');
          if (uploadMeta) uploadMeta.textContent = t('avatar.upload_meta_idle');
          const colorInput = document.getElementById('avatarUploadColor');
          if (colorInput) colorInput.value = '#9aa4ad';
          bindUploadColorControls();

          activateAvatarTab('avatarTabGallery');
          toast(t('avatar.upload_success'));
        } catch (error) {
          toast(error.message || t('avatar.upload_failed'), 'error');
        }
      })();
    });
    uploadForm.dataset.bound = 'true';
  }
}
