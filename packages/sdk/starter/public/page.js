export function mount(el, ctx) {
  const out = el.querySelector('[data-out]');
  const button = el.querySelector('[data-ping]');
  const onClick = async () => {
    const res = await ctx.api('/ping');
    out.textContent = JSON.stringify(res);
    ctx.forum.toast('Sunucu yanıt verdi', 'success');
  };
  button?.addEventListener('click', onClick);
  return () => button?.removeEventListener('click', onClick);
}
