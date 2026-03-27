import { AVATAR_OPTIONS, AVATAR_PAGE_SIZE } from '../avatarConfig.js';

let selectedAvatarId = 1;

function findAvatarById(id) {
  return AVATAR_OPTIONS.find((item) => item.id === id) || AVATAR_OPTIONS[0] || null;
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

  const totalPages = Math.max(1, Math.ceil(AVATAR_OPTIONS.length / AVATAR_PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * AVATAR_PAGE_SIZE;
  const items = AVATAR_OPTIONS.slice(start, start + AVATAR_PAGE_SIZE);

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

function bindUploadPreview(toast) {
  const fileInput = document.getElementById('avatarUploadFile');
  const preview = document.getElementById('avatarUploadPreview');
  const meta = document.getElementById('avatarUploadMeta');
  const nameInput = document.getElementById('avatarUploadName');
  if (!fileInput || !preview || !meta) return;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      preview.innerHTML = '';
      meta.textContent = '選擇圖片後會在這裡顯示預覽與像素大小。';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        preview.innerHTML = `<img src="${reader.result}" alt="${nameInput?.value || file.name}" class="avatar-preview-img" />`;
        meta.textContent = `${file.name}｜${img.width}x${img.height}px`;
      };
      img.onerror = () => {
        preview.innerHTML = '';
        meta.textContent = '圖片讀取失敗';
        toast('圖片讀取失敗', 'error');
      };
      img.src = String(reader.result || '');
    };
    reader.onerror = () => {
      preview.innerHTML = '';
      meta.textContent = '圖片讀取失敗';
      toast('圖片讀取失敗', 'error');
    };
    reader.readAsDataURL(file);
  });
}

export async function initAvatarGalleryPage({ toast }) {
  let currentPage = 1;

  selectedAvatarId = AVATAR_OPTIONS[0]?.id || 1;
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

  if (!AVATAR_OPTIONS.length) {
    toast('No avatars found', 'error');
  }

  bindAvatarTabs();
  bindUploadPreview(toast);
}
