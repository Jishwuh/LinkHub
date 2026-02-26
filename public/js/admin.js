document.addEventListener('DOMContentLoaded', () => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function decodeAttr(raw) {
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  function setupLinksEditor() {
    const linkForm = $('#link-form');
    if (!linkForm) return;

    const idEl = $('#link-id');
    const titleEl = $('#link-title');
    const urlEl = $('#link-url');
    const iconEl = $('#link-icon');
    const colorEl = $('#link-color');
    const orderEl = $('#link-order');
    const visibleEl = $('#link-visible');
    const submitBtn = $('#link-submit');
    const cancelBtn = $('#link-cancel');

    function startEditLink(data) {
      idEl.value = data.id || '';
      titleEl.value = data.title || '';
      urlEl.value = data.url || '';
      iconEl.value = data.icon || '';
      colorEl.value = data.color || '#2a2a2a';
      orderEl.value = data.order != null ? data.order : 0;
      visibleEl.checked = data.visible === '1' || data.visible === 1 || data.visible === true;
      submitBtn.textContent = 'Save Changes';
      cancelBtn.classList.remove('hidden');
      linkForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function cancelEditLink() {
      idEl.value = '';
      titleEl.value = '';
      urlEl.value = '';
      iconEl.value = '';
      colorEl.value = '#2a2a2a';
      orderEl.value = 0;
      visibleEl.checked = true;
      submitBtn.textContent = 'Add Link';
      cancelBtn.classList.add('hidden');
    }

    $$('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        startEditLink({
          id: btn.dataset.id,
          title: btn.dataset.title,
          url: btn.dataset.url,
          icon: btn.dataset.icon,
          color: btn.dataset.color,
          order: btn.dataset.order,
          visible: btn.dataset.visible
        });
      });
    });

    cancelBtn?.addEventListener('click', cancelEditLink);
  }

  function setupEmbedsEditor() {
    $$('.btn-embed-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const idEl = $('#embed-id');
        const titleEl = $('#embed-title');
        const orderEl = $('#embed-order');
        const visibleEl = $('#embed-visible');
        const htmlEl = $('#embed-html');
        if (!idEl || !titleEl || !orderEl || !visibleEl || !htmlEl) return;

        idEl.value = btn.dataset.id || '';
        titleEl.value = btn.dataset.title || '';
        orderEl.value = btn.dataset.order || 0;
        visibleEl.checked = btn.dataset.visible === '1';
        htmlEl.value = decodeAttr(btn.dataset.html || '');
        titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  function setupRedirectsEditor() {
    const redirectForm = $('#redirect-form');
    if (!redirectForm) return;

    const idEl = $('#redirect-id');
    const slugEl = $('#redirect-slug');
    const urlEl = $('#redirect-url');
    const activeEl = $('#redirect-active');
    const submitBtn = $('#redirect-submit');
    const cancelBtn = $('#redirect-cancel');

    function startEditRedirect(data) {
      idEl.value = data.id || '';
      slugEl.value = data.slug || '';
      urlEl.value = data.url || '';
      activeEl.checked = data.active === '1';
      submitBtn.textContent = 'Save Changes';
      cancelBtn.classList.remove('hidden');
    }

    function cancelEditRedirect() {
      idEl.value = '';
      slugEl.value = '';
      urlEl.value = '';
      activeEl.checked = true;
      submitBtn.textContent = 'Add Redirect';
      cancelBtn.classList.add('hidden');
    }

    $$('.btn-redirect-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        startEditRedirect({
          id: btn.dataset.id,
          slug: btn.dataset.slug,
          url: btn.dataset.url,
          active: btn.dataset.active
        });
      });
    });

    cancelBtn?.addEventListener('click', cancelEditRedirect);
  }

  function setupDeleteConfirmations() {
    $$('.confirm-delete-form').forEach(form => {
      form.addEventListener('submit', event => {
        const label = form.getAttribute('data-label') || 'item';
        if (!window.confirm(`Delete ${label}?`)) {
          event.preventDefault();
        }
      });
    });
  }

  function setupSettingsTabs() {
    const tabs = $$('.settings-tab');
    const panels = $$('.settings-panel');
    if (!tabs.length || !panels.length) return;

    function activate(tabName) {
      tabs.forEach(tab => {
        const active = tab.dataset.tab === tabName;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.forEach(panel => {
        panel.hidden = panel.dataset.panel !== tabName;
      });
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => activate(tab.dataset.tab));
    });

    activate('profile');
  }

  function setupBackgroundModeVisibility() {
    const modeSelect = $('#background-mode');
    const groups = $$('.bg-mode-group');
    if (!modeSelect || !groups.length) return;

    const sync = () => {
      const mode = modeSelect.value;
      groups.forEach(group => {
        const list = String(group.dataset.bgVisible || 'all')
          .split(',')
          .map(item => item.trim())
          .filter(Boolean);
        const visible = list.includes('all') || list.includes(mode);
        group.hidden = !visible;
      });
    };

    modeSelect.addEventListener('change', sync);
    sync();
  }

  function setupLivePreview() {
    const form = $('#settings-form');
    const preview = $('#design-preview');
    if (!form || !preview) return;

    const previewBg = $('#design-preview-bg');
    const previewOverlay = $('#design-preview-overlay');
    const previewHandle = $('#preview-handle');
    const previewName = $('#preview-name');
    const previewLike = $('#preview-like');
    const previewShare = $('#preview-share');

    const fields = {
      handle: $('[name="handle"]', form),
      displayName: $('[name="display_name"]', form),
      themeColor: $('[name="theme_color"]', form),
      fontTheme: $('[name="font_theme"]', form),
      linkLayout: $('[name="link_layout"]', form),
      buttonStyle: $('[name="button_style"]', form),
      animationStyle: $('[name="animation_style"]', form),
      backgroundMode: $('[name="background_mode"]', form),
      backgroundGradient: $('[name="background_gradient"]', form),
      backgroundPattern: $('[name="background_pattern"]', form),
      overlayOpacity: $('[name="overlay_opacity"]', form),
      backgroundImageUrl: $('[name="background_image_url"]', form),
      backgroundVideoUrl: $('[name="background_video_url"]', form),
      backgroundUpload: $('[name="background_media_file"]', form),
      likeEmoji: $('[name="like_emoji"]', form),
      shareEmoji: $('[name="share_emoji"]', form)
    };

    const classFamilies = {
      font: ['preview-font-modern', 'preview-font-editorial', 'preview-font-rounded', 'preview-font-mono'],
      layout: ['preview-layout-list', 'preview-layout-grid', 'preview-layout-compact', 'preview-layout-table'],
      button: ['preview-button-rounded', 'preview-button-pill', 'preview-button-square', 'preview-button-glass'],
      animation: ['preview-anim-none', 'preview-anim-subtle', 'preview-anim-energetic'],
      mode: ['preview-mode-youtube', 'preview-mode-image', 'preview-mode-video', 'preview-mode-gradient', 'preview-mode-particles'],
      gradient: ['preview-gradient-sunset', 'preview-gradient-ocean', 'preview-gradient-forest', 'preview-gradient-neon', 'preview-gradient-midnight'],
      pattern: ['preview-pattern-none', 'preview-pattern-grid', 'preview-pattern-dots', 'preview-pattern-noise']
    };

    let uploadedPreviewUrl = '';

    function setClassFamily(familyKey, className) {
      classFamilies[familyKey].forEach(item => preview.classList.remove(item));
      if (className) preview.classList.add(className);
    }

    function safeValue(el, fallback = '') {
      return el ? String(el.value || '').trim() : fallback;
    }

    function updatePreviewBackground(mode) {
      if (!previewBg) return;

      previewBg.style.removeProperty('background-image');

      if (mode === 'image') {
        let source = safeValue(fields.backgroundImageUrl);
        const file = fields.backgroundUpload?.files?.[0];

        if (file && file.type.startsWith('image/')) {
          if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl);
          uploadedPreviewUrl = URL.createObjectURL(file);
          source = uploadedPreviewUrl;
        }

        if (source) {
          previewBg.style.backgroundImage = `url(${source})`;
        }
      }

      if (mode === 'video') {
        const source = safeValue(fields.backgroundVideoUrl);
        if (source) {
          previewBg.style.backgroundImage =
            'linear-gradient(130deg, rgba(5, 10, 25, 0.85), rgba(45, 20, 60, 0.75)), url(' + source + ')';
        }
      }
    }

    function updatePreview() {
      const handleText = safeValue(fields.handle, '@handle') || '@handle';
      const displayNameText = safeValue(fields.displayName, 'Display Name') || 'Display Name';
      if (previewHandle) previewHandle.textContent = handleText.startsWith('@') ? handleText : '@' + handleText;
      if (previewName) previewName.textContent = displayNameText;

      if (previewLike) previewLike.textContent = `${safeValue(fields.likeEmoji, '❤') || '❤'} 124`;
      if (previewShare) previewShare.textContent = safeValue(fields.shareEmoji, '🔗') || '🔗';

      const color = safeValue(fields.themeColor);
      if (/^#[0-9a-fA-F]{6}$/.test(color)) {
        preview.style.setProperty('--preview-accent', color.toLowerCase());
      }

      const overlayOpacity = Number(safeValue(fields.overlayOpacity, '0.55'));
      if (previewOverlay && Number.isFinite(overlayOpacity)) {
        previewOverlay.style.setProperty('--preview-overlay-opacity', String(Math.max(0, Math.min(0.9, overlayOpacity))));
      }

      const font = safeValue(fields.fontTheme, 'modern');
      const layout = safeValue(fields.linkLayout, 'list');
      const button = safeValue(fields.buttonStyle, 'rounded');
      const animation = safeValue(fields.animationStyle, 'subtle');
      const mode = safeValue(fields.backgroundMode, 'youtube');
      const gradient = safeValue(fields.backgroundGradient, 'sunset');
      const pattern = safeValue(fields.backgroundPattern, 'none');

      setClassFamily('font', `preview-font-${font}`);
      setClassFamily('layout', `preview-layout-${layout}`);
      setClassFamily('button', `preview-button-${button}`);
      setClassFamily('animation', `preview-anim-${animation}`);
      setClassFamily('mode', `preview-mode-${mode}`);
      setClassFamily('gradient', `preview-gradient-${gradient}`);
      setClassFamily('pattern', `preview-pattern-${pattern}`);

      updatePreviewBackground(mode);
    }

    form.addEventListener('input', updatePreview);
    form.addEventListener('change', updatePreview);
    updatePreview();
  }

  setupLinksEditor();
  setupEmbedsEditor();
  setupRedirectsEditor();
  setupDeleteConfirmations();
  setupSettingsTabs();
  setupBackgroundModeVisibility();
  setupLivePreview();
});
