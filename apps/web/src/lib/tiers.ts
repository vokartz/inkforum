import { t, tc } from './i18n.svelte';

export function tierName(label: string): string {
  const names: Record<string, string> = { Bronz: t('Bronz'), Gümüş: t('Gümüş'), Altın: t('Altın'), Platin: t('Platin'), Elmas: t('Elmas') };
  return names[label] ?? tc(label);
}
