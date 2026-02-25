document.addEventListener('DOMContentLoaded', () => {
  const likeBtn = document.getElementById('like-btn');
  const likeCount = document.getElementById('like-count');
  const shareBtn = document.getElementById('share-btn');

  document.querySelectorAll('.link-card').forEach(card => {
    const color = (card.getAttribute('data-color') || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) {
      card.style.setProperty('--btn-bg', color.toLowerCase());
    }
  });

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
});
