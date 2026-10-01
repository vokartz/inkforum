import { redirect } from '@sveltejs/kit';
import { loadCatalog } from '$lib/i18n.svelte';
import type { LayoutLoad } from './$types';

/** Uyum engelleri varken bile açık kalan sayfalar. */
const OPEN = [
  /^\/login/,
  /^\/register/,
  /^\/forgot-password/,
  /^\/reset-password\//,
  /^\/verify-email/,
  /^\/confirm-email\//,
  /^\/policies\//,
  /^\/change-password/,
  /^\/banned/,
  /^\/cookies/,
  /^\/settings\/security/,
];

export const load: LayoutLoad = async ({ data, url }) => {
  const { viewer } = data;
  // Seçili dilin kataloğu çizimden önce hazır olmalı (t() eşzamanlıdır)
  await loadCatalog(viewer.locale);
  const path = url.pathname;
  const open = OPEN.some((re) => re.test(path));

  if (!viewer.isAdmin && viewer.flags.ban?.cannotAccess && path !== '/banned') redirect(303, '/banned');

  if (viewer.user && !open) {
    if (viewer.flags.mustChangePassword) redirect(303, '/change-password');
    if (viewer.flags.pendingPolicies.length) redirect(303, `/policies/accept?next=${encodeURIComponent(path + url.search)}`);
    if (viewer.flags.twoFactorSetupRequired) redirect(303, '/settings/security?required=1');
  }
  return data;
};
