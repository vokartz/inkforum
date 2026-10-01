import type { TicketCategory } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => ({ categories: await apiLoad<TicketCategory[]>(fetch, '/api/tickets/categories', url), preselect: Number(url.searchParams.get('category')) || null });
