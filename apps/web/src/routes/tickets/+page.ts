import type { TicketItem } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, depends }) => {
  depends('app:tickets');
  return apiLoad<{ items: TicketItem[]; counts: { desk: number | null; mine: number } }>(fetch, '/api/tickets', url);
};
