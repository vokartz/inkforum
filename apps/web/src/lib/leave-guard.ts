import { beforeNavigate, goto } from '$app/navigation';
import { confirmAction } from '$lib/confirm.svelte';
import { t } from '$lib/i18n.svelte';

/**
 * Kaydedilmemiş değişiklikle sayfadan çıkarken tarayıcının çirkin confirm() kutusu yerine forumun onay penceresini
 * gösterir. Sekme kapatma / yenilemede tarayıcılar yalnızca kendi uyarısına izin verir; orada o kullanılır.
 * Bileşenin script bloğunda çağrılmalıdır.
 */
export function guardUnsaved(isDirty: () => boolean): void {
  let bypass = false;
  beforeNavigate((nav) => {
    if (bypass || !isDirty()) return;
    if (nav.type === 'leave') {
      nav.cancel();
      return;
    }
    const target = nav.to?.url;
    if (!target) return;
    nav.cancel();
    void confirmAction({
      title: t('Kaydedilmemiş değişiklikler var'),
      description: t('Bu sayfadan ayrılırsan yaptığın değişiklikler kaybolacak.'),
      confirmLabel: t('Kaydetmeden çık'),
      cancelLabel: t('Sayfada kal'),
      tone: 'warning',
      destructive: true,
    }).then(async (ok) => {
      if (!ok) return;
      bypass = true;
      if (nav.willUnload || target.origin !== location.origin) {
        location.href = target.href;
        return;
      }
      try {
        await goto(target.pathname + target.search + target.hash);
      } finally {
        bypass = false;
      }
    });
  });
}
