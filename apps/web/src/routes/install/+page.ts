import type { PageLoad } from './$types';

export const ssr = true;

export const load: PageLoad = () => ({ bare: true });
