document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('unmute');
  const iframe = document.getElementById('rr-iframe');
  if (!btn || !iframe) return;

  btn.addEventListener('click', () => {
    try {
      const u = new URL(iframe.src);
      u.searchParams.set('mute', '0');
      u.searchParams.set('autoplay', '1');
      iframe.src = u.toString();
    } catch (_) { }
  });
});