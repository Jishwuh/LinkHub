document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  if (!body) return;
  if (String(body.dataset.ageVerified || '0') !== '1') return;

  const continueUrl = String(body.dataset.continueUrl || '').trim();
  if (!continueUrl) return;

  const fallbackLine = document.getElementById('age-redirect-fallback');
  const continueLink = document.getElementById('age-continue-link');
  const status = document.getElementById('age-redirect-status');

  window.setTimeout(() => {
    if (fallbackLine) fallbackLine.hidden = false;
    if (continueLink) continueLink.hidden = false;
    if (status) status.textContent = 'Please wait while we redirect you...';
    window.location.assign(continueUrl);
  }, 3000);
});
