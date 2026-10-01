<script lang="ts">
  import type { DiscordWidget } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/DiscordLogo';
  import SaveIcon from 'phosphor-svelte/lib/FloppyDisk';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneTilt';
  import CheckIcon from 'phosphor-svelte/lib/CheckCircle';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import { api, errorMessage } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  let webhookUrl = $state('');
  let boardIds = $state<number[]>([]);
  let replies = $state(false);
  let guildId = $state('');
  let inviteUrl = $state('');
  let widget = $state<DiscordWidget | null>(null);
  const form = createForm();

  function sync() {
    if (!data.discord) return;
    ({ boardIds, replies, guildId, inviteUrl } = data.discord);
    webhookUrl = '';
  }
  sync();
  $effect.pre(sync);

  const boardOptions = $derived(
    (data.forum?.categories ?? []).flatMap((c) =>
      c.boards
        .flatMap((b) => [b, ...b.children])
        .map((b) => ({ value: b.id, label: tc(b.name), group: tc(c.name) })),
    ),
  );

  async function save() {
    const res = await form.submit(
      () =>
        api.put<{ widget: DiscordWidget | null }>('/api/admin/discord', {
          webhookUrl: webhookUrl.trim() || (data.discord?.hasWebhook ? 'keep' : ''),
          boardIds,
          replies,
          guildId: guildId.trim(),
          inviteUrl: inviteUrl.trim(),
        }),
      { success: t('Kaydedildi.') },
    );
    if (!res) return;
    widget = res.widget;
    await invalidate('app:admin-discord');
  }
  async function removeWebhook() {
    await form.submit(
      () => api.put('/api/admin/discord', { webhookUrl: '', boardIds, replies, guildId, inviteUrl }),
      { success: t('Webhook kaldırıldı.') },
    );
    await invalidate('app:admin-discord');
  }
  async function test() {
    try {
      await api.post('/api/admin/discord/test');
      toast.success(t('Deneme mesajı gönderildi; Discord kanalınızı kontrol edin.'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<PageHeader
  title={t('Discord entegrasyonu')}
  description={t(
    'Yeni konuları Discord kanalınıza gönderin ve ana sayfada sunucunuzun çevrimiçi sayısını gösterin.',
  )}
  icon={PageHeaderIcon}
/>

{#if data.discord}
  <div class="grid gap-6 lg:grid-cols-2">
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">{t('Kanal bildirimleri (webhook)')}</Card.Title>
        <Card.Description
          >{t(
            'Discord’da kanal ayarları → Entegrasyonlar → Webhook’lar → Yeni Webhook → "Webhook URL’sini kopyala".',
          )}</Card.Description
        >
      </Card.Header>
      <Card.Content class="grid gap-4">
        <Field
          label={t('Webhook adresi')}
          error={form.error('webhookUrl')}
          hint={data.discord.hasWebhook
            ? t('Bir webhook kayıtlı. Değiştirmek için yenisini yapıştırın.')
            : null}
        >
          <Input
            bind:value={webhookUrl}
            type="password"
            autocomplete="off"
            placeholder={data.discord.hasWebhook ? '••••••••••••' : 'https://discord.com/api/webhooks/…'}
            aria-invalid={!!form.error('webhookUrl')}
          />
        </Field>
        <Field
          label={t('Bölümler')}
          hint={t(
            'Boş bırakırsanız misafirlerin görebildiği tüm bölümlerdeki yeni konular gönderilir. Gizli ve onay bekleyen konular hiçbir zaman gönderilmez.',
          )}
        >
          <Combobox
            multiple
            options={boardOptions}
            bind:value={boardIds}
            placeholder={t('Tüm herkese açık bölümler')}
          />
        </Field>
        <label class="flex items-start gap-3 text-sm"
          ><Switch bind:checked={replies} class="mt-0.5" /><span
            >{t('Yanıtları da gönder')}<span class="block text-xs text-muted-foreground"
              >{t('Kalabalık forumlarda kanalı doldurabilir.')}</span
            ></span
          ></label
        >
        <div class="flex flex-wrap gap-2">
          <Button onclick={save} disabled={form.submitting}><SaveIcon />{t('Kaydet')}</Button>
          {#if data.discord.hasWebhook}
            <Button variant="outline" onclick={test}><PaperPlaneIcon />{t('Deneme mesajı gönder')}</Button>
            <Button variant="ghost" class="text-destructive" onclick={removeWebhook}
              >{t('Webhook’u kaldır')}</Button
            >
          {/if}
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">{t('Sunucu widget’ı')}</Card.Title>
        <Card.Description
          >{t(
            'Discord’da Sunucu Ayarları → Widget → "Sunucu Widget’ını Etkinleştir" açın ve Sunucu Kimliği’ni kopyalayın.',
          )}</Card.Description
        >
      </Card.Header>
      <Card.Content class="grid gap-4">
        <Field label={t('Sunucu kimliği')} error={form.error('guildId')}
          ><Input bind:value={guildId} inputmode="numeric" placeholder="123456789012345678" /></Field
        >
        <Field
          label={t('Davet bağlantısı (isteğe bağlı)')}
          error={form.error('inviteUrl')}
          hint={t('Boşsa widget’ın davet bağlantısı kullanılır.')}
          ><Input bind:value={inviteUrl} placeholder="https://discord.gg/…" /></Field
        >
        <div><Button onclick={save} disabled={form.submitting}><SaveIcon />{t('Kaydet')}</Button></div>
        {#if widget}
          <p class="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            <CheckIcon class="size-4" />{t('{name}: {n} çevrimiçi', {
              name: widget.name,
              n: formatNumber(widget.online),
            })}
          </p>
        {:else if guildId && data.discord.guildId}
          <p class="text-xs text-muted-foreground">
            {t('Widget verisi alınamazsa Discord’da widget’ın açık olduğundan emin olun.')}
          </p>
        {/if}
        <p class="text-xs text-muted-foreground">
          {t(
            'Ana sayfada göstermek için Ana sayfa düzeni ekranından "Discord sunucusu" bloğunu ekleyin (eklenti açılınca yan sütuna otomatik eklenir).',
          )}
        </p>
      </Card.Content>
    </Card.Root>
  </div>
{/if}
