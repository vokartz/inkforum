export function mount(el, ctx) {
  const cleanups = [];
  const on = (node, type, fn) => {
    if (!node) return;
    node.addEventListener(type, fn);
    cleanups.push(() => node.removeEventListener(type, fn));
  };
  const setBusy = (form, busy) => form.querySelectorAll('button').forEach((b) => (b.disabled = busy));

  const newForm = el.querySelector('[data-cx-new]');
  if (newForm) {
    const typeSelect = newForm.querySelector('[name="targetType"]');
    const out = newForm.querySelector('[data-cx-out]');
    const sync = () => {
      newForm.querySelectorAll('[data-cx-when]').forEach((field) => {
        const show = field.dataset.cxWhen === typeSelect.value;
        field.hidden = !show;
        field.querySelectorAll('input').forEach((input) => {
          input.disabled = !show;
          input.required = show;
        });
      });
    };
    sync();
    on(typeSelect, 'change', sync);

    on(newForm, 'submit', async (e) => {
      e.preventDefault();
      out.textContent = '';
      setBusy(newForm, true);
      try {
        const body = Object.fromEntries(new FormData(newForm));
        const res = await ctx.api('/complaints', { method: 'POST', body });
        ctx.forum.toast('Şikayetin alındı. Ekip en kısa sürede inceleyecek.', 'success');
        ctx.forum.goto(`/sikayetler/${res.id}`);
      } catch (err) {
        out.textContent = err.message;
        setBusy(newForm, false);
      }
    });
  }

  const holder = el.querySelector('[data-cx-id]');
  const id = holder?.dataset.cxId;
  const replyForm = el.querySelector('[data-cx-reply]');
  if (replyForm && id) {
    const out = replyForm.querySelector('[data-cx-out]');
    on(replyForm, 'submit', async (e) => {
      e.preventDefault();
      out.textContent = '';
      setBusy(replyForm, true);
      try {
        await ctx.api(`/complaints/${id}/reply`, { method: 'POST', body: { body: replyForm.elements.body.value } });
        ctx.forum.toast('Yanıtın gönderildi.', 'success');
        location.reload();
      } catch (err) {
        out.textContent = err.message;
        setBusy(replyForm, false);
      }
    });

    on(replyForm.querySelector('[data-cx-close]'), 'click', async () => {
      if (!confirm('Şikayeti kapatmak istediğine emin misin? Kapatılan şikayete yanıt verilemez.')) return;
      setBusy(replyForm, true);
      try {
        await ctx.api(`/complaints/${id}/close`, { method: 'POST', body: {} });
        ctx.forum.toast('Şikayet kapatıldı.', 'success');
        location.reload();
      } catch (err) {
        ctx.forum.toast(err.message, 'error');
        setBusy(replyForm, false);
      }
    });
  }

  return () => cleanups.forEach((fn) => fn());
}
