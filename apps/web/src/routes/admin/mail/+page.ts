import type { AdminMailTemplate, AdminMailTransport } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-mail');
  const { access } = await parent();
  if (!access.elevated) return { outbox: null, templates: [] as AdminMailTemplate[], transport: null };
  const [outbox, templates, transport] = await Promise.all([
    apiLoad<{ driver: string; items: Array<{ to: string; subject: string; text: string; sentAt: number }> }>(fetch, '/api/admin/mail/outbox', url),
    apiLoad<{ items: AdminMailTemplate[] }>(fetch, '/api/admin/mail/templates', url),
    apiLoad<AdminMailTransport>(fetch, '/api/admin/mail/transport', url),
  ]);
  return { outbox, templates: templates.items, transport };
};
