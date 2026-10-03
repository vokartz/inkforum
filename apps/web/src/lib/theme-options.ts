import type { ActiveTheme } from '@forum/shared';

export function themeOptions(
  settings: Record<string, unknown> | undefined | null,
): ActiveTheme['options'] | null {
  const t = settings?.['appearance.theme'] as ActiveTheme | null | undefined;
  return t?.options ?? null;
}
