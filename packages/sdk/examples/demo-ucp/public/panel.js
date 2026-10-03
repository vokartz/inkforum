export function mount(el, ctx) {
  const form = el.querySelector('[data-form]');
  const out = el.querySelector('[data-out]');
  if (!form) return;
  const onSubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      await ctx.api('/characters', { method: 'POST', body: data });
      ctx.forum.toast('Başvurun alındı!', 'success');
      ctx.forum.goto(location.pathname + '?t=' + Date.now());
    } catch (err) {
      out.textContent = err.message;
    }
  };
  form.addEventListener('submit', onSubmit);
  return () => form.removeEventListener('submit', onSubmit);
}
