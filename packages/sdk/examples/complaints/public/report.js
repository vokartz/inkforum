export function mount(el, ctx) {
  const root = el.querySelector('[data-cx-report]');
  if (!root) return;
  const dialog = root.querySelector('dialog');
  const form = root.querySelector('[data-cx-report-form]');
  const out = root.querySelector('[data-cx-out]');
  const openBtn = root.querySelector('[data-cx-open]');
  if (!dialog || !form || !openBtn) return;

  const open = () => {
    out.textContent = '';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    form.querySelector('textarea')?.focus();
  };
  const close = () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };

  const onOpen = () => open();
  const onClick = (e) => {
    if (e.target.closest('[data-cx-cancel]') || e.target === dialog) close();
  };
  const onSubmit = async (e) => {
    e.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);
    const body = String(fd.get('body') ?? '').trim();
    if (body.length < 10) {
      out.textContent = 'Açıklama en az 10 karakter olmalı.';
      return;
    }
    submit.disabled = true;
    out.textContent = '';
    try {
      const res = await ctx.api('/complaints', {
        method: 'POST',
        body: {
          targetType: 'post',
          targetId: Number(root.dataset.cxPost),
          targetLabel: root.dataset.cxLabel ?? '',
          category: fd.get('category'),
          body,
        },
      });
      close();
      form.reset();
      openBtn.disabled = true;
      const label = openBtn.querySelector('[data-cx-text]');
      if (label) label.textContent = 'Şikayet edildi';
      ctx.forum.toast(`Şikayetin alındı (#${res.id}). Durumunu Şikayetlerim sayfasından takip edebilirsin.`, 'success');
    } catch (err) {
      out.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  };

  openBtn.addEventListener('click', onOpen);
  dialog.addEventListener('click', onClick);
  form.addEventListener('submit', onSubmit);
  return () => {
    openBtn.removeEventListener('click', onOpen);
    dialog.removeEventListener('click', onClick);
    form.removeEventListener('submit', onSubmit);
    if (dialog.open) close();
  };
}
