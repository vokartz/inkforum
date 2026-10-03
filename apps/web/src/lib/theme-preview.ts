import { browser } from '$app/environment';
import type { ActiveTheme } from '@forum/shared';

export const THEME_PREVIEW_KEY = 'inkforum:theme-preview';
export const THEME_PREVIEW_MESSAGE = 'inkforum:theme-preview';

export interface ThemePreviewDraft {
  active: ActiveTheme;
  settings: Record<string, unknown>;
}

export function previewDraft(): ThemePreviewDraft | null {
  if (!browser || window.self === window.top) return null;
  try {
    const raw = sessionStorage.getItem(THEME_PREVIEW_KEY);
    return raw ? (JSON.parse(raw) as ThemePreviewDraft) : null;
  } catch {
    return null;
  }
}
