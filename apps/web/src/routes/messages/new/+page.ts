import type { UserSummary } from '@forum/shared';
import { request } from '$lib/api';
import type { PublicProfile } from '$lib/types';
import type { PageLoad } from './$types';

/** ?to=<üye id> ile alıcı önceden seçilir (profildeki "Mesaj gönder"). */
export const load: PageLoad = async ({ fetch, url }) => {
  const to = Number(url.searchParams.get('to'));
  let recipient: UserSummary | null = null;
  if (to > 0) {
    recipient = await request<PublicProfile>(fetch, `/api/users/${to}`)
      .then((p) => p.user)
      .catch(() => null);
  }
  return { recipient };
};
