document.addEventListener('DOMContentLoaded', () => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function decodeAttr(raw) {
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return String(raw);
    }
  }

  function encodeAttr(raw) {
    return encodeURIComponent(String(raw || ''));
  }

  function normalizeHex(raw, fallback = '#2a2a2a') {
    const value = String(raw || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
  }

  function asBoolean(value) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }

  async function parseResponse(response) {
    const raw = await response.text();
    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const message = data?.error || raw || `Request failed (${response.status})`;
      throw new Error(message);
    }

    return data || {};
  }

  async function postUrlEncoded(url, payload = {}) {
    const body = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => body.append(key, String(item)));
      } else if (value != null) {
        body.append(key, String(value));
      }
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'fetch'
      },
      body
    });

    return parseResponse(response);
  }

  async function postFormData(url, formData) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'fetch'
      },
      body: formData
    });

    return parseResponse(response);
  }

  const toastEl = $('#admin-toast');
  let toastTimer = 0;

  function showToast(message, type = 'success') {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.remove('show', 'toast-error');
    if (type === 'error') toastEl.classList.add('toast-error');
    toastEl.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2200);
  }

  function applyColorChip(chip, colorValue) {
    if (!chip) return;
    const color = normalizeHex(colorValue);
    chip.style.backgroundColor = color;
    chip.title = color;
    chip.dataset.color = color;
  }

  const csrfToken = $('#csrf-token')?.value || '';

  function setupSettingsTabs() {
    const tabs = $$('.settings-tab');
    const panels = $$('.settings-panel');
    if (!tabs.length || !panels.length) return;

    const activate = tabName => {
      tabs.forEach(tab => {
        const active = tab.dataset.tab === tabName;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.forEach(panel => {
        panel.hidden = panel.dataset.panel !== tabName;
      });
    };

    tabs.forEach(tab => {
      tab.addEventListener('click', () => activate(tab.dataset.tab || 'profile'));
    });

    activate('profile');
  }

  function setupThemeColorPreview() {
    const input = $('#theme-color');
    const preview = $('#theme-color-preview');
    if (!input || !preview) return;

    const sync = () => applyColorChip(preview, input.value);
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    sync();
  }

  function setupBackgroundModeVisibility(form) {
    const modeSelect = $('#background-mode', form || document);
    const groups = $$('.bg-mode-group', form || document);
    if (!modeSelect || !groups.length) return () => {};

    const sync = () => {
      const mode = String(modeSelect.value || '').trim();
      groups.forEach(group => {
        const visibleModes = String(group.dataset.bgVisible || 'all')
          .split(',')
          .map(item => item.trim())
          .filter(Boolean);

        const visible = visibleModes.includes('all') || visibleModes.includes(mode);
        group.hidden = !visible;
        $$('input, select, textarea', group).forEach(control => {
          control.disabled = !visible;
        });
      });
    };

    modeSelect.addEventListener('change', sync);
    sync();
    return sync;
  }

  function setupSettingsSave() {
    const form = $('#settings-form');
    if (!form) return;

    const syncBackgroundMode = setupBackgroundModeVisibility(form);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      syncBackgroundMode();

      const saveButtons = $$('.settings-save');
      saveButtons.forEach(btn => {
        btn.disabled = true;
        btn.textContent = 'Saving...';
      });

      const formData = new FormData(form);
      if (csrfToken && !formData.has('_csrf')) formData.set('_csrf', csrfToken);

      try {
        const payload = await postFormData(form.action, formData);
        showToast(payload.message || 'Changes have been saved');
      } catch (error) {
        showToast(error.message || 'Failed to save settings', 'error');
      } finally {
        saveButtons.forEach(btn => {
          btn.disabled = false;
          btn.textContent = 'Save settings';
        });
      }
    });
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

    const setClassFamily = (familyKey, className) => {
      classFamilies[familyKey].forEach(item => preview.classList.remove(item));
      if (className) preview.classList.add(className);
    };

    const safeValue = (el, fallback = '') => (el ? String(el.value || '').trim() : fallback);

    const updatePreviewBackground = mode => {
      if (!previewBg) return;

      previewBg.style.removeProperty('background-image');
      previewBg.style.removeProperty('background-size');
      previewBg.style.removeProperty('background-position');

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
          previewBg.style.backgroundSize = 'cover';
          previewBg.style.backgroundPosition = 'center';
        }
      }

      if (mode === 'video') {
        const source = safeValue(fields.backgroundVideoUrl);
        if (source) {
          previewBg.style.backgroundImage = `linear-gradient(130deg, rgba(5, 10, 25, 0.85), rgba(45, 20, 60, 0.75)), url(${source})`;
          previewBg.style.backgroundSize = 'cover';
          previewBg.style.backgroundPosition = 'center';
        }
      }
    };

    const updatePreview = () => {
      const handleText = safeValue(fields.handle, '@handle') || '@handle';
      const displayNameText = safeValue(fields.displayName, 'Display Name') || 'Display Name';
      if (previewHandle) previewHandle.textContent = handleText.startsWith('@') ? handleText : `@${handleText}`;
      if (previewName) previewName.textContent = displayNameText;

      if (previewLike) previewLike.textContent = `${safeValue(fields.likeEmoji, '❤') || '❤'} 124`;
      if (previewShare) previewShare.textContent = safeValue(fields.shareEmoji, '🔗') || '🔗';

      const color = normalizeHex(safeValue(fields.themeColor), '#8ab4ff');
      preview.style.setProperty('--preview-accent', color);

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
    };

    form.addEventListener('input', updatePreview);
    form.addEventListener('change', updatePreview);
    updatePreview();
  }

  function createModalController() {
    const overlay = $('#admin-modal-overlay');
    const modalCards = $$('.modal-card', overlay || document);
    const modals = {
      link: $('#link-modal', overlay || document),
      embed: $('#embed-modal', overlay || document),
      redirect: $('#redirect-modal', overlay || document),
      utm: $('#utm-modal', overlay || document)
    };

    if (!overlay) {
      return {
        open: () => {},
        close: () => {}
      };
    }

    const close = () => {
      overlay.hidden = true;
      document.body.classList.remove('modal-open');
      modalCards.forEach(card => {
        card.hidden = true;
      });
    };

    const open = key => {
      overlay.hidden = false;
      document.body.classList.add('modal-open');
      modalCards.forEach(card => {
        card.hidden = true;
      });

      const target = modals[key];
      if (target) target.hidden = false;
    };

    $$('[data-modal-close]', overlay).forEach(btn => {
      btn.addEventListener('click', event => {
        event.preventDefault();
        close();
      });
    });

    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !overlay.hidden) close();
    });

    return { open, close };
  }

  function getDragAfterElement(container, y) {
    const draggableElements = $$('.link-admin-item:not(.dragging)', container);
    let closest = null;
    let closestOffset = Number.NEGATIVE_INFINITY;

    draggableElements.forEach(element => {
      const box = element.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) {
        closestOffset = offset;
        closest = element;
      }
    });

    return closest;
  }

  function setupUtmBuilder(modal) {
    const form = $('#utm-modal-form');
    const modalTitle = $('#utm-modal-title');
    const baseUrlEl = $('#utm-base-url');
    const resultUrlEl = $('#utm-result-url');
    const copyBtn = $('#utm-copy-btn');
    const copyStatusEl = $('#utm-copy-status');
    const sourceEl = $('#utm-source');
    const mediumEl = $('#utm-medium');
    const campaignEl = $('#utm-campaign');
    const termEl = $('#utm-term');
    const contentEl = $('#utm-content');

    if (!form || !baseUrlEl || !resultUrlEl || !copyBtn) {
      return {
        openForLink: () => {},
        openForRedirect: () => {}
      };
    }

    const fields = [sourceEl, mediumEl, campaignEl, termEl, contentEl].filter(Boolean);
    const toSafeText = value => String(value || '').trim().slice(0, 120);
    let currentBaseUrl = '';

    const updateStatus = (message, type = '') => {
      if (!copyStatusEl) return;
      copyStatusEl.textContent = message;
      copyStatusEl.classList.remove('text-success', 'text-danger');
      if (type === 'success') copyStatusEl.classList.add('text-success');
      if (type === 'error') copyStatusEl.classList.add('text-danger');
    };

    const buildTrackedUrl = () => {
      if (!currentBaseUrl) return '';
      let parsed;
      try {
        parsed = new URL(currentBaseUrl);
      } catch {
        return '';
      }

      const mapping = {
        utm_source: sourceEl,
        utm_medium: mediumEl,
        utm_campaign: campaignEl,
        utm_term: termEl,
        utm_content: contentEl
      };

      Object.entries(mapping).forEach(([key, field]) => {
        const value = toSafeText(field?.value);
        if (value) parsed.searchParams.set(key, value);
        else parsed.searchParams.delete(key);
      });

      return parsed.toString();
    };

    const syncTrackedUrl = () => {
      const tracked = buildTrackedUrl();
      resultUrlEl.value = tracked;
      return tracked;
    };

    const resetUtmFields = () => {
      fields.forEach(field => {
        field.value = '';
      });
    };

    const openUtmModal = ({ kind, label, baseUrl }) => {
      currentBaseUrl = String(baseUrl || '');
      if (!currentBaseUrl) return;

      resetUtmFields();
      baseUrlEl.value = currentBaseUrl;
      if (modalTitle) modalTitle.textContent = `Tracked Link Builder: ${label || kind}`;
      syncTrackedUrl();
      updateStatus('Build a campaign URL and copy it in one click.');
      modal.open('utm');
      sourceEl?.focus();
    };

    fields.forEach(field => {
      field.addEventListener('input', () => {
        syncTrackedUrl();
      });
    });

    copyBtn.addEventListener('click', async () => {
      const tracked = syncTrackedUrl();
      if (!tracked) {
        updateStatus('Unable to build tracked URL', 'error');
        return;
      }

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(tracked);
        } else {
          resultUrlEl.focus();
          resultUrlEl.select();
          document.execCommand('copy');
        }
        updateStatus('Tracked URL copied to clipboard', 'success');
      } catch {
        updateStatus('Copy failed. You can still select and copy manually.', 'error');
      }
    });

    return {
      openForLink(item) {
        const id = Number(item?.dataset?.id || 0);
        if (!id) return;
        const label = item?.dataset?.title || `Link #${id}`;
        const baseUrl = `${window.location.origin}/out/${id}`;
        openUtmModal({ kind: 'link', label, baseUrl });
      },
      openForRedirect(item) {
        const slugRaw = String(item?.dataset?.slug || '').trim().replace(/^\/+/, '');
        if (!slugRaw) return;
        const label = `/${slugRaw}`;
        const baseUrl = `${window.location.origin}/${encodeURIComponent(slugRaw)}`;
        openUtmModal({ kind: 'redirect', label, baseUrl });
      }
    };
  }

  function setupLinksManager(modal, utmBuilder) {
    const list = $('#links-admin-list');
    const createBtn = $('#link-create-btn');
    const form = $('#link-modal-form');
    if (!list || !createBtn || !form) return;

    const modalTitle = $('#link-modal-title');
    const idEl = $('#link-modal-id');
    const titleEl = $('#link-modal-title-input');
    const urlEl = $('#link-modal-url');
    const iconEl = $('#link-modal-icon');
    const iconPreviewImgEl = $('#link-modal-icon-preview-image');
    const iconPreviewFallbackEl = $('#link-modal-icon-preview-fallback');
    const iconPreviewLabelEl = $('#link-modal-icon-preview-label');
    const colorEl = $('#link-modal-color');
    const colorPreviewEl = $('#link-modal-color-preview');
    const visibleEl = $('#link-modal-visible');

    let dragArmedId = null;

    const syncModalColor = () => applyColorChip(colorPreviewEl, colorEl?.value);
    const knownIconValues = () => new Set(Array.from(iconEl.options).map(option => option.value));

    const ensureIconOption = value => {
      const key = String(value || '').trim();
      if (!key) return;
      if (knownIconValues().has(key)) return;
      const option = document.createElement('option');
      option.value = key;
      option.textContent = key;
      iconEl.appendChild(option);
    };

    const syncIconPreview = () => {
      const key = String(iconEl.value || '').trim();
      if (!key) {
        if (iconPreviewImgEl) {
          iconPreviewImgEl.hidden = true;
          iconPreviewImgEl.removeAttribute('src');
        }
        if (iconPreviewFallbackEl) {
          iconPreviewFallbackEl.hidden = false;
          iconPreviewFallbackEl.textContent = '?';
        }
        if (iconPreviewLabelEl) iconPreviewLabelEl.textContent = 'No icon selected';
        return;
      }

      if (iconPreviewImgEl) {
        iconPreviewImgEl.hidden = false;
        iconPreviewImgEl.src = `/static/images/socials/${encodeURIComponent(key)}.svg`;
        iconPreviewImgEl.alt = `${key} icon preview`;
      }

      if (iconPreviewFallbackEl) {
        iconPreviewFallbackEl.hidden = true;
      }

      if (iconPreviewLabelEl) iconPreviewLabelEl.textContent = key;
    };

    const syncOrderBadges = () => {
      $$('.link-admin-item', list).forEach((item, idx) => {
        item.dataset.order = String(idx + 1);
        const badge = $('.order-badge', item);
        if (badge) badge.textContent = `#${idx + 1}`;
      });
    };

    const setLinkItem = (item, link) => {
      const isVisible = asBoolean(link.is_visible);
      item.dataset.id = String(link.id || '');
      item.dataset.title = link.title || '';
      item.dataset.url = link.url || '';
      item.dataset.icon = link.icon_key || '';
      item.dataset.color = normalizeHex(link.color_hex, '#2a2a2a');
      item.dataset.visible = isVisible ? '1' : '0';
      if (link.order_index != null) item.dataset.order = String(link.order_index);

      item.classList.toggle('is-hidden-link', !isVisible);

      const titleNode = $('.link-admin-title', item);
      if (titleNode) titleNode.textContent = link.title || '';

      const urlNode = $('.link-admin-url', item);
      if (urlNode) {
        urlNode.textContent = link.url || '';
        urlNode.href = link.url || '#';
      }

      const iconPill = $('.link-pill', item);
      if (iconPill) {
        if (link.icon_key) {
          iconPill.hidden = false;
          iconPill.textContent = link.icon_key;
        } else {
          iconPill.hidden = true;
          iconPill.textContent = '';
        }
      }

      applyColorChip($('.color-chip', item), link.color_hex || '#2a2a2a');

      const toggleBtn = $('[data-action="toggle"]', item);
      if (toggleBtn) {
        toggleBtn.textContent = isVisible ? 'Hide' : 'Show';
        toggleBtn.title = isVisible ? 'Hide link' : 'Show link';
      }
    };

    const createLinkItem = link => {
      const article = document.createElement('article');
      article.className = 'link-admin-item';
      article.draggable = true;
      article.innerHTML = `
        <button type="button" class="icon-action drag-handle" data-action="drag" title="Drag to reorder" aria-label="Drag to reorder">&#8801;</button>
        <div class="link-admin-main">
          <div class="link-admin-title"></div>
          <a class="link-admin-url" target="_blank" rel="noopener noreferrer"></a>
        </div>
        <div class="link-admin-meta">
          <span class="order-badge">#0</span>
          <span class="link-pill" hidden></span>
          <span class="color-chip" data-color="#2a2a2a" title="#2a2a2a"></span>
        </div>
        <div class="link-admin-actions">
          <button type="button" class="icon-action" data-action="edit" title="Edit link">Edit</button>
          <button type="button" class="icon-action" data-action="utm" title="Build tracked URL">Track</button>
          <button type="button" class="icon-action" data-action="toggle" title="Toggle visibility">Hide</button>
          <button type="button" class="icon-action danger" data-action="delete" title="Delete link">Del</button>
        </div>
      `;
      setLinkItem(article, link);
      return article;
    };

    const openCreateModal = event => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (modalTitle) modalTitle.textContent = 'Create Link';
      idEl.value = '';
      titleEl.value = '';
      urlEl.value = '';
      iconEl.value = '';
      colorEl.value = '#2a2a2a';
      visibleEl.checked = true;
      syncModalColor();
      syncIconPreview();
      modal.open('link');
      titleEl.focus();
    };

    const openEditModal = item => {
      if (modalTitle) modalTitle.textContent = 'Edit Link';
      idEl.value = item.dataset.id || '';
      titleEl.value = item.dataset.title || '';
      urlEl.value = item.dataset.url || '';
      ensureIconOption(item.dataset.icon || '');
      iconEl.value = item.dataset.icon || '';
      colorEl.value = normalizeHex(item.dataset.color, '#2a2a2a');
      visibleEl.checked = item.dataset.visible !== '0';
      syncModalColor();
      syncIconPreview();
      modal.open('link');
      titleEl.focus();
    };

    const persistOrder = async (showSuccess = true) => {
      const ids = $$('.link-admin-item', list).map(item => Number(item.dataset.id)).filter(Number.isInteger);
      if (!ids.length) return;
      await postUrlEncoded('/admin/link/reorder', {
        _csrf: csrfToken,
        ids
      });
      syncOrderBadges();
      if (showSuccess) showToast('Link order saved');
    };

    createBtn.addEventListener('click', openCreateModal);

    form.addEventListener('submit', async event => {
      event.preventDefault();

      const id = Number(idEl.value || 0);
      const existing = id > 0 ? $(`.link-admin-item[data-id="${id}"]`, list) : null;
      const orderIndex = existing ? Number(existing.dataset.order || 0) || 1 : $$('.link-admin-item', list).length + 1;

      const payload = {
        _csrf: csrfToken,
        id,
        title: titleEl.value,
        url: urlEl.value,
        icon_key: iconEl.value,
        color_hex: normalizeHex(colorEl.value),
        is_visible: visibleEl.checked ? 1 : 0,
        order_index: orderIndex
      };

      try {
        const result = await postUrlEncoded('/admin/link', payload);
        if (!result.link) throw new Error('Link was not returned from server');

        const targetId = Number(result.link.id || 0);
        let item = targetId > 0 ? $(`.link-admin-item[data-id="${targetId}"]`, list) : null;
        if (!item && id > 0) item = existing;

        if (item) {
          setLinkItem(item, result.link);
        } else {
          item = createLinkItem(result.link);
          list.appendChild(item);
        }

        syncOrderBadges();
        modal.close();
        showToast(result.message || 'Link saved');
      } catch (error) {
        showToast(error.message || 'Failed to save link', 'error');
      }
    });

    list.addEventListener('click', async event => {
      const actionBtn = event.target.closest('[data-action]');
      if (!actionBtn) return;

      const action = actionBtn.dataset.action;
      if (action === 'drag') return;

      const item = actionBtn.closest('.link-admin-item');
      if (!item) return;

      const id = Number(item.dataset.id || 0);
      if (!id) return;

      try {
        if (action === 'edit') {
          openEditModal(item);
          return;
        }

        if (action === 'utm') {
          utmBuilder?.openForLink(item);
          return;
        }

        if (action === 'toggle') {
          const nextVisible = item.dataset.visible === '1' ? 0 : 1;
          const result = await postUrlEncoded('/admin/link/toggle', {
            _csrf: csrfToken,
            id,
            is_visible: nextVisible
          });
          if (result.link) {
            setLinkItem(item, result.link);
            showToast(result.message || 'Link updated');
          }
          return;
        }

        if (action === 'delete') {
          if (!window.confirm(`Delete link "${item.dataset.title || ''}"?`)) return;
          await postUrlEncoded('/admin/link/delete', { _csrf: csrfToken, id });
          item.remove();
          syncOrderBadges();
          if ($$('.link-admin-item', list).length) await persistOrder(false);
          showToast('Link deleted');
        }
      } catch (error) {
        showToast(error.message || 'Failed to update link', 'error');
      }
    });

    list.addEventListener('pointerdown', event => {
      const handle = event.target.closest('.drag-handle');
      if (!handle) return;
      const item = handle.closest('.link-admin-item');
      dragArmedId = item?.dataset.id || null;
    });

    list.addEventListener('dragstart', event => {
      const item = event.target.closest('.link-admin-item');
      if (!item) return;
      if (!dragArmedId || dragArmedId !== item.dataset.id) {
        event.preventDefault();
        return;
      }

      item.classList.add('dragging');
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });

    list.addEventListener('dragover', event => {
      event.preventDefault();
      const dragging = $('.link-admin-item.dragging', list);
      if (!dragging) return;

      const afterElement = getDragAfterElement(list, event.clientY);
      if (!afterElement) list.appendChild(dragging);
      else list.insertBefore(dragging, afterElement);
    });

    list.addEventListener('dragend', async event => {
      const item = event.target.closest('.link-admin-item');
      if (!item) return;

      item.classList.remove('dragging');
      dragArmedId = null;

      try {
        await persistOrder();
      } catch (error) {
        showToast(error.message || 'Failed to save order', 'error');
      }
    });

    colorEl?.addEventListener('input', syncModalColor);
    colorEl?.addEventListener('change', syncModalColor);
    iconEl?.addEventListener('change', syncIconPreview);
    iconPreviewImgEl?.addEventListener('error', () => {
      if (iconPreviewImgEl) {
        iconPreviewImgEl.hidden = true;
        iconPreviewImgEl.removeAttribute('src');
      }
      if (iconPreviewFallbackEl) {
        iconPreviewFallbackEl.hidden = false;
        iconPreviewFallbackEl.textContent = '!';
      }
      if (iconPreviewLabelEl) {
        iconPreviewLabelEl.textContent = `Icon not found: ${String(iconEl?.value || '').trim()}`;
      }
    });

    $$('.color-chip', list).forEach(chip => {
      applyColorChip(chip, chip.dataset.color);
    });
    syncOrderBadges();
    syncModalColor();
    syncIconPreview();
  }

  function setupEmbedsManager(modal) {
    const list = $('#embeds-admin-list');
    const createBtn = $('#embed-create-btn');
    const form = $('#embed-modal-form');
    if (!list || !createBtn || !form) return;

    const modalTitle = $('#embed-modal-title');
    const idEl = $('#embed-modal-id');
    const titleEl = $('#embed-modal-title-input');
    const htmlEl = $('#embed-modal-html');
    const visibleEl = $('#embed-modal-visible');

    let dragArmedId = null;

    const syncOrderBadges = () => {
      $$('.link-admin-item', list).forEach((item, idx) => {
        item.dataset.order = String(idx + 1);
        const badge = $('.order-badge', item);
        if (badge) badge.textContent = `#${idx + 1}`;
      });
    };

    const setEmbedItem = (item, embed) => {
      const isVisible = asBoolean(embed.is_visible);
      item.dataset.id = String(embed.id || '');
      item.dataset.title = embed.title || '';
      item.dataset.html = encodeAttr(embed.embed_html || '');
      item.dataset.visible = isVisible ? '1' : '0';
      if (embed.order_index != null) item.dataset.order = String(embed.order_index);

      item.classList.toggle('is-hidden-link', !isVisible);

      const titleNode = $('.link-admin-title', item);
      if (titleNode) titleNode.textContent = embed.title || '';

      const toggleBtn = $('[data-action="toggle"]', item);
      if (toggleBtn) {
        toggleBtn.textContent = isVisible ? 'Hide' : 'Show';
        toggleBtn.title = isVisible ? 'Hide embed' : 'Show embed';
      }
    };

    const createEmbedItem = embed => {
      const article = document.createElement('article');
      article.className = 'link-admin-item';
      article.draggable = true;
      article.innerHTML = `
        <button type="button" class="icon-action drag-handle" data-action="drag" title="Drag to reorder" aria-label="Drag to reorder">&#8801;</button>
        <div class="link-admin-main">
          <div class="link-admin-title"></div>
          <div class="link-admin-url">Embed block</div>
        </div>
        <div class="link-admin-meta">
          <span class="order-badge">#0</span>
        </div>
        <div class="link-admin-actions">
          <button type="button" class="icon-action" data-action="edit" title="Edit embed">Edit</button>
          <button type="button" class="icon-action" data-action="toggle" title="Toggle visibility">Hide</button>
          <button type="button" class="icon-action danger" data-action="delete" title="Delete embed">Del</button>
        </div>
      `;
      setEmbedItem(article, embed);
      return article;
    };

    const openCreateModal = event => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (modalTitle) modalTitle.textContent = 'Create Embed';
      idEl.value = '';
      titleEl.value = '';
      htmlEl.value = '';
      visibleEl.checked = true;
      modal.open('embed');
      titleEl.focus();
    };

    const openEditModal = item => {
      if (modalTitle) modalTitle.textContent = 'Edit Embed';
      idEl.value = item.dataset.id || '';
      titleEl.value = item.dataset.title || '';
      htmlEl.value = decodeAttr(item.dataset.html || '');
      visibleEl.checked = item.dataset.visible !== '0';
      modal.open('embed');
      titleEl.focus();
    };

    const persistOrder = async (showSuccess = true) => {
      const ids = $$('.link-admin-item', list).map(item => Number(item.dataset.id)).filter(Number.isInteger);
      if (!ids.length) return;
      await postUrlEncoded('/admin/embed/reorder', {
        _csrf: csrfToken,
        ids
      });
      syncOrderBadges();
      if (showSuccess) showToast('Embed order saved');
    };

    createBtn.addEventListener('click', openCreateModal);

    form.addEventListener('submit', async event => {
      event.preventDefault();

      const id = Number(idEl.value || 0);
      const existing = id > 0 ? $(`.link-admin-item[data-id="${id}"]`, list) : null;
      const orderIndex = existing ? Number(existing.dataset.order || 0) || 1 : $$('.link-admin-item', list).length + 1;

      const payload = {
        _csrf: csrfToken,
        id,
        title: titleEl.value,
        embed_html: htmlEl.value,
        is_visible: visibleEl.checked ? 1 : 0,
        order_index: orderIndex
      };

      try {
        const result = await postUrlEncoded('/admin/embed', payload);
        if (!result.embed) throw new Error('Embed was not returned from server');

        const targetId = Number(result.embed.id || 0);
        let item = targetId > 0 ? $(`.link-admin-item[data-id="${targetId}"]`, list) : null;
        if (!item && id > 0) item = existing;

        if (item) {
          setEmbedItem(item, result.embed);
        } else {
          item = createEmbedItem(result.embed);
          list.appendChild(item);
        }

        syncOrderBadges();
        modal.close();
        showToast(result.message || 'Embed saved');
      } catch (error) {
        showToast(error.message || 'Failed to save embed', 'error');
      }
    });

    list.addEventListener('click', async event => {
      const actionBtn = event.target.closest('[data-action]');
      if (!actionBtn) return;

      const action = actionBtn.dataset.action;
      if (action === 'drag') return;

      const item = actionBtn.closest('.link-admin-item');
      if (!item) return;

      const id = Number(item.dataset.id || 0);
      if (!id) return;

      try {
        if (action === 'edit') {
          openEditModal(item);
          return;
        }

        if (action === 'toggle') {
          const nextVisible = item.dataset.visible === '1' ? 0 : 1;
          const result = await postUrlEncoded('/admin/embed/toggle', {
            _csrf: csrfToken,
            id,
            is_visible: nextVisible
          });
          if (result.embed) {
            setEmbedItem(item, result.embed);
            showToast(result.message || 'Embed updated');
          }
          return;
        }

        if (action === 'delete') {
          if (!window.confirm(`Delete embed "${item.dataset.title || ''}"?`)) return;
          await postUrlEncoded('/admin/embed/delete', { _csrf: csrfToken, id });
          item.remove();
          syncOrderBadges();
          if ($$('.link-admin-item', list).length) await persistOrder(false);
          showToast('Embed deleted');
        }
      } catch (error) {
        showToast(error.message || 'Failed to update embed', 'error');
      }
    });

    list.addEventListener('pointerdown', event => {
      const handle = event.target.closest('.drag-handle');
      if (!handle) return;
      const item = handle.closest('.link-admin-item');
      dragArmedId = item?.dataset.id || null;
    });

    list.addEventListener('dragstart', event => {
      const item = event.target.closest('.link-admin-item');
      if (!item) return;
      if (!dragArmedId || dragArmedId !== item.dataset.id) {
        event.preventDefault();
        return;
      }

      item.classList.add('dragging');
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });

    list.addEventListener('dragover', event => {
      event.preventDefault();
      const dragging = $('.link-admin-item.dragging', list);
      if (!dragging) return;

      const afterElement = getDragAfterElement(list, event.clientY);
      if (!afterElement) list.appendChild(dragging);
      else list.insertBefore(dragging, afterElement);
    });

    list.addEventListener('dragend', async event => {
      const item = event.target.closest('.link-admin-item');
      if (!item) return;

      item.classList.remove('dragging');
      dragArmedId = null;

      try {
        await persistOrder();
      } catch (error) {
        showToast(error.message || 'Failed to save order', 'error');
      }
    });

    syncOrderBadges();
  }

  function setupRedirectsManager(modal, utmBuilder) {
    const list = $('#redirects-admin-list');
    const createBtn = $('#redirect-create-btn');
    const form = $('#redirect-modal-form');
    if (!list || !createBtn || !form) return;

    const modalTitle = $('#redirect-modal-title');
    const idEl = $('#redirect-modal-id');
    const slugEl = $('#redirect-modal-slug');
    const urlEl = $('#redirect-modal-url');
    const activeEl = $('#redirect-modal-active');

    const setRedirectItem = (item, redirect) => {
      const isActive = asBoolean(redirect.is_active);
      item.dataset.id = String(redirect.id || '');
      item.dataset.slug = redirect.slug || '';
      item.dataset.url = redirect.target_url || '';
      item.dataset.active = isActive ? '1' : '0';

      item.classList.toggle('is-hidden-link', !isActive);

      const titleNode = $('.link-admin-title', item);
      if (titleNode) titleNode.textContent = `/${redirect.slug || ''}`;

      const urlNode = $('.link-admin-url', item);
      if (urlNode) {
        urlNode.textContent = redirect.target_url || '';
        urlNode.href = redirect.target_url || '#';
      }

      const pill = $('.link-pill', item);
      if (pill) pill.textContent = isActive ? 'Active' : 'Inactive';

      const toggleBtn = $('[data-action="toggle"]', item);
      if (toggleBtn) {
        toggleBtn.textContent = isActive ? 'Off' : 'On';
        toggleBtn.title = isActive ? 'Disable redirect' : 'Enable redirect';
      }
    };

    const createRedirectItem = redirect => {
      const article = document.createElement('article');
      article.className = 'link-admin-item';
      article.innerHTML = `
        <button type="button" class="icon-action" title="Slug" aria-label="Slug">/</button>
        <div class="link-admin-main">
          <div class="link-admin-title"></div>
          <a class="link-admin-url" target="_blank" rel="noopener noreferrer"></a>
        </div>
        <div class="link-admin-meta">
          <span class="link-pill"></span>
        </div>
        <div class="link-admin-actions">
          <button type="button" class="icon-action" data-action="edit" title="Edit redirect">Edit</button>
          <button type="button" class="icon-action" data-action="utm" title="Build tracked URL">Track</button>
          <button type="button" class="icon-action" data-action="toggle" title="Toggle active">Off</button>
          <button type="button" class="icon-action danger" data-action="delete" title="Delete redirect">Del</button>
        </div>
      `;
      setRedirectItem(article, redirect);
      return article;
    };

    const sortBySlug = () => {
      const items = $$('.link-admin-item', list);
      items.sort((a, b) => {
        const aSlug = String(a.dataset.slug || '').toLowerCase();
        const bSlug = String(b.dataset.slug || '').toLowerCase();
        return aSlug.localeCompare(bSlug);
      });
      items.forEach(item => list.appendChild(item));
    };

    const openCreateModal = event => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (modalTitle) modalTitle.textContent = 'Create Redirect';
      idEl.value = '';
      slugEl.value = '';
      urlEl.value = '';
      activeEl.checked = true;
      modal.open('redirect');
      slugEl.focus();
    };

    const openEditModal = item => {
      if (modalTitle) modalTitle.textContent = 'Edit Redirect';
      idEl.value = item.dataset.id || '';
      slugEl.value = item.dataset.slug || '';
      urlEl.value = item.dataset.url || '';
      activeEl.checked = item.dataset.active !== '0';
      modal.open('redirect');
      slugEl.focus();
    };

    createBtn.addEventListener('click', openCreateModal);

    form.addEventListener('submit', async event => {
      event.preventDefault();

      const id = Number(idEl.value || 0);
      const payload = {
        _csrf: csrfToken,
        id,
        slug: slugEl.value,
        target_url: urlEl.value,
        is_active: activeEl.checked ? 1 : 0
      };

      try {
        const result = await postUrlEncoded('/admin/redirect', payload);
        if (!result.redirect) throw new Error('Redirect was not returned from server');

        const targetId = Number(result.redirect.id || 0);
        let item = targetId > 0 ? $(`.link-admin-item[data-id="${targetId}"]`, list) : null;
        if (!item) {
          const slugMatch = String(result.redirect.slug || '').toLowerCase();
          item = $$('.link-admin-item', list).find(node => String(node.dataset.slug || '').toLowerCase() === slugMatch) || null;
        }

        if (item) {
          setRedirectItem(item, result.redirect);
        } else {
          item = createRedirectItem(result.redirect);
          list.appendChild(item);
        }

        sortBySlug();
        modal.close();
        showToast(result.message || 'Redirect saved');
      } catch (error) {
        showToast(error.message || 'Failed to save redirect', 'error');
      }
    });

    list.addEventListener('click', async event => {
      const actionBtn = event.target.closest('[data-action]');
      if (!actionBtn) return;

      const item = actionBtn.closest('.link-admin-item');
      if (!item) return;

      const id = Number(item.dataset.id || 0);
      if (!id) return;

      const action = actionBtn.dataset.action;

      try {
        if (action === 'edit') {
          openEditModal(item);
          return;
        }

        if (action === 'utm') {
          utmBuilder?.openForRedirect(item);
          return;
        }

        if (action === 'toggle') {
          const nextActive = item.dataset.active === '1' ? 0 : 1;
          const result = await postUrlEncoded('/admin/redirect/toggle', {
            _csrf: csrfToken,
            id,
            is_active: nextActive
          });
          if (result.redirect) {
            setRedirectItem(item, result.redirect);
            sortBySlug();
            showToast(result.message || 'Redirect updated');
          }
          return;
        }

        if (action === 'delete') {
          if (!window.confirm(`Delete redirect /${item.dataset.slug || ''}?`)) return;
          await postUrlEncoded('/admin/redirect/delete', { _csrf: csrfToken, id });
          item.remove();
          showToast('Redirect deleted');
        }
      } catch (error) {
        showToast(error.message || 'Failed to update redirect', 'error');
      }
    });

    sortBySlug();
  }

  function setupSummaryButtons() {
    $$('.create-new-btn').forEach(btn => {
      btn.addEventListener('click', event => {
        event.stopPropagation();
      });
      btn.addEventListener('keydown', event => {
        event.stopPropagation();
      });
    });
  }

  const modal = createModalController();
  const utmBuilder = setupUtmBuilder(modal);
  setupSummaryButtons();
  setupSettingsTabs();
  setupThemeColorPreview();
  setupSettingsSave();
  setupLivePreview();
  setupLinksManager(modal, utmBuilder);
  setupEmbedsManager(modal);
  setupRedirectsManager(modal, utmBuilder);
});
