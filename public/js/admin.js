// public/js/admin.js
document.addEventListener('DOMContentLoaded', () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function decodeJsonAttr(raw) { if (!raw) return ''; try { return JSON.parse('"' + raw.replace(/"/g, '\\"') + '"'); } catch { return raw; } }

  // Links
  const linkForm = $('#link-form');
  if (linkForm) {
    const idEl = $('#link-id'), titleEl = $('#link-title'), urlEl = $('#link-url'), iconEl = $('#link-icon'),
      colorEl = $('#link-color'), orderEl = $('#link-order'), visibleEl = $('#link-visible'),
      submitBtn = $('#link-submit'), cancelBtn = $('#link-cancel');
    function startEditLink(d) {
      idEl.value = d.id || ''; titleEl.value = d.title || ''; urlEl.value = d.url || '';
      iconEl.value = d.icon || ''; colorEl.value = d.color || '#2a2a2a';
      orderEl.value = (d.order != null ? d.order : 0);
      visibleEl.checked = (d.visible === '1' || d.visible === 1 || d.visible === true);
      submitBtn.textContent = 'Save Changes'; if (cancelBtn) cancelBtn.style.display = 'inline-block';
      linkForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function cancelEditLink() {
      idEl.value = ''; titleEl.value = ''; urlEl.value = ''; iconEl.value = ''; colorEl.value = '#2a2a2a';
      orderEl.value = 0; visibleEl.checked = true; submitBtn.textContent = 'Add Link'; if (cancelBtn) cancelBtn.style.display = 'none';
    }
    $$('.btn-edit').forEach(btn => btn.addEventListener('click', () => {
      startEditLink({
        id: btn.dataset.id, title: btn.dataset.title, url: btn.dataset.url, icon: btn.dataset.icon,
        color: btn.dataset.color, order: btn.dataset.order, visible: btn.dataset.visible
      });
    }));
    cancelBtn?.addEventListener('click', cancelEditLink);
  }

  // Embeds
  $$('.btn-embed-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const html = decodeJsonAttr(btn.getAttribute('data-html'));
      const idEl = $('#embed-id'), titleEl = $('#embed-title'), orderEl = $('#embed-order'),
        visibleEl = $('#embed-visible'), htmlEl = $('#embed-html');
      if (!idEl || !titleEl || !orderEl || !visibleEl || !htmlEl) return;
      idEl.value = btn.dataset.id || ''; titleEl.value = btn.dataset.title || '';
      orderEl.value = btn.dataset.order || 0; visibleEl.checked = (btn.dataset.visible === '1');
      htmlEl.value = html; titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // Redirects
  const rForm = $('#redirect-form');
  if (rForm) {
    const idEl = $('#redirect-id'), slugEl = $('#redirect-slug'), urlEl = $('#redirect-url'),
      activeEl = $('#redirect-active'), submitBtn = $('#redirect-submit'), cancelBtn = $('#redirect-cancel');
    function startEditRedirect(d) {
      idEl.value = d.id || ''; slugEl.value = d.slug || ''; urlEl.value = d.url || '';
      activeEl.checked = (d.active === '1');
      submitBtn.textContent = 'Save Changes'; cancelBtn.style.display = 'inline-block';
    }
    function cancelEditRedirect() {
      idEl.value = ''; slugEl.value = ''; urlEl.value = ''; activeEl.checked = true;
      submitBtn.textContent = 'Add Redirect'; cancelBtn.style.display = 'none';
    }
    $$('.btn-redirect-edit').forEach(btn => btn.addEventListener('click', () => {
      startEditRedirect({ id: btn.dataset.id, slug: btn.dataset.slug, url: btn.dataset.url, active: btn.dataset.active });
    }));
    cancelBtn?.addEventListener('click', cancelEditRedirect);
  }
});
