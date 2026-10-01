import type { TicketDesk } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, depends }) => {
  depends('app:ticket-desk');
  const status = url.searchParams.get('status') ?? 'active';
  const category = url.searchParams.get('category') ?? '';
  const page = url.searchParams.get('page') ?? '1';
  const qs = new URLSearchParams({ status, page, ...(category ? { category } : {}) });
  return { desk: await apiLoad<TicketDesk>(fetch, `/api/tickets/desk?${qs}`, url), status, category };
};
