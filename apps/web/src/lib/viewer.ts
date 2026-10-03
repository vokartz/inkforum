import type { Viewer } from '@forum/shared';
import { page } from '$app/state';

export function can(viewer: Viewer | null | undefined, permission: string): boolean {
  if (!viewer) return false;
  return viewer.isAdmin || viewer.permissions.includes(permission);
}

export function currentViewer(): Viewer {
  return page.data.viewer as Viewer;
}

export function profileUrl(user: { id: number; slug: string }): string {
  return `/u/${user.id}/${user.slug}`;
}
