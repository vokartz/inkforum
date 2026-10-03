<script lang="ts">
  import type { UserSummary } from '@forum/shared';
  import { goto, invalidate } from '$app/navigation';
  import SendIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import XIcon from 'phosphor-svelte/lib/X';
  import EnvelopeIcon from 'phosphor-svelte/lib/EnvelopeSimple';
  import TextIcon from 'phosphor-svelte/lib/TextAlignLeft';
  import UsersIcon from 'phosphor-svelte/lib/UsersThree';
  import LockIcon from 'phosphor-svelte/lib/LockSimple';
  import LightbulbIcon from 'phosphor-svelte/lib/Lightbulb';
  import BookIcon from 'phosphor-svelte/lib/BookOpenText';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import Breadcrumbs from '$lib/components/forum/Breadcrumbs.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import UserPicker from '$lib/components/UserPicker.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const s = $derived(data.viewer.settings);
  const maxRecipients = $derived(Number(s['messages.maxRecipients'] ?? 10));
  const maxLength = $derived(Number(s['messages.maxLength'] ?? 10000));
  const titleMax = 100;

  let recipients = $state<UserSummary[]>([]);
  let title = $state('');
  let body = $state('');
  let editor = $state<ReturnType<typeof Editor>>();
  $effect.pre(() => {
    if (data.recipient && !recipients.some((r) => r.id === data.recipient!.id)) recipients = [data.recipient];
  });

  const form = createForm();
  const canSend = $derived(recipients.length > 0 && title.trim().length > 0 && body.trim().length > 0 && !form.submitting);

  function add(u: UserSummary) {
    if (u.id === data.viewer.user?.id || recipients.some((r) => r.id === u.id) || recipients.length >= maxRecipients) return;
    recipients = [...recipients, u];
  }

  async function send(e?: Event) {
    e?.preventDefault();
    if (!canSend) return;
    const res = await form.submit(() => api.post<{ id: number }>('/api/messages', { recipientIds: recipients.map((r) => r.id), title, body }));
    if (!res) return;
    editor?.clearDraft?.();
    body = '';
    await invalidate('app:messages');
    await goto(`/messages/${res.id}`, { replaceState: true });
  }

  const required = 'text-[10px] font-bold tracking-wider text-destructive uppercase';
</script>

<svelte:head><title>{t('Yeni özel mesaj')}</title></svelte:head>

<Breadcrumbs items={[{ label: t('Forum'), href: '/' }, { label: t('Özel mesajlar'), href: '/messages' }]} current={t('Yeni mesaj')} />

