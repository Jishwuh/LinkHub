document.addEventListener('DOMContentLoaded', () => {
  const likeBtn = document.getElementById('like-btn');
  const likeCount = document.getElementById('like-count');
  const shareBtn = document.getElementById('share-btn');

  const body = document.body;
  const themeColor = (body.dataset.themeColor || '').trim();
  const overlayOpacity = Number(body.dataset.overlayOpacity);
  const backgroundBlur = Number(body.dataset.backgroundBlur);

  if (/^#[0-9a-fA-F]{6}$/.test(themeColor)) {
    document.documentElement.style.setProperty('--accent', themeColor.toLowerCase());
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
});
