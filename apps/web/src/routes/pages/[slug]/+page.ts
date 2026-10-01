import { loadCustomPage } from '$lib/custom-page-load';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ fetch, params, url }) => loadCustomPage(fetch, `/api/pages/${encodeURIComponent(params.slug)}${url.search}`, url);
