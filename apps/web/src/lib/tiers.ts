import { t, tc } from './i18n.svelte';

/** Başarı seviyesinin sunucudan gelen Türkçe adı → arayüz dili */
export function tierName(label: string): string {
  const names: Record<string, string> = { Bronz: t('Bronz'), Gümüş: t('Gümüş'), Altın: t('Altın'), Platin: t('Platin'), Elmas: t('Elmas') };
  return names[label] ?? tc(label);
}
