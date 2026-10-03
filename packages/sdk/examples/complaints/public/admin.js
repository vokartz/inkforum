export function mount(el, ctx) {
  const cleanups = [];
  const on = (node, type, fn) => {
    if (!node) return;
    node.addEventListener(type, fn);
    cleanups.push(() => node.removeEventListener(type, fn));
  };
  const done = () => () => cleanups.forEach((fn) => fn());

  on(el, 'click', (e) => {
    const row = e.target.closest('tr[data-cx-href]');
    if (!row || e.target.closest('a, button, input, select, textarea')) return;
    ctx.forum.goto(row.dataset.cxHref);
  });

  const root = el.querySelector('[data-cx-staff]');
  if (!root) return done();
  const id = root.dataset.cxId;

  const patch = async (body, message) => {
    await ctx.api(`/staff/complaints/${id}`, { method: 'PATCH', body });
    ctx.forum.toast(message, 'success');
    location.reload();
  };

  root.querySelectorAll('select[data-cx-field]').forEach((select) => {
    on(select, 'change', async () => {
      const field = select.dataset.cxField;
      select.disabled = true;
      try {
        await patch({ [field]: select.value }, field === 'status' ? 'Durum güncellendi.' : 'Öncelik güncellendi.');
      } catch (err) {
        ctx.forum.toast(err.message, 'error');
        select.value = select.dataset.cxCurrent;
        select.disabled = false;
      }
    });
  });

  on(root, 'click', async (e) => {
    const btn = e.target.closest('button[data-cx-act]');
    if (!btn) return;
    btn.disabled = true;
    try {
      if (btn.dataset.cxAct === 'assign-me') await patch({ assignee: 'me' }, 'Şikayeti üstlendin.');
      else if (btn.dataset.cxAct === 'unassign') await patch({ assignee: null }, 'Atama kaldırıldı.');
    } catch (err) {
      ctx.forum.toast(err.message, 'error');
      btn.disabled = false;
    }
  });

  const assignForm = root.querySelector('[data-cx-assign]');
  on(assignForm, 'submit', async (e) => {
    e.preventDefault();
    const name = assignForm.elements.assignee.value.trim();
    if (!name) return;
    const btn = assignForm.querySelector('button');
    btn.disabled = true;
    try {
      await patch({ assignee: name }, 'Şikayet atandı.');
    } catch (err) {
      ctx.forum.toast(err.message, 'error');
      btn.disabled = false;
    }
  });

  const replyForm = root.querySelector('[data-cx-staff-reply]');
  if (replyForm) {
    const out = replyForm.querySelector('[data-cx-out]');
    const internal = replyForm.elements.internal;
    const label = replyForm.querySelector('[data-cx-reply-label]');
    const submit = replyForm.querySelector('[data-cx-submit]');
    const textarea = replyForm.elements.body;
    const syncMode = () => {
      const note = internal.checked;
      replyForm.dataset.mode = note ? 'note' : 'reply';
      label.textContent = note ? 'İç not' : 'Üyeye yanıt';
      submit.textContent = note ? 'Not ekle' : 'Yanıtla';
      textarea.placeholder = note ? 'Yalnızca ekibin göreceği notunu yaz…' : 'Şikayet edene görünecek yanıtını yaz…';
    };
    syncMode();
    on(internal, 'change', syncMode);

    on(replyForm, 'submit', async (e) => {
      e.preventDefault();
      out.textContent = '';
      submit.disabled = true;
      try {
        await ctx.api(`/staff/complaints/${id}/messages`, {
          method: 'POST',
          body: { body: textarea.value, internal: internal.checked, status: replyForm.elements.status.value },
        });
        ctx.forum.toast(internal.checked ? 'Not eklendi.' : 'Yanıt gönderildi.', 'success');
        location.reload();
      } catch (err) {
        out.textContent = err.message;
        submit.disabled = false;
      }
    });
  }

  return done();
}