<div class="grid gap-5" data-part="message-new">
  <header class="flex flex-wrap items-center gap-4" data-part="composer-header">
    <span class="flex size-[52px] shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><EnvelopeIcon class="size-6" weight="duotone" /></span>
    <div class="min-w-0 flex-1">
      <h1 class="text-2xl font-extrabold tracking-tight">{t('Yeni özel mesaj')}</h1>
      <p class="text-sm text-muted-foreground">
        {#if recipients.length === 1}
          <b class="text-foreground">{recipients[0]!.displayName}</b> {t('ile özel bir konu açıyorsun')}
        {:else if recipients.length > 1}
          {t('{n} üyeyle özel bir konu açıyorsun', { n: recipients.length })}
        {:else}
          {t('Bir ya da birkaç üyeyle, yalnızca katılımcıların görebildiği bir konu aç.')}
        {/if}
      </p>
    </div>
  </header>

  <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
    <form class="overflow-hidden rounded-xl border bg-card shadow-card" onsubmit={send} data-part="composer">
      <div class="flex border-b bg-panel-header">
        <span class="relative flex items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
          <TextIcon class="size-4" />{t('Mesaj')}
          <span class="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"></span>
        </span>
      </div>

      <div class="grid gap-5 p-4 sm:p-6">
        <FormMessage message={form.message} />

        <!-- Alıcılar -->
        <div class="grid gap-2">
          <div class="flex items-center gap-2">
            <label for="pm-to" class="text-sm font-semibold">{t('Kime')}</label>
            <span class={required}>{t('Gerekli')}</span>
            <span class="ml-auto text-xs text-muted-foreground tabular-nums">{recipients.length}/{maxRecipients}</span>
          </div>
          <div class={cn('grid gap-2 rounded-lg border bg-background p-2', form.error('recipientIds') && 'border-destructive')}>
            {#if recipients.length}
              <div class="flex flex-wrap gap-1.5">
                {#each recipients as r (r.id)}
                  <span class="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-0.5 pr-1 pl-0.5 text-sm font-medium">
                    <UserAvatar user={r} size={22} />{r.displayName}
                    <button
                      type="button"
                      class="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={t('{name} kaldır', { name: r.displayName })}
                      onclick={() => (recipients = recipients.filter((x) => x.id !== r.id))}
                    >
                      <XIcon class="size-3.5" />
                    </button>
                  </span>
                {/each}
              </div>
            {/if}
            {#if recipients.length < maxRecipients}
              <UserPicker placeholder={recipients.length ? t('Başka üye ekle…') : t('Üye adı yazın…')} exclude={[data.viewer.user?.id ?? 0, ...recipients.map((r) => r.id)]} onpick={add} />
            {/if}
          </div>
          {#if form.error('recipientIds')}<p class="text-xs text-destructive">{form.error('recipientIds')}</p>{/if}
        </div>

        <!-- Başlık -->
        <div class="grid gap-2">
          <div class="flex items-center gap-2">
            <label for="pm-title" class="text-sm font-semibold">{t('Başlık')}</label>
            <span class={required}>{t('Gerekli')}</span>
            <span class={cn('ml-auto text-xs tabular-nums', title.length > titleMax - 15 ? 'text-warning' : 'text-muted-foreground')}>{title.length}/{titleMax}</span>
          </div>
          <Input id="pm-title" bind:value={title} maxlength={titleMax} placeholder={t('Mesajın konusunu kısaca yaz')} class="h-11 text-base font-medium" aria-invalid={!!form.error('title')} />
          {#if form.error('title')}<p class="text-xs text-destructive">{form.error('title')}</p>{/if}
        </div>

        <!-- Mesaj -->
        <div class="grid gap-2">
          <div class="flex items-center gap-2">
            <label for="pm-body" class="text-sm font-semibold">{t('Mesaj')}</label>
            <span class={required}>{t('Gerekli')}</span>
          </div>
          <Editor bind:this={editor} id="pm-body" bind:value={body} {maxLength} minHeight={320} mentions={false} onsubmit={() => send()} draftKey="pm:new" invalid={!!form.error('body')} />
          {#if form.error('body')}<p class="text-xs text-destructive">{form.error('body')}</p>{/if}
        </div>
      </div>

      <!-- Gönder -->
      <div class="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t bg-card/95 px-4 py-3 backdrop-blur sm:px-6" data-part="composer-actions">
        <span class="flex items-center gap-2 text-sm text-muted-foreground"><LockIcon class="size-4" />{t('Yalnızca katılımcılar görebilir')}</span>
        <div class="ml-auto flex items-center gap-2">
          <Button variant="ghost" href="/messages">{t('Vazgeç')}</Button>
          <Button type="submit" size="lg" disabled={!canSend} title={t('Gönder (Ctrl+Enter)')}>
            {#if form.submitting}<LoaderIcon class="animate-spin" />{t('Gönderiliyor…')}{:else}<SendIcon weight="fill" />{t('Mesajı gönder')}{/if}
          </Button>
        </div>
      </div>
    </form>

    <!-- Yan bilgi -->
    <aside class="grid gap-4" data-part="composer-aside">
      <section class="overflow-hidden rounded-xl border bg-card">
        <div class="flex items-center gap-2 border-b px-4 py-3">
          <UsersIcon class="size-4 text-muted-foreground" />
          <p class="text-sm font-bold">{t('Katılımcılar')}</p>
          <span class="ml-auto text-xs text-muted-foreground tabular-nums">{recipients.length + 1}</span>
        </div>
        <ul class="grid gap-1 p-2">
          {#if data.viewer.user}
            <li class="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <UserAvatar user={data.viewer.user} size={32} />
              <span class="min-w-0 flex-1 truncate text-sm font-medium">{data.viewer.user.displayName}</span>
              <span class="text-xs text-muted-foreground">{t('Sen')}</span>
            </li>
          {/if}
          {#each recipients as r (r.id)}
            <li class="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <UserAvatar user={r} size={32} />
              <span class="min-w-0 flex-1">
                <UserName user={r} class="text-sm" />
                {#if r.primaryGroup}<span class="block truncate text-xs text-muted-foreground">{tc(r.primaryGroup.name)}</span>{/if}
              </span>
            </li>
          {:else}
            <li class="px-2 py-3 text-sm text-muted-foreground">{t('Henüz alıcı seçmedin.')}</li>
          {/each}
        </ul>
      </section>

      <section class="grid gap-3 rounded-xl border bg-card p-4">
        <h2 class="flex items-center gap-2 text-sm font-bold"><LightbulbIcon class="size-4 text-warning" weight="fill" />{t('İyi bir mesaj için')}</h2>
        <ul class="grid gap-2.5 text-sm text-muted-foreground">
          <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-primary"></span>{t('Başlık, mesajın neyle ilgili olduğunu anlatsın; yazışmalar listesinde böyle görünür.')}</li>
          <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-primary"></span>{t('Birden çok üye seçersen herkesin görebildiği bir grup konuşması olur.')}</li>
          <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-primary"></span>{t('Sonradan katılımcı ekleyebilir ya da konuşmadan ayrılabilirsin.')}</li>
        </ul>
        <div class="grid gap-1 border-t pt-3 text-sm">
          <a href="/policies/rules" class="flex items-center gap-2 text-link hover:underline"><BookIcon class="size-4" />{t('Forum kuralları')}</a>
        </div>
      </section>
    </aside>
  </div>
</div>
