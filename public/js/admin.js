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
      block: $('#block-modal', overlay || document),
      redirect: $('#redirect-modal', overlay || document),
      qr: $('#qr-modal', overlay || document),
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

  function setupBuilderPreview() {
    const previewRoot = $('#builder-live-preview');
    const contentEl = $('#builder-preview-content');
    const handleEl = $('#builder-preview-handle');
    const nameEl = $('#builder-preview-name');
    const linksList = $('#links-admin-list');
    const blocksList = $('#blocks-admin-list');
    const settingsForm = $('#settings-form');
    if (!previewRoot || !contentEl || !linksList || !blocksList) {
      return { refresh: () => {} };
    }

    const handleInput = $('[name="handle"]', settingsForm || document);
    const displayNameInput = $('[name="display_name"]', settingsForm || document);
    const themeColorInput = $('[name="theme_color"]', settingsForm || document);
    const layoutInput = $('[name="link_layout"]', settingsForm || document);
    const buttonStyleInput = $('[name="button_style"]', settingsForm || document);

    const parseBlockJson = raw => {
      if (!raw) return {};
      try {
        const parsed = JSON.parse(decodeAttr(raw));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    };

    const stripHtml = raw =>
      String(raw || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const getVisibleLinks = () =>
      $$('.link-admin-item', linksList)
        .filter(item => item.dataset.visible === '1')
        .map(item => ({
          title: item.dataset.title || 'Link',
          url: item.dataset.url || '#',
          color: normalizeHex(item.dataset.color, '#2a2a2a')
        }));

    const makeBlock = label => {
      const block = document.createElement('article');
      block.className = 'builder-preview-block';

      const heading = document.createElement('strong');
      heading.textContent = label;
      block.appendChild(heading);
      return block;
    };

    const renderLinksCluster = links => {
      const block = makeBlock('Links Cluster');
      const wrap = document.createElement('div');
      const layout = String(layoutInput?.value || 'list').trim();
      const buttonStyle = String(buttonStyleInput?.value || 'rounded').trim();
      wrap.className = `builder-preview-links-wrap builder-layout-${layout}`;

      if (!links.length) {
        const empty = document.createElement('div');
        empty.className = 'builder-preview-empty';
        empty.textContent = 'No visible links yet.';
        block.appendChild(empty);
        return block;
      }

      links.forEach(link => {
        const anchor = document.createElement('a');
        anchor.className = `builder-preview-link builder-button-${buttonStyle}`;
        anchor.href = link.url || '#';
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.style.backgroundColor = link.color;
        anchor.title = link.url;

        if (layout === 'table') {
          const label = document.createElement('span');
          label.textContent = link.title;
          const arrow = document.createElement('span');
          arrow.textContent = '↗';
          anchor.appendChild(label);
          anchor.appendChild(arrow);
        } else {
          anchor.textContent = link.title;
        }

        wrap.appendChild(anchor);
      });

      block.appendChild(wrap);
      return block;
    };

    const render = () => {
      const handle = String(handleInput?.value || '').trim();
      const displayName = String(displayNameInput?.value || '').trim();
      if (handleEl) handleEl.textContent = handle ? (handle.startsWith('@') ? handle : `@${handle}`) : '@handle';
      if (nameEl) nameEl.textContent = displayName || 'Display Name';
      previewRoot.style.setProperty('--preview-accent', normalizeHex(themeColorInput?.value, '#8ab4ff'));

      const links = getVisibleLinks();
      const visibleBlocks = $$('.link-admin-item', blocksList).filter(item => item.dataset.visible === '1');

      contentEl.innerHTML = '';
      if (!visibleBlocks.length) {
        contentEl.appendChild(renderLinksCluster(links));
        return;
      }

      let hasLinksCluster = false;
      visibleBlocks.forEach(item => {
        const type = String(item.dataset.type || '');
        const data = parseBlockJson(item.dataset.json || '');

        if (type === 'links_cluster') {
          hasLinksCluster = true;
          contentEl.appendChild(renderLinksCluster(links));
          return;
        }

        if (type === 'heading') {
          const block = makeBlock('Heading');
          block.append(String(data.text || 'Heading text'));
          contentEl.appendChild(block);
          return;
        }

        if (type === 'rich_text') {
          const block = makeBlock('Rich Text');
          block.append(stripHtml(data.html || '') || 'Rich text content');
          contentEl.appendChild(block);
          return;
        }

        if (type === 'button_link') {
          const block = makeBlock('Button Link');
          const button = document.createElement('a');
          button.className = 'builder-preview-link builder-button-solid';
          button.href = String(data.url || '#');
          button.target = data.new_tab === 0 ? '_self' : '_blank';
          button.rel = 'noopener noreferrer';
          button.textContent = String(data.label || 'Button label');
          block.appendChild(button);
          contentEl.appendChild(block);
          return;
        }

        if (type === 'image') {
          const block = makeBlock('Image');
          block.append(String(data.caption || data.alt || data.src || 'Image block'));
          contentEl.appendChild(block);
          return;
        }

        if (type === 'embed') {
          const block = makeBlock('Embed');
          block.append(String(data.title || 'Embed block'));
          contentEl.appendChild(block);
          return;
        }

        const block = makeBlock('Block');
        block.append(String(type || 'Unknown block'));
        contentEl.appendChild(block);
      });

      if (links.length && !hasLinksCluster) {
        const info = document.createElement('div');
        info.className = 'builder-preview-empty';
        info.textContent = 'Links are not currently placed. Add a Links Cluster block to show them on-page.';
        contentEl.appendChild(info);
      }
    };

    const observerConfig = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-visible', 'data-title', 'data-url', 'data-color', 'data-type', 'data-json', 'data-order']
    };

    const linksObserver = new MutationObserver(() => render());
    const blocksObserver = new MutationObserver(() => render());
    linksObserver.observe(linksList, observerConfig);
    blocksObserver.observe(blocksList, observerConfig);

    settingsForm?.addEventListener('input', render);
    settingsForm?.addEventListener('change', render);

    render();
    return { refresh: render };
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

  function setupQrBuilder(modal) {
    const form = $('#qr-modal-form');
    const modalTitle = $('#qr-modal-title');
    const targetUrlEl = $('#qr-target-url');
    const qrImageEl = $('#qr-image');
    const statusEl = $('#qr-status');
    const copyUrlBtn = $('#qr-copy-url-btn');
    const downloadBtn = $('#qr-download-btn');
    const profileBtn = $('#profile-qr-btn');
    const settingsForm = $('#settings-form');
    const siteUrlInput = $('[name="site_url"]', settingsForm || document);

    if (!form || !targetUrlEl || !qrImageEl || !copyUrlBtn || !downloadBtn) {
      return {
        openForProfile: () => {},
        openForLink: () => {},
        openForRedirect: () => {},
        openForBlock: () => {}
      };
    }

    const toHttpUrl = raw => {
      const value = String(raw || '').trim();
      if (!value) return '';
      try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        return parsed.toString();
      } catch {
        return '';
      }
    };

    const slugifyFilename = raw => {
      const value = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      return value || 'linkhub-qr';
    };

    const profileUrl = () => {
      const configured = toHttpUrl(siteUrlInput?.value || '');
      if (configured) return configured;
      return `${window.location.origin}/`;
    };

    const qrImageUrl = (target, name, download = false) =>
      `/admin/qr/image?target=${encodeURIComponent(target)}&size=512&name=${encodeURIComponent(name)}${download ? '&download=1' : ''}`;

    const setStatus = (message, type = '') => {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.remove('text-success', 'text-danger');
      if (type === 'success') statusEl.classList.add('text-success');
      if (type === 'error') statusEl.classList.add('text-danger');
    };

    let currentTarget = '';

    const openQr = ({ label, target, filename }) => {
      const normalized = toHttpUrl(target);
      if (!normalized) {
        showToast('Unable to generate QR for this item', 'error');
        return;
      }

      const safeFilename = slugifyFilename(filename || label || 'linkhub-qr');
      currentTarget = normalized;
      targetUrlEl.value = normalized;
      if (modalTitle) modalTitle.textContent = `QR Code: ${label || 'Target URL'}`;
      downloadBtn.href = qrImageUrl(normalized, safeFilename, true);
      qrImageEl.src = qrImageUrl(normalized, safeFilename, false);
      qrImageEl.hidden = false;
      qrImageEl.alt = `QR code for ${label || 'target URL'}`;
      setStatus('Generating QR preview...');
      modal.open('qr');
    };

    qrImageEl.addEventListener('load', () => {
      setStatus('QR preview ready. Download or share as needed.', 'success');
    });
    qrImageEl.addEventListener('error', () => {
      setStatus('Failed to generate QR preview.', 'error');
    });

    copyUrlBtn.addEventListener('click', async () => {
      if (!currentTarget) {
        setStatus('No target URL to copy.', 'error');
        return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(currentTarget);
        } else {
          targetUrlEl.focus();
          targetUrlEl.select();
          document.execCommand('copy');
        }
        setStatus('Target URL copied to clipboard.', 'success');
      } catch {
        setStatus('Copy failed. You can still copy manually from the URL field.', 'error');
      }
    });

    const openForProfile = () =>
      openQr({
        label: 'Profile Page',
        target: profileUrl(),
        filename: 'profile-page'
      });

    profileBtn?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openForProfile();
    });

    return {
      openForProfile,
      openForLink(item) {
        const id = Number(item?.dataset?.id || 0);
        if (!id) return;
        const title = String(item?.dataset?.title || `link-${id}`).trim();
        openQr({
          label: title || `Link #${id}`,
          target: `${window.location.origin}/out/${id}`,
          filename: `link-${id}-${title}`
        });
      },
      openForRedirect(item) {
        const slug = String(item?.dataset?.slug || '').trim().replace(/^\/+/, '');
        if (!slug) return;
        openQr({
          label: `/${slug}`,
          target: `${window.location.origin}/${encodeURIComponent(slug)}`,
          filename: `redirect-${slug}`
        });
      },
      openForBlock(item) {
        const type = String(item?.dataset?.type || '').trim();
        const data = (() => {
          try {
            return JSON.parse(decodeAttr(item?.dataset?.json || '')) || {};
          } catch {
            return {};
          }
        })();

        let target = '';
        if (type === 'button_link') {
          target = toHttpUrl(data.url);
        } else if (type === 'image') {
          target = toHttpUrl(data.src);
        } else if (type === 'embed') {
          const html = String(data.embed_html || '');
          const srcMatch = html.match(/\bsrc=(["'])(https?:\/\/[^"']+)\1/i);
          target = toHttpUrl(srcMatch?.[2] || '');
        } else if (type === 'links_cluster') {
          target = profileUrl();
        }

        if (!target) {
          showToast('This block type does not have a direct URL for QR.', 'error');
          return;
        }

        const id = Number(item?.dataset?.id || 0);
        openQr({
          label: `Block: ${type.replace(/_/g, ' ')}`,
          target,
          filename: `block-${id || 'item'}-${type}`
        });
      }
    };
  }

  function setupLinksManager(modal, utmBuilder, qrBuilder) {
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
    const enrichBtn = $('#link-modal-enrich-btn');
    const enrichStatusEl = $('#link-modal-enrich-status');
    const enrichPreviewEl = $('#link-modal-enrich-preview');
    const enrichImageEl = $('#link-modal-enrich-image');
    const enrichImageFallbackEl = $('#link-modal-enrich-image-fallback');
    const enrichTitleEl = $('#link-modal-enrich-title');
    const enrichHostEl = $('#link-modal-enrich-host');

    let dragArmedId = null;
    let enrichTimer = 0;
    let enrichNonce = 0;

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

    const setEnrichStatus = (message, type = '') => {
      if (!enrichStatusEl) return;
      enrichStatusEl.textContent = message;
      enrichStatusEl.classList.remove('text-success', 'text-danger');
      if (type === 'success') enrichStatusEl.classList.add('text-success');
      if (type === 'error') enrichStatusEl.classList.add('text-danger');
    };

    const resetEnrichPreview = () => {
      if (enrichPreviewEl) enrichPreviewEl.hidden = true;
      if (enrichImageEl) {
        enrichImageEl.hidden = true;
        enrichImageEl.removeAttribute('src');
      }
      if (enrichImageFallbackEl) {
        enrichImageFallbackEl.hidden = false;
        enrichImageFallbackEl.textContent = 'No image';
      }
      if (enrichTitleEl) enrichTitleEl.textContent = 'Paste a URL to suggest title, icon, and preview.';
      if (enrichHostEl) enrichHostEl.textContent = '';
      setEnrichStatus('Paste a URL, then click Suggest to auto-fill details.');
    };

    const normalizeSuggestedUrl = raw => {
      const value = String(raw || '').trim();
      if (!value) return '';
      if (/^https?:\/\//i.test(value)) return value;
      if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(value)) return `https://${value}`;
      return value;
    };

    const applyEnrichment = (enrichment, { force = false } = {}) => {
      const titleSuggestion = String(enrichment?.title || '').trim();
      const iconSuggestion = String(enrichment?.icon_key || '').trim();
      const previewImage = String(enrichment?.preview_image_url || '').trim();
      const finalUrl = String(enrichment?.final_url || '').trim();

      if (force || !String(titleEl.value || '').trim()) {
        if (titleSuggestion) titleEl.value = titleSuggestion;
      }

      if (iconSuggestion && (force || !String(iconEl.value || '').trim())) {
        ensureIconOption(iconSuggestion);
        iconEl.value = iconSuggestion;
        syncIconPreview();
      }

      if (enrichPreviewEl) enrichPreviewEl.hidden = false;
      if (enrichTitleEl) enrichTitleEl.textContent = titleSuggestion || 'No title detected';
      if (enrichHostEl) enrichHostEl.textContent = finalUrl || '';
      if (enrichImageEl) {
        if (previewImage) {
          enrichImageEl.hidden = false;
          enrichImageEl.src = previewImage;
          enrichImageEl.alt = titleSuggestion ? `${titleSuggestion} preview` : 'Link preview image';
          if (enrichImageFallbackEl) enrichImageFallbackEl.hidden = true;
        } else {
          enrichImageEl.hidden = true;
          enrichImageEl.removeAttribute('src');
          if (enrichImageFallbackEl) {
            enrichImageFallbackEl.hidden = false;
            enrichImageFallbackEl.textContent = 'No image';
          }
        }
      }
    };

    const runEnrichment = async ({ force = false } = {}) => {
      const raw = String(urlEl?.value || '').trim();
      if (!raw) {
        if (force) setEnrichStatus('Enter a URL first.', 'error');
        return;
      }

      const normalized = normalizeSuggestedUrl(raw);
      if (normalized !== raw) urlEl.value = normalized;
      if (!/^https?:\/\//i.test(normalized)) {
        if (force) setEnrichStatus('Use a valid http(s) URL.', 'error');
        return;
      }

      const nonce = ++enrichNonce;
      if (enrichBtn) {
        enrichBtn.disabled = true;
        enrichBtn.textContent = 'Loading...';
      }
      setEnrichStatus('Fetching metadata...');

      try {
        const result = await postUrlEncoded('/admin/link/enrich', {
          _csrf: csrfToken,
          url: normalized
        });

        if (nonce !== enrichNonce) return;
        const enrichment = result?.enrichment || {};
        applyEnrichment(enrichment, { force });
        setEnrichStatus(result?.message || 'Suggestion loaded', 'success');
      } catch (error) {
        if (nonce !== enrichNonce) return;
        setEnrichStatus(error.message || 'Unable to enrich this URL', 'error');
      } finally {
        if (nonce === enrichNonce && enrichBtn) {
          enrichBtn.disabled = false;
          enrichBtn.textContent = 'Suggest';
        }
      }
    };

    const scheduleEnrichment = () => {
      window.clearTimeout(enrichTimer);
      enrichTimer = window.setTimeout(() => {
        void runEnrichment({ force: false });
      }, 500);
    };

    const syncOrderBadges = () => {
      $$('.link-admin-item', list).forEach((item, idx) => {
        item.dataset.order = String(idx + 1);
        const badge = $('.order-badge', item);
        if (badge) badge.textContent = `#${idx + 1}`;
      });
    };

    let activeInlineState = null;

    const readLinkFromDataset = item => ({
      id: Number(item.dataset.id || 0),
      title: item.dataset.title || '',
      url: item.dataset.url || '',
      icon_key: item.dataset.icon || '',
      color_hex: normalizeHex(item.dataset.color, '#2a2a2a'),
      is_visible: item.dataset.visible === '1',
      order_index: Number(item.dataset.order || 0) || 1
    });

    const buildSavePayload = (item, overrides = {}) => {
      const current = readLinkFromDataset(item);
      return {
        _csrf: csrfToken,
        id: current.id,
        title: overrides.title ?? current.title,
        url: overrides.url ?? current.url,
        icon_key: overrides.icon_key ?? current.icon_key,
        color_hex: normalizeHex(overrides.color_hex ?? current.color_hex, '#2a2a2a'),
        is_visible: overrides.is_visible == null ? (current.is_visible ? 1 : 0) : asBoolean(overrides.is_visible) ? 1 : 0,
        order_index: Number(overrides.order_index || current.order_index || 1)
      };
    };

    const cancelInlineEdit = () => {
      if (!activeInlineState) return;
      const { item } = activeInlineState;
      setLinkItem(item, readLinkFromDataset(item));
      activeInlineState = null;
    };

    const startInlineEdit = (item, target, field) => {
      if (!item || !target) return;
      if (field !== 'title' && field !== 'url') return;

      cancelInlineEdit();
      const initialValue = field === 'title' ? item.dataset.title || '' : item.dataset.url || '';

      target.classList.add('inline-edit-active');
      target.innerHTML = '';

      const shell = document.createElement('div');
      shell.className = 'inline-edit-shell';

      const input = document.createElement('input');
      input.type = field === 'url' ? 'url' : 'text';
      input.value = initialValue;
      input.required = true;
      if (field === 'url') input.placeholder = 'https://...';
      shell.appendChild(input);

      const actions = document.createElement('div');
      actions.className = 'inline-edit-actions';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'inline-edit-btn save';
      saveBtn.textContent = 'Save';
      actions.appendChild(saveBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'inline-edit-btn cancel';
      cancelBtn.textContent = 'Cancel';
      actions.appendChild(cancelBtn);

      shell.appendChild(actions);
      target.appendChild(shell);

      const closeEditor = () => {
        if (!activeInlineState) return;
        const state = activeInlineState;
        activeInlineState = null;
        state.target.classList.remove('inline-edit-active');
      };

      const save = async () => {
        const nextValue = String(input.value || '').trim();
        if (!nextValue) {
          showToast('Value cannot be empty', 'error');
          input.focus();
          return;
        }

        const payload = buildSavePayload(item, { [field]: nextValue });
        try {
          saveBtn.disabled = true;
          const result = await postUrlEncoded('/admin/link', payload);
          if (!result.link) throw new Error('Link was not returned from server');
          closeEditor();
          setLinkItem(item, result.link);
          showToast('Link updated');
        } catch (error) {
          showToast(error.message || 'Failed to save inline edit', 'error');
          saveBtn.disabled = false;
          input.focus();
        }
      };

      const cancel = () => {
        closeEditor();
        setLinkItem(item, readLinkFromDataset(item));
      };

      saveBtn.addEventListener('click', () => {
        void save();
      });
      cancelBtn.addEventListener('click', cancel);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void save();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      });

      activeInlineState = { item, target };
      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
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
      if (titleNode) {
        titleNode.textContent = link.title || '';
        titleNode.classList.add('inline-editable', 'is-editable');
        titleNode.dataset.inlineField = 'title';
        titleNode.title = 'Click to edit title';
      }

      const urlNode = $('.link-admin-url', item);
      if (urlNode) {
        urlNode.textContent = link.url || '';
        urlNode.href = link.url || '#';
        urlNode.classList.add('inline-editable', 'is-editable');
        urlNode.dataset.inlineField = 'url';
        urlNode.title = 'Click to edit URL (Ctrl/Cmd+click to open)';
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
          <div class="link-admin-title inline-editable is-editable" data-inline-field="title" tabindex="0" title="Click to edit title"></div>
          <a class="link-admin-url inline-editable is-editable" data-inline-field="url" target="_blank" rel="noopener noreferrer" title="Click to edit URL (Ctrl/Cmd+click to open)"></a>
        </div>
        <div class="link-admin-meta">
          <span class="order-badge">#0</span>
          <span class="link-pill" hidden></span>
          <span class="color-chip" data-color="#2a2a2a" title="#2a2a2a"></span>
        </div>
        <div class="link-admin-actions">
          <button type="button" class="icon-action" data-action="edit" title="Edit link">Edit</button>
          <button type="button" class="icon-action" data-action="utm" title="Build tracked URL">Track</button>
          <button type="button" class="icon-action" data-action="qr" title="Show QR code">QR</button>
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
      cancelInlineEdit();

      if (modalTitle) modalTitle.textContent = 'Create Link';
      idEl.value = '';
      titleEl.value = '';
      urlEl.value = '';
      iconEl.value = '';
      colorEl.value = '#2a2a2a';
      visibleEl.checked = true;
      syncModalColor();
      syncIconPreview();
      resetEnrichPreview();
      modal.open('link');
      titleEl.focus();
    };

    const openEditModal = item => {
      cancelInlineEdit();
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
      resetEnrichPreview();
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
      cancelInlineEdit();

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

        if (action === 'qr') {
          qrBuilder?.openForLink(item);
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

    list.addEventListener('click', event => {
      const editable = event.target.closest('.inline-editable.is-editable');
      if (!editable || !list.contains(editable)) return;
      if (event.target.closest('.inline-edit-shell')) return;

      if (editable.matches('a') && (event.ctrlKey || event.metaKey)) return;
      event.preventDefault();

      const item = editable.closest('.link-admin-item');
      if (!item) return;

      const field = editable.dataset.inlineField || '';
      startInlineEdit(item, editable, field);
    });

    list.addEventListener('keydown', event => {
      const editable = event.target.closest('.inline-editable.is-editable');
      if (!editable || !list.contains(editable)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (editable.classList.contains('inline-edit-active')) return;
      event.preventDefault();

      const item = editable.closest('.link-admin-item');
      if (!item) return;
      const field = editable.dataset.inlineField || '';
      startInlineEdit(item, editable, field);
    });

    list.addEventListener('pointerdown', event => {
      const handle = event.target.closest('.drag-handle');
      if (!handle) return;
      cancelInlineEdit();
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
    enrichBtn?.addEventListener('click', event => {
      event.preventDefault();
      void runEnrichment({ force: true });
    });
    urlEl?.addEventListener('paste', event => {
      const pasted = event.clipboardData?.getData('text') || '';
      if (pasted) {
        const normalized = normalizeSuggestedUrl(pasted);
        if (normalized !== pasted) {
          event.preventDefault();
          urlEl.value = normalized;
        }
      }
      scheduleEnrichment();
    });
    urlEl?.addEventListener('input', () => {
      scheduleEnrichment();
    });
    urlEl?.addEventListener('blur', () => {
      window.clearTimeout(enrichTimer);
      void runEnrichment({ force: false });
    });
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
    enrichImageEl?.addEventListener('error', () => {
      if (enrichImageEl) {
        enrichImageEl.hidden = true;
        enrichImageEl.removeAttribute('src');
      }
      if (enrichImageFallbackEl) {
        enrichImageFallbackEl.hidden = false;
        enrichImageFallbackEl.textContent = 'Image failed to load';
      }
    });

    $$('.color-chip', list).forEach(chip => {
      applyColorChip(chip, chip.dataset.color);
    });
    syncOrderBadges();
    syncModalColor();
    syncIconPreview();
    resetEnrichPreview();
  }

  function setupBlocksManager(modal, qrBuilder) {
    const list = $('#blocks-admin-list');
    const createBtn = $('#block-create-btn');
    const form = $('#block-modal-form');
    if (!list || !createBtn || !form) return;

    const modalTitle = $('#block-modal-title');
    const idEl = $('#block-modal-id');
    const typeEl = $('#block-modal-type');
    const visibleEl = $('#block-modal-visible');

    const headingTextEl = $('#block-heading-text');
    const headingLevelEl = $('#block-heading-level');
    const richHtmlEl = $('#block-rich-html');
    const buttonLabelEl = $('#block-button-label');
    const buttonUrlEl = $('#block-button-url');
    const buttonStyleEl = $('#block-button-style');
    const buttonNewTabEl = $('#block-button-new-tab');
    const imageSrcEl = $('#block-image-src');
    const imageAltEl = $('#block-image-alt');
    const imageCaptionEl = $('#block-image-caption');
    const embedTitleEl = $('#block-embed-title');
    const embedHtmlEl = $('#block-embed-html');

    const typeGroups = $$('.block-type-group', form);
    let dragArmedId = null;

    const toDisplayType = type => String(type || '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());

    const parseBlockJson = raw => {
      if (!raw) return {};
      try {
        const parsed = JSON.parse(decodeAttr(raw));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    };

    const blockSummary = (type, data) => {
      if (type === 'heading') return `${String(data.level || 'h2').toUpperCase()}: ${String(data.text || '')}`.trim();
      if (type === 'rich_text') return String(data.html || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 120) || 'Rich text';
      if (type === 'links_cluster') return 'Renders all links from Links section';
      if (type === 'button_link') return `${String(data.label || '').trim()} -> ${String(data.url || '').trim()}`.trim();
      if (type === 'image') return String(data.caption || data.alt || data.src || 'Image block').trim();
      if (type === 'embed') return String(data.title || 'Embed block').trim();
      return 'Block';
    };

    const supportsQrForBlockType = type => ['links_cluster', 'button_link', 'image', 'embed'].includes(String(type || ''));

    const inlineConfigForBlock = (type, data) => {
      if (type === 'heading') {
        return {
          titleText: String(data.text || '').trim() || 'Heading text',
          summaryText: `${String(data.level || 'h2').toUpperCase()} heading`,
          titleField: 'heading_text',
          summaryField: ''
        };
      }
      if (type === 'button_link') {
        return {
          titleText: String(data.label || '').trim() || 'Button label',
          summaryText: String(data.url || '').trim() || 'URL not set',
          titleField: 'button_label',
          summaryField: 'button_url'
        };
      }
      if (type === 'image') {
        return {
          titleText: String(data.caption || data.alt || '').trim() || 'Image block',
          summaryText: String(data.src || '').trim() || 'Image URL not set',
          titleField: 'image_caption',
          summaryField: 'image_src'
        };
      }
      if (type === 'embed') {
        return {
          titleText: String(data.title || '').trim() || 'Embed block',
          summaryText: 'Embed block',
          titleField: 'embed_title',
          summaryField: ''
        };
      }
      if (type === 'rich_text') {
        return {
          titleText: 'Rich text',
          summaryText: blockSummary(type, data),
          titleField: '',
          summaryField: ''
        };
      }
      if (type === 'links_cluster') {
        return {
          titleText: 'Links Cluster',
          summaryText: blockSummary(type, data),
          titleField: '',
          summaryField: ''
        };
      }
      return {
        titleText: toDisplayType(type),
        summaryText: blockSummary(type, data),
        titleField: '',
        summaryField: ''
      };
    };

    const setTypeVisibility = selectedType => {
      typeGroups.forEach(group => {
        const isVisible = group.dataset.blockType === selectedType;
        group.hidden = !isVisible;
        $$('input, textarea, select', group).forEach(control => {
          control.disabled = !isVisible;
        });
      });
    };

    const resetModalFields = () => {
      idEl.value = '';
      typeEl.value = 'heading';
      visibleEl.checked = true;

      if (headingTextEl) headingTextEl.value = '';
      if (headingLevelEl) headingLevelEl.value = 'h2';
      if (richHtmlEl) richHtmlEl.value = '';
      if (buttonLabelEl) buttonLabelEl.value = '';
      if (buttonUrlEl) buttonUrlEl.value = '';
      if (buttonStyleEl) buttonStyleEl.value = 'solid';
      if (buttonNewTabEl) buttonNewTabEl.checked = true;
      if (imageSrcEl) imageSrcEl.value = '';
      if (imageAltEl) imageAltEl.value = '';
      if (imageCaptionEl) imageCaptionEl.value = '';
      if (embedTitleEl) embedTitleEl.value = '';
      if (embedHtmlEl) embedHtmlEl.value = '';

      setTypeVisibility('heading');
    };

    const syncOrderBadges = () => {
      $$('.link-admin-item', list).forEach((item, idx) => {
        item.dataset.order = String(idx + 1);
        const badge = $('.order-badge', item);
        if (badge) badge.textContent = `#${idx + 1}`;
      });
    };

    let activeInlineState = null;

    const blockFromDataset = item => {
      const type = item.dataset.type || '';
      const dataObj = parseBlockJson(item.dataset.json || '');
      return {
        id: Number(item.dataset.id || 0),
        type,
        data_obj: dataObj,
        order_index: Number(item.dataset.order || 0) || 1,
        is_visible: item.dataset.visible === '1',
        summary: blockSummary(type, dataObj)
      };
    };

    const buildSavePayload = (item, overrides = {}) => {
      const block = blockFromDataset(item);
      const data = block.data_obj || {};
      return {
        _csrf: csrfToken,
        id: block.id,
        page_id: 1,
        type: block.type,
        is_visible: block.is_visible ? 1 : 0,
        order_index: block.order_index,
        heading_text: overrides.heading_text ?? data.text ?? '',
        heading_level: overrides.heading_level ?? data.level ?? 'h2',
        rich_html: overrides.rich_html ?? data.html ?? '',
        button_label: overrides.button_label ?? data.label ?? '',
        button_url: overrides.button_url ?? data.url ?? '',
        button_style: overrides.button_style ?? data.style ?? 'solid',
        button_new_tab: overrides.button_new_tab == null ? (data.new_tab === 0 ? 0 : 1) : asBoolean(overrides.button_new_tab) ? 1 : 0,
        image_src: overrides.image_src ?? data.src ?? '',
        image_alt: overrides.image_alt ?? data.alt ?? '',
        image_caption: overrides.image_caption ?? data.caption ?? '',
        embed_title: overrides.embed_title ?? data.title ?? '',
        embed_html: overrides.embed_html ?? data.embed_html ?? ''
      };
    };

    const cancelInlineEdit = () => {
      if (!activeInlineState) return;
      const { item } = activeInlineState;
      setBlockItem(item, blockFromDataset(item));
      activeInlineState = null;
    };

    const startInlineEdit = (item, target, field) => {
      if (!field) return;
      cancelInlineEdit();

      const currentData = parseBlockJson(item.dataset.json || '');
      const initialValue =
        field === 'heading_text' ? String(currentData.text || '') :
        field === 'button_label' ? String(currentData.label || '') :
        field === 'button_url' ? String(currentData.url || '') :
        field === 'image_caption' ? String(currentData.caption || '') :
        field === 'image_src' ? String(currentData.src || '') :
        field === 'embed_title' ? String(currentData.title || '') :
        '';

      target.classList.add('inline-edit-active');
      target.innerHTML = '';

      const shell = document.createElement('div');
      shell.className = 'inline-edit-shell';

      const input = document.createElement('input');
      input.type = field.includes('url') || field === 'image_src' ? 'url' : 'text';
      input.value = initialValue;
      input.required = true;
      if (input.type === 'url') input.placeholder = 'https://...';
      shell.appendChild(input);

      const actions = document.createElement('div');
      actions.className = 'inline-edit-actions';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'inline-edit-btn save';
      saveBtn.textContent = 'Save';
      actions.appendChild(saveBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'inline-edit-btn cancel';
      cancelBtn.textContent = 'Cancel';
      actions.appendChild(cancelBtn);

      shell.appendChild(actions);
      target.appendChild(shell);

      const closeEditor = () => {
        if (!activeInlineState) return;
        const state = activeInlineState;
        activeInlineState = null;
        state.target.classList.remove('inline-edit-active');
      };

      const save = async () => {
        const nextValue = String(input.value || '').trim();
        if (!nextValue) {
          showToast('Value cannot be empty', 'error');
          input.focus();
          return;
        }

        const payload = buildSavePayload(item, { [field]: nextValue });
        try {
          saveBtn.disabled = true;
          const result = await postUrlEncoded('/admin/block', payload);
          if (!result.block) throw new Error('Block was not returned from server');
          closeEditor();
          setBlockItem(item, result.block);
          showToast('Block updated');
        } catch (error) {
          showToast(error.message || 'Failed to save inline edit', 'error');
          saveBtn.disabled = false;
          input.focus();
        }
      };

      const cancel = () => {
        closeEditor();
        setBlockItem(item, blockFromDataset(item));
      };

      saveBtn.addEventListener('click', () => {
        void save();
      });
      cancelBtn.addEventListener('click', cancel);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void save();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      });

      activeInlineState = { item, target };
      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    };

    const setBlockItem = (item, block) => {
      const type = String(block.type || '');
      const data = block.data_obj && typeof block.data_obj === 'object' ? block.data_obj : parseBlockJson(block.data || '');
      const inlineConfig = inlineConfigForBlock(type, data);
      const isVisible = asBoolean(block.is_visible);
      item.dataset.id = String(block.id || '');
      item.dataset.type = type;
      item.dataset.visible = isVisible ? '1' : '0';
      item.dataset.order = String(block.order_index || 0);
      item.dataset.json = encodeAttr(JSON.stringify(data || {}));
      item.classList.toggle('is-hidden-link', !isVisible);

      const titleNode = $('.link-admin-title', item);
      if (titleNode) {
        titleNode.textContent = inlineConfig.titleText;
        titleNode.classList.add('inline-editable');
        titleNode.classList.toggle('is-editable', Boolean(inlineConfig.titleField));
        titleNode.dataset.inlineField = inlineConfig.titleField || '';
        titleNode.title = inlineConfig.titleField ? 'Click to edit' : '';
      }

      const summaryNode = $('.link-admin-url', item);
      if (summaryNode) {
        summaryNode.textContent = inlineConfig.summaryText || block.summary || blockSummary(type, data);
        summaryNode.classList.add('inline-editable');
        summaryNode.classList.toggle('is-editable', Boolean(inlineConfig.summaryField));
        summaryNode.dataset.inlineField = inlineConfig.summaryField || '';
        summaryNode.title = inlineConfig.summaryField ? 'Click to edit' : '';
      }

      const typePill = $('.link-pill', item);
      if (typePill) typePill.textContent = type;

      const qrBtn = $('[data-action="qr"]', item);
      if (qrBtn) {
        const supported = supportsQrForBlockType(type);
        qrBtn.disabled = !supported;
        qrBtn.title = supported ? 'Show QR code' : 'QR unavailable for this block type';
      }

      const toggleBtn = $('[data-action="toggle"]', item);
      if (toggleBtn) toggleBtn.textContent = isVisible ? 'Hide' : 'Show';
    };

    const createBlockItem = block => {
      const article = document.createElement('article');
      article.className = 'link-admin-item';
      article.draggable = true;
      article.innerHTML = `
        <button type="button" class="icon-action drag-handle" data-action="drag" title="Drag to reorder" aria-label="Drag to reorder">&#8801;</button>
        <div class="link-admin-main">
          <div class="link-admin-title inline-editable" data-inline-field="" tabindex="0"></div>
          <div class="link-admin-url inline-editable" data-inline-field="" tabindex="0"></div>
        </div>
        <div class="link-admin-meta">
          <span class="order-badge">#0</span>
          <span class="link-pill"></span>
        </div>
        <div class="link-admin-actions">
          <button type="button" class="icon-action" data-action="edit" title="Edit block">Edit</button>
          <button type="button" class="icon-action" data-action="qr" title="Show QR code">QR</button>
          <button type="button" class="icon-action" data-action="toggle" title="Toggle visibility">Hide</button>
          <button type="button" class="icon-action danger" data-action="delete" title="Delete block">Del</button>
        </div>
      `;
      setBlockItem(article, block);
      return article;
    };

    const openCreateModal = event => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      cancelInlineEdit();
      if (modalTitle) modalTitle.textContent = 'Create Block';
      resetModalFields();
      modal.open('block');
      headingTextEl?.focus();
    };

    const openEditModal = item => {
      cancelInlineEdit();
      const data = parseBlockJson(item.dataset.json);
      if (modalTitle) modalTitle.textContent = 'Edit Block';
      idEl.value = item.dataset.id || '';
      typeEl.value = item.dataset.type || 'heading';
      visibleEl.checked = item.dataset.visible !== '0';

      if (headingTextEl) headingTextEl.value = String(data.text || '');
      if (headingLevelEl) headingLevelEl.value = String(data.level || 'h2');
      if (richHtmlEl) richHtmlEl.value = String(data.html || '');
      if (buttonLabelEl) buttonLabelEl.value = String(data.label || '');
      if (buttonUrlEl) buttonUrlEl.value = String(data.url || '');
      if (buttonStyleEl) buttonStyleEl.value = String(data.style || 'solid');
      if (buttonNewTabEl) buttonNewTabEl.checked = data.new_tab !== 0;
      if (imageSrcEl) imageSrcEl.value = String(data.src || '');
      if (imageAltEl) imageAltEl.value = String(data.alt || '');
      if (imageCaptionEl) imageCaptionEl.value = String(data.caption || '');
      if (embedTitleEl) embedTitleEl.value = String(data.title || '');
      if (embedHtmlEl) embedHtmlEl.value = String(data.embed_html || '');

      setTypeVisibility(typeEl.value || 'heading');
      modal.open('block');
      const firstInput = $('input, textarea, select:not([disabled])', form);
      firstInput?.focus();
    };

    const persistOrder = async (showSuccess = true) => {
      const ids = $$('.link-admin-item', list).map(item => Number(item.dataset.id)).filter(Number.isInteger);
      if (!ids.length) return;
      await postUrlEncoded('/admin/block/reorder', {
        _csrf: csrfToken,
        ids
      });
      syncOrderBadges();
      if (showSuccess) showToast('Block order saved');
    };

    createBtn.addEventListener('click', openCreateModal);
    typeEl?.addEventListener('change', () => setTypeVisibility(typeEl.value || 'heading'));

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const id = Number(idEl.value || 0);
      const existing = id > 0 ? $(`.link-admin-item[data-id="${id}"]`, list) : null;
      const orderIndex = existing ? Number(existing.dataset.order || 0) || 1 : $$('.link-admin-item', list).length + 1;

      const payload = {
        _csrf: csrfToken,
        id,
        page_id: 1,
        type: typeEl.value,
        is_visible: visibleEl.checked ? 1 : 0,
        order_index: orderIndex,
        heading_text: headingTextEl?.value || '',
        heading_level: headingLevelEl?.value || 'h2',
        rich_html: richHtmlEl?.value || '',
        button_label: buttonLabelEl?.value || '',
        button_url: buttonUrlEl?.value || '',
        button_style: buttonStyleEl?.value || 'solid',
        button_new_tab: buttonNewTabEl?.checked ? 1 : 0,
        image_src: imageSrcEl?.value || '',
        image_alt: imageAltEl?.value || '',
        image_caption: imageCaptionEl?.value || '',
        embed_title: embedTitleEl?.value || '',
        embed_html: embedHtmlEl?.value || ''
      };

      try {
        const result = await postUrlEncoded('/admin/block', payload);
        if (!result.block) throw new Error('Block was not returned from server');

        const targetId = Number(result.block.id || 0);
        let item = targetId > 0 ? $(`.link-admin-item[data-id="${targetId}"]`, list) : null;
        if (!item && id > 0) item = existing;

        if (item) {
          setBlockItem(item, result.block);
        } else {
          item = createBlockItem(result.block);
          list.appendChild(item);
        }

        syncOrderBadges();
        modal.close();
        showToast(result.message || 'Block saved');
      } catch (error) {
        showToast(error.message || 'Failed to save block', 'error');
      }
    });

    list.addEventListener('click', async event => {
      const actionBtn = event.target.closest('[data-action]');
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;
      if (action === 'drag') return;

      const item = actionBtn.closest('.link-admin-item');
      if (!item) return;
      cancelInlineEdit();
      const id = Number(item.dataset.id || 0);
      if (!id) return;

      try {
        if (action === 'edit') {
          openEditModal(item);
          return;
        }

        if (action === 'qr') {
          qrBuilder?.openForBlock(item);
          return;
        }

        if (action === 'toggle') {
          const nextVisible = item.dataset.visible === '1' ? 0 : 1;
          const result = await postUrlEncoded('/admin/block/toggle', {
            _csrf: csrfToken,
            id,
            is_visible: nextVisible
          });
          if (result.block) {
            setBlockItem(item, result.block);
            showToast(result.message || 'Block updated');
          }
          return;
        }

        if (action === 'delete') {
          if (!window.confirm(`Delete ${toDisplayType(item.dataset.type)} block?`)) return;
          await postUrlEncoded('/admin/block/delete', { _csrf: csrfToken, id });
          item.remove();
          syncOrderBadges();
          if ($$('.link-admin-item', list).length) await persistOrder(false);
          showToast('Block deleted');
        }
      } catch (error) {
        showToast(error.message || 'Failed to update block', 'error');
      }
    });

    list.addEventListener('click', event => {
      const editable = event.target.closest('.inline-editable.is-editable');
      if (!editable || !list.contains(editable)) return;
      if (event.target.closest('.inline-edit-shell')) return;
      event.preventDefault();

      const item = editable.closest('.link-admin-item');
      if (!item) return;
      const field = editable.dataset.inlineField || '';
      startInlineEdit(item, editable, field);
    });

    list.addEventListener('keydown', event => {
      const editable = event.target.closest('.inline-editable.is-editable');
      if (!editable || !list.contains(editable)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (editable.classList.contains('inline-edit-active')) return;
      event.preventDefault();

      const item = editable.closest('.link-admin-item');
      if (!item) return;
      const field = editable.dataset.inlineField || '';
      startInlineEdit(item, editable, field);
    });

    list.addEventListener('pointerdown', event => {
      const handle = event.target.closest('.drag-handle');
      if (!handle) return;
      cancelInlineEdit();
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

    $$('.link-admin-item', list).forEach(item => {
      setBlockItem(item, blockFromDataset(item));
    });
    resetModalFields();
    syncOrderBadges();
  }

  function setupRedirectsManager(modal, utmBuilder, qrBuilder) {
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
          <button type="button" class="icon-action" data-action="qr" title="Show QR code">QR</button>
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

        if (action === 'qr') {
          qrBuilder?.openForRedirect(item);
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
  const qrBuilder = setupQrBuilder(modal);
  setupSummaryButtons();
  setupSettingsTabs();
  setupThemeColorPreview();
  setupSettingsSave();
  setupLivePreview();
  setupBuilderPreview();
  setupLinksManager(modal, utmBuilder, qrBuilder);
  setupBlocksManager(modal, qrBuilder);
  setupRedirectsManager(modal, utmBuilder, qrBuilder);
});
