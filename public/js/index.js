document.addEventListener('DOMContentLoaded', () => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const csrfToken = String($('meta[name="csrf-token"]')?.getAttribute('content') || '').trim();
  const likeBtn = document.getElementById('like-btn');
  const likeCount = document.getElementById('like-count');
  const shareBtn = document.getElementById('share-btn');

  const body = document.body;
  const themeColor = (body.dataset.themeColor || '').trim();
  const themeSurfaceColor = (body.dataset.themeSurfaceColor || '').trim();
  const themeTextColor = (body.dataset.themeTextColor || '').trim();
  const themeMutedColor = (body.dataset.themeMutedColor || '').trim();
  const themeBorderColor = (body.dataset.themeBorderColor || '').trim();
  const themeSpacingScale = Number(body.dataset.themeSpacingScale);
  const themeRadiusScale = Number(body.dataset.themeRadiusScale);
  const overlayOpacity = Number(body.dataset.overlayOpacity);
  const backgroundBlur = Number(body.dataset.backgroundBlur);

  if (/^#[0-9a-fA-F]{6}$/.test(themeColor)) {
    document.documentElement.style.setProperty('--accent', themeColor.toLowerCase());
  }
  if (/^#[0-9a-fA-F]{6}$/.test(themeSurfaceColor)) {
    document.documentElement.style.setProperty('--surface', themeSurfaceColor.toLowerCase());
  }
  if (/^#[0-9a-fA-F]{6}$/.test(themeTextColor)) {
    document.documentElement.style.setProperty('--text', themeTextColor.toLowerCase());
  }
  if (/^#[0-9a-fA-F]{6}$/.test(themeMutedColor)) {
    document.documentElement.style.setProperty('--muted', themeMutedColor.toLowerCase());
  }
  if (/^#[0-9a-fA-F]{6}$/.test(themeBorderColor)) {
    document.documentElement.style.setProperty('--border-color', themeBorderColor.toLowerCase());
  }
  if (Number.isFinite(themeSpacingScale)) {
    const clamped = Math.max(0.75, Math.min(1.5, themeSpacingScale));
    document.documentElement.style.setProperty('--space-scale', String(clamped));
  }
  if (Number.isFinite(themeRadiusScale)) {
    const clamped = Math.max(0.6, Math.min(1.8, themeRadiusScale));
    document.documentElement.style.setProperty('--radius-scale', String(clamped));
  }

  if (Number.isFinite(overlayOpacity)) {
    const clamped = Math.max(0, Math.min(0.9, overlayOpacity));
    document.documentElement.style.setProperty('--overlay-opacity', String(clamped));
  }

  if (Number.isFinite(backgroundBlur)) {
    const clamped = Math.max(0, Math.min(20, backgroundBlur));
    document.documentElement.style.setProperty('--bg-blur', `${clamped}px`);
  }

  document.querySelectorAll('.link-card').forEach(card => {
    const color = (card.getAttribute('data-color') || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) {
      card.style.setProperty('--btn-bg', color.toLowerCase());
    }
  });

  const toastEl = $('#public-toast');
  let toastTimer = 0;
  const showToast = (message, type = 'success') => {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.remove('show', 'toast-error');
    if (type === 'error') toastEl.classList.add('toast-error');
    toastEl.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2200);
  };

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
    const bodyParams = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value != null) bodyParams.append(key, String(value));
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'fetch',
        'X-CSRF-Token': csrfToken
      },
      body: bodyParams
    });

    return parseResponse(response);
  }

  function initParticles() {
    if (body.dataset.backgroundMode !== 'particles') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.getElementById('particle-bg');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const density = Math.max(20, Math.min(180, Number(body.dataset.particlesDensity) || 80));
    const speed = Math.max(0.2, Math.min(3, Number(body.dataset.particlesSpeed) || 1));

    const particles = [];
    let width = 0;
    let height = 0;
    let animationFrame = 0;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    }

    function makeParticle() {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 2.2 + 0.8,
        vx: (Math.random() * 0.8 - 0.4) * speed,
        vy: (Math.random() * 0.8 - 0.4) * speed
      };
    }

    resize();
    for (let i = 0; i < density; i += 1) particles.push(makeParticle());

    function draw() {
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 140) continue;

          const alpha = (1 - d / 140) * 0.16;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      animationFrame = requestAnimationFrame(draw);
    }

    draw();
    window.addEventListener('resize', resize);
    window.addEventListener('pagehide', () => cancelAnimationFrame(animationFrame), { once: true });
  }

  initParticles();

  let liked = false;
  let inFlight = false;

  async function refreshStats() {
    if (!likeCount) return;
    try {
      const response = await fetch('/api/stats', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      likeCount.textContent = String(typeof payload.likes === 'number' ? payload.likes : 0);
      if (payload.liked && likeBtn) {
        liked = true;
        likeBtn.classList.add('liked');
        likeBtn.setAttribute('aria-disabled', 'true');
      }
    } catch {
      // Ignore stats fetch errors in UI.
    }
  }

  if (likeBtn && likeCount) {
    likeBtn.addEventListener('click', async () => {
      if (liked || inFlight) return;
      inFlight = true;
      likeBtn.classList.add('busy');

      try {
        const response = await fetch('/api/like', { method: 'POST', headers: { Accept: 'application/json' } });
        if (!response.ok) return;

        const payload = await response.json();
        if (typeof payload.likes === 'number') {
          likeCount.textContent = String(payload.likes);
        }

        if (payload.liked) {
          liked = true;
          likeBtn.classList.add('liked', 'pop');
          likeBtn.setAttribute('aria-disabled', 'true');
          setTimeout(() => likeBtn.classList.remove('pop'), 300);
        }
      } catch {
        // Ignore like errors in UI.
      } finally {
        likeBtn.classList.remove('busy');
        inFlight = false;
      }
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = window.location.href;

      if (navigator.share) {
        try {
          await navigator.share({ url });
          return;
        } catch {
          // Fall through to clipboard.
        }
      }

      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(url);
          return;
        } catch {
          // Fall through to legacy copy.
        }
      }

      try {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      } catch {
        window.prompt('Copy this link:', url);
      }
    });
  }

  refreshStats();

  const modalOverlay = $('#public-access-overlay');
  const passwordModal = $('#public-password-modal');
  const ageModal = $('#public-age-modal');
  const passwordForm = $('#public-password-form');
  const ageForm = $('#public-age-form');
  const contextTypeEl = $('#public-context-type');
  const contextIdEl = $('#public-context-id');
  const returnToEl = $('#public-return-to');
  const passwordInputEl = $('#public-password-input');
  const passwordStatusEl = $('#public-password-status');
  const ageReturnToEl = $('#public-age-return-to');
  const ageContextTypeEl = $('#public-age-context-type');
  const ageContextIdEl = $('#public-age-context-id');

  const allAccessItems = () => $$('.access-item');

  const isPasswordLocked = item => String(item.dataset.passwordLocked || '0') === '1';
  const isAgeLocked = item => String(item.dataset.ageLocked || '0') === '1';
  const isSpoiler = item => String(item.dataset.spoiler || '0') === '1';
  const isRevealed = item => String(item.dataset.revealed || '0') === '1';
  const spoilerPending = item => isSpoiler(item) && !isRevealed(item);
  const needsAccessOverlay = item => isPasswordLocked(item) || isAgeLocked(item) || spoilerPending(item);

  function updateInlineOverlay(item) {
    const inline = $('.access-overlay-inline', item);
    if (!inline) return;
    const lockTag = $('.tag-lock', inline);
    const ageTag = $('.tag-age', inline);
    const spoilerBtn = $('.tag-spoiler-btn', inline);
    if (lockTag) lockTag.hidden = !isPasswordLocked(item);
    if (ageTag) ageTag.hidden = isPasswordLocked(item) || !isAgeLocked(item);
    if (spoilerBtn) spoilerBtn.hidden = isPasswordLocked(item) || isAgeLocked(item) || !spoilerPending(item);
    inline.hidden = !needsAccessOverlay(item);
  }

  function updateBlockOverlay(item) {
    if (!item.classList.contains('access-item-block')) return;
    const overlay = Array.from(item.children).find(child => child.classList?.contains('access-overlay'));
    if (!overlay) return;
    const actionBtn = $('[data-access-action]', overlay);
    if (!actionBtn) {
      overlay.hidden = !needsAccessOverlay(item);
      return;
    }

    if (isPasswordLocked(item)) {
      actionBtn.dataset.accessAction = 'unlock';
      actionBtn.textContent = 'Unlock';
      overlay.hidden = false;
      return;
    }
    if (isAgeLocked(item)) {
      actionBtn.dataset.accessAction = 'age';
      actionBtn.textContent = '18+ Verify';
      overlay.hidden = false;
      return;
    }
    if (spoilerPending(item)) {
      actionBtn.dataset.accessAction = 'spoiler';
      actionBtn.textContent = 'Spoiler';
      overlay.hidden = false;
      return;
    }
    overlay.hidden = true;
  }

  function updateAccessItem(item) {
    item.classList.toggle('is-password-locked', isPasswordLocked(item));
    item.classList.toggle('is-age-locked', isAgeLocked(item));
    item.classList.toggle('is-spoiler', spoilerPending(item));
    item.classList.toggle('is-revealed', isRevealed(item));

    updateInlineOverlay(item);
    updateBlockOverlay(item);
  }

  function setSpoilerRevealed(item, revealed = true) {
    item.dataset.revealed = revealed ? '1' : '0';
    updateAccessItem(item);
  }

  function closePublicModal() {
    if (!modalOverlay) return;
    modalOverlay.hidden = true;
    if (passwordModal) passwordModal.hidden = true;
    if (ageModal) ageModal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function openPasswordModal(item) {
    if (!modalOverlay || !passwordModal || !contextTypeEl || !contextIdEl || !returnToEl) return;
    const contextType = String(item?.dataset?.contextType || '').trim();
    const contextId = String(item?.dataset?.contextId || item?.dataset?.contextSlug || '').trim();
    const returnTo = String(item?.dataset?.returnTo || '/').trim() || '/';
    contextTypeEl.value = contextType;
    contextIdEl.value = contextId;
    returnToEl.value = returnTo;
    if (passwordInputEl) passwordInputEl.value = '';
    if (passwordStatusEl) passwordStatusEl.textContent = 'Enter password to unlock this content.';
    modalOverlay.hidden = false;
    passwordModal.hidden = false;
    if (ageModal) ageModal.hidden = true;
    document.body.classList.add('modal-open');
    passwordInputEl?.focus();
  }

  function openAgeModal(item) {
    if (!modalOverlay || !ageModal || !ageReturnToEl || !ageContextTypeEl || !ageContextIdEl) return;
    const contextType = String(item?.dataset?.contextType || '').trim();
    const itemReturnTo = String(item?.dataset?.returnTo || window.location.pathname || '/').trim() || '/';
    ageReturnToEl.value = contextType === 'link' || contextType === 'redirect' ? itemReturnTo : '/__age_local';
    ageContextTypeEl.value = contextType;
    ageContextIdEl.value = String(item?.dataset?.contextId || item?.dataset?.contextSlug || '').trim();
    modalOverlay.hidden = false;
    ageModal.hidden = false;
    if (passwordModal) passwordModal.hidden = true;
    document.body.classList.add('modal-open');
  }

  function unlockMatchingItems(contextType, contextIdOrSlug) {
    const type = String(contextType || '').trim();
    const key = String(contextIdOrSlug || '').trim();
    allAccessItems().forEach(item => {
      const itemType = String(item.dataset.contextType || '').trim();
      const itemKey = String(item.dataset.contextId || item.dataset.contextSlug || '').trim();
      if (itemType !== type || itemKey !== key) return;
      item.dataset.passwordLocked = '0';
      updateAccessItem(item);
    });
  }

  function clearAgeLocks(targetContextType = '', targetContextId = '') {
    const contextType = String(targetContextType || '').trim();
    const contextId = String(targetContextId || '').trim();
    allAccessItems().forEach(item => {
      if (item.dataset.ageLocked !== '1') return;
      if (contextType && contextType !== 'page') {
        const itemType = String(item.dataset.contextType || '').trim();
        const itemId = String(item.dataset.contextId || item.dataset.contextSlug || '').trim();
        if (itemType !== contextType || itemId !== contextId) return;
      }
      item.dataset.ageLocked = '0';
      updateAccessItem(item);
    });
  }

  async function runSpoilerReveal(item) {
    if (!item || !spoilerPending(item)) return;
    if (item.classList.contains('is-revealing')) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSpoilerRevealed(item, true);
    item.classList.add('is-revealing');
    await new Promise(resolve => window.setTimeout(resolve, reduced ? 140 : 520));
    item.classList.remove('is-revealing');
  }

  allAccessItems().forEach(item => updateAccessItem(item));

  $$('.access-action-btn').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const item = event.currentTarget.closest('.access-item');
      if (!item) return;
      const action = String(event.currentTarget.dataset.accessAction || '').trim();
      if (action === 'unlock') {
        openPasswordModal(item);
        return;
      }
      if (action === 'age') {
        openAgeModal(item);
        return;
      }
      if (action === 'spoiler') {
        void runSpoilerReveal(item);
      }
      if (action === 'spoiler-inline') {
        void runSpoilerReveal(item);
      }
    });
  });

  document.addEventListener('click', event => {
    const card = event.target.closest('.access-item-link');
    if (!card) return;
    if (event.defaultPrevented) return;

    if (isPasswordLocked(card)) {
      event.preventDefault();
      openPasswordModal(card);
      return;
    }
    if (isAgeLocked(card)) {
      event.preventDefault();
      openAgeModal(card);
      return;
    }
    if (spoilerPending(card)) {
      event.preventDefault();
      void runSpoilerReveal(card);
    }
  });

  if (passwordForm) {
    passwordForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!contextTypeEl || !contextIdEl || !returnToEl || !passwordInputEl) return;
      try {
        const result = await postUrlEncoded('/access/password-unlock', {
          _csrf: csrfToken,
          context_type: contextTypeEl.value,
          context_id_or_slug: contextIdEl.value,
          return_to: returnToEl.value,
          password: passwordInputEl.value
        });
        unlockMatchingItems(contextTypeEl.value, contextIdEl.value);
        closePublicModal();
        showToast(result.message || 'Unlocked');
      } catch (error) {
        if (passwordStatusEl) passwordStatusEl.textContent = error.message || 'Invalid password';
        showToast(error.message || 'Unable to unlock', 'error');
      }
    });
  }

  if (ageForm) {
    ageForm.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const result = await postUrlEncoded('/access/age-verify', {
          _csrf: csrfToken,
          return_to: ageReturnToEl?.value || window.location.pathname || '/',
          context_type: ageContextTypeEl?.value || '',
          context_id_or_slug: ageContextIdEl?.value || ''
        });
        clearAgeLocks(ageContextTypeEl?.value || '', ageContextIdEl?.value || '');
        closePublicModal();
        showToast(result.message || 'Age verification complete');
      } catch (error) {
        showToast(error.message || 'Unable to verify age', 'error');
      }
    });
  }

  $$('[data-public-modal-close]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      closePublicModal();
    });
  });

  modalOverlay?.addEventListener('click', event => {
    if (event.target === modalOverlay) closePublicModal();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modalOverlay && !modalOverlay.hidden) {
      closePublicModal();
    }
  });
});
