import { getContext, setContext } from 'svelte';
import type { TemplateVars } from './custom-code';

/** Özel kod şablonlarındaki genel değişkenler (forum ve giriş yapan üye); kök layout sağlar. */
const KEY = Symbol('custom-vars');

export function setCustomVars(get: () => TemplateVars): void {
  setContext(KEY, get);
}

/** Bileşen kurulurken çağrılır; dönen fonksiyon güncel değerleri verir (tepkisel). */
export function useCustomVars(): () => TemplateVars {
  return getContext<(() => TemplateVars) | undefined>(KEY) ?? (() => ({}));
}
