import type { TicketDetail } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url, depends }) => {
  depends('app:ticket');
  return { ticket: await apiLoad<TicketDetail>(fetch, `/api/tickets/${params.id}`, url) };
};
