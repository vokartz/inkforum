import { getContext, setContext } from 'svelte';
import type { TemplateVars } from './custom-code';

const KEY = Symbol('custom-vars');

export function setCustomVars(get: () => TemplateVars): void {
  setContext(KEY, get);
}

export function useCustomVars(): () => TemplateVars {
  return getContext<(() => TemplateVars) | undefined>(KEY) ?? (() => ({}));
}
