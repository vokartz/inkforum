<script lang="ts">
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/ChatCenteredDots';
  import SaveIcon from 'phosphor-svelte/lib/FloppyDisk';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatNumber } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  let maxLength = $state(300);
  let history = $state(30);
  let guests = $state(true);
  let saving = $state(false);
  function sync() {
    if (!data.shoutbox) return;
    ({ maxLength, history, guests } = data.shoutbox.settings);
  }
  sync();
  $effect.pre(sync);

  async function save() {
    saving = true;
    try {
      await api.put('/api/admin/shoutbox', {
        maxLength: Number(maxLength),
        history: Number(history),
        guests,
      });
      toast.success(t('Kaydedildi.'));
      await invalidate('app:admin-shoutbox');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
  async function clear() {
    if (
      !(await confirmAction({
        title: t('Tüm mesajlar silinsin mi?'),
        description: t('Sohbet kutusu boşaltılır. Bu işlem geri alınamaz.'),
        confirmLabel: t('Temizle'),
        destructive: true,
      }))
    )
      return;
    try {
      const r = await api.post<{ removed: number }>('/api/admin/shoutbox/clear');
      toast.success(t('{n} mesaj silindi.', { n: r.removed }));
      await invalidate('app:admin-shoutbox');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<PageHeader
  title={t('Sohbet kutusu')}
  description={t(
    'Üyelerin ana sayfada anlık kısa mesajlaştığı kutu. Yerini Ana sayfa düzeni ekranından değiştirebilirsiniz.',
  )}
  icon={PageHeaderIcon}
>
  {#snippet actions()}<Button variant="outline" href="/admin/home">{t('Ana sayfa düzeni')}</Button>{/snippet}
</PageHeader>

{#if data.shoutbox}
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Ayarlar')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label={t('En fazla karakter')} hint={t('Tek mesajın uzunluğu (20–1000).')}
            ><Input type="number" min={20} max={1000} bind:value={maxLength} /></Field
          >
          <Field label={t('Gösterilen mesaj sayısı')} hint={t('Kutu açılınca yüklenen son mesajlar (5–100).')}
            ><Input type="number" min={5} max={100} bind:value={history} /></Field
          >
        </div>
        <label class="flex items-start gap-3 text-sm"
          ><Switch bind:checked={guests} class="mt-0.5" /><span
            >{t('Misafirler mesajları okuyabilsin')}<span class="block text-xs text-muted-foreground"
              >{t(
                'Kapalıysa kutu yalnızca giriş yapan üyelere görünür. Yazmak her zaman üyelik ister.',
              )}</span
            ></span
          ></label
        >
        <div><Button onclick={save} disabled={saving}><SaveIcon />{t('Kaydet')}</Button></div>
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Durum')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-3 text-sm">
        <p class="flex justify-between">
          <span class="text-muted-foreground">{t('Toplam mesaj')}</span><b class="tabular-nums"
            >{formatNumber(data.shoutbox.stats.total)}</b
          >
        </p>
        <p class="flex justify-between">
          <span class="text-muted-foreground">{t('Son 24 saat')}</span><b class="tabular-nums"
            >{formatNumber(data.shoutbox.stats.today)}</b
          >
        </p>
        <p class="text-xs text-muted-foreground">
          {t(
            'Moderatörler mesajların üzerine gelip silebilir; üyeler kendi mesajlarını 10 dakika içinde silebilir.',
          )}
        </p>
        <Button variant="outline" class="text-destructive" onclick={clear}
          ><TrashIcon />{t('Tüm mesajları temizle')}</Button
        >
      </Card.Content>
    </Card.Root>
  </div>
{/if}
