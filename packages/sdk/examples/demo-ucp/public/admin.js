export function mount(el, ctx) {
  const onClick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    btn.disabled = true;
    try {
      await ctx.api(`/characters/${id}/${btn.dataset.act}`, { method: 'POST', body: {} });
      ctx.forum.toast(btn.dataset.act === 'approve' ? 'Onaylandı.' : 'Reddedildi.', 'success');
      location.reload();
    } catch (err) {
      ctx.forum.toast(err.message, 'error');
      btn.disabled = false;
    }
  };
  el.addEventListener('click', onClick);
  return () => el.removeEventListener('click', onClick);
}
