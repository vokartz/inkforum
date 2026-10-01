import type { ApplicationFormView } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => ({
  form: await apiLoad<ApplicationFormView>(fetch, `/api/applications/forms/${encodeURIComponent(params.slug)}`, url),
});
