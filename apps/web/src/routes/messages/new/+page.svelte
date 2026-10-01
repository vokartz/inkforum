<script lang="ts">
  import type { UserSummary } from '@forum/shared';
  import { goto, invalidate } from '$app/navigation';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import XIcon from 'phosphor-svelte/lib/X';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import UserPicker from '$lib/components/UserPicker.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const s = $derived(data.viewer.settings);
  const maxRecipients = $derived(Number(s['messages.maxRecipients'] ?? 10));
  const maxLength = $derived(Number(s['messages.maxLength'] ?? 10000));

  let recipients = $state<UserSummary[]>([]);
  let title = $state('');
  let body = $state('');
  $effect.pre(() => {
    if (data.recipient && !recipients.some((r) => r.id === data.recipient!.id)) recipients = [data.recipient];
  });

  const form = createForm();
  const canSend = $derived(recipients.length > 0 && body.trim().length > 0 && !form.submitting);

  function add(u: UserSummary) {
    if (
      u.id === data.viewer.user?.id ||
      recipients.some((r) => r.id === u.id) ||
      recipients.length >= maxRecipients
    )
      return;
    recipients = [...recipients, u];
  }

  async function send() {
    if (!canSend) return;
    const res = await form.submit(() =>
      api.post<{ id: number }>('/api/messages', { recipientIds: recipients.map((r) => r.id), title, body }),
    );
    if (!res) return;
    body = '';
    await invalidate('app:messages');
    await goto(`/messages/${res.id}`, { replaceState: true });
  }
</script>

<svelte:head><title>{t('Yeni mesaj')}</title></svelte:head>

<div class="flex h-full min-h-0 flex-col">
  <header class="flex items-center gap-2 border-b px-4 py-3">
    <a
      href="/messages"
      class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
      aria-label={t('Geri')}><ArrowLeftIcon class="size-5" /></a
    >
    <h2 class="text-[15px] font-semibold">{t('Yeni mesaj')}</h2>
  </header>
  <div class="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4 sm:p-5">
    <FormMessage message={form.message} />
    <Field
      label={t('Kime')}
      error={form.error('recipientIds')}
      hint={t('En fazla {n} üye. Birden çok üye seçersen grup konuşması olur.', { n: maxRecipients })}
    >
      <div class="grid gap-2">
        {#if recipients.length}
          <div class="flex flex-wrap gap-1.5">
            {#each recipients as r (r.id)}
              <span
                class="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-0.5 pr-1 pl-0.5 text-sm font-medium"
              >
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
          <UserPicker
            placeholder={t('Üye adı yazın…')}
            exclude={[data.viewer.user?.id ?? 0, ...recipients.map((r) => r.id)]}
            onpick={add}
          />
        {/if}
      </div>
    </Field>
    <Field label={t('Konu (isteğe bağlı)')} for="pm-title">
      <Input id="pm-title" bind:value={title} maxlength={100} placeholder={t('ör. Etkinlik hakkında')} />
    </Field>
    <Field label={t('Mesaj')} error={form.error('body')}>
      <Editor
        bind:value={body}
        {maxLength}
        minHeight={200}
        mentions={false}
        onsubmit={send}
        draftKey="pm:new"
      />
    </Field>
  </div>
  <footer class="flex justify-end gap-2 border-t px-4 py-3">
    <Button variant="ghost" href="/messages">{t('Vazgeç')}</Button>
    <Button onclick={send} disabled={!canSend} title={t('Gönder (Ctrl+Enter)')}>
      {#if form.submitting}<LoaderIcon class="animate-spin" />{:else}<PaperPlaneIcon />{/if}{t('Gönder')}
    </Button>
  </footer>
</div>
