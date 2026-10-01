import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Sayfalar artık tam ekran Stüdyo'da düzenlenir. */
export const load: PageLoad = ({ params }) => redirect(307, `/studio/${params.id}`);
