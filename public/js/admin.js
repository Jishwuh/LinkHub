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

  const linkForm = $('#link-form');
  if (linkForm) {
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

    $$('.btn-edit').forEach(btn =>
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
      })
    );

    cancelBtn?.addEventListener('click', cancelEditLink);
  }

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

  const redirectForm = $('#redirect-form');
  if (redirectForm) {
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

    $$('.btn-redirect-edit').forEach(btn =>
      btn.addEventListener('click', () => {
        startEditRedirect({
          id: btn.dataset.id,
          slug: btn.dataset.slug,
          url: btn.dataset.url,
          active: btn.dataset.active
        });
      })
    );

    cancelBtn?.addEventListener('click', cancelEditRedirect);
  }

  $$('.confirm-delete-form').forEach(form => {
    form.addEventListener('submit', event => {
      const label = form.getAttribute('data-label') || 'item';
      if (!window.confirm(`Delete ${label}?`)) {
        event.preventDefault();
      }
    });
  });
});
