import type { PageLoad } from './$types';

/** Stüdyo önizleme çerçevesi: "Ayrı site" düzeninde forum çerçevesi çizilmez. */
export const load: PageLoad = ({ url }) => ({ bare: url.searchParams.get('layout') === 'blank', layout: url.searchParams.get('layout') ?? 'blank' });
