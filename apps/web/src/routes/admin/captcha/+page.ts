import type { CaptchaConfig } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-captcha');
  const { access } = await parent();
  if (!access.elevated) return { captcha: null };
  return { captcha: await apiLoad<{ config: CaptchaConfig; hasSecret: boolean }>(fetch, '/api/admin/captcha', url) };
};
