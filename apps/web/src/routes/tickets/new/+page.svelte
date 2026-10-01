<script lang="ts">
  import { TICKET_PRIORITY_LABELS, type TicketPriority } from '@forum/shared';
  import { untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import LifebuoyIcon from 'phosphor-svelte/lib/Lifebuoy';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneTilt';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import Field from '$lib/components/Field.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  let categoryId = $state<number | null>(untrack(() => data.preselect ?? (data.categories.length === 1 ? data.categories[0]!.id : null)));
  const cat = $derived(data.categories.find((c) => c.id === categoryId) ?? null);
  let subject = $state('');
  let body = $state('');
  let priority = $state<TicketPriority>('normal');
  let errors = $state<Record<string, string>>({});
  let sending = $state(false);
  $effect(() => {
    if (cat) untrack(() => (priority = cat.defaultPriority === 'urgent' ? 'high' : cat.defaultPriority));
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!categoryId) return;
    sending = true;
    errors = {};
    try {
      const res = await api.post<{ id: number }>('/api/tickets', { categoryId, subject, body, priority });
      toast.success(t('Talebin oluşturuldu. Yanıt gelince bildirim alacaksın.'));
      await goto(`/tickets/${res.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        errors = err.fields;
        toast.error(Object.values(err.fields)[0] ?? err.message);
      } else toast.error(errorMessage(err));
    } finally {
      sending = false;
    }
  }
</script>

<svelte:head><title>{t('Yeni destek talebi')}</title></svelte:head>

<div class="mx-auto grid max-w-4xl gap-6" data-part="ticket-new">
  <a href="/tickets" class="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon class="size-4" />{t('Destek')}</a>
  <div>
    <h1 class="text-2xl font-extrabold tracking-tight">{t('Yeni destek talebi')}</h1>
    <p class="text-sm text-muted-foreground">{t('Önce konuyu seç; talebin ilgili ekibe iletilir.')}</p>
  </div>

  <div class="grid gap-3 sm:grid-cols-2">
    {#each data.categories as c (c.id)}
      {@const on = c.id === categoryId}
      <button
        type="button"
        onclick={() => (categoryId = c.id)}
        class={cn('flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5', on ? 'border-primary ring-2 ring-primary/25' : 'hover:border-primary/40')}
        aria-pressed={on}
      >
        <span class="flex size-10 shrink-0 items-center justify-center rounded-lg" style="background:color-mix(in oklch, {c.color ?? 'var(--primary)'} 15%, transparent);color:{c.color ?? 'var(--primary)'}">
          {#if c.iconNodes}<NodeIcon nodes={c.iconNodes} size={20} />{:else}<LifebuoyIcon class="size-5" />{/if}
        </span>
        <span class="min-w-0 flex-1"><b class="block">{tc(c.name)}</b>{#if c.description}<span class="text-sm text-muted-foreground">{tc(c.description)}</span>{/if}</span>
        {#if on}<CheckCircleIcon class="size-5 shrink-0 text-primary" weight="fill" />{/if}
      </button>
    {/each}
  </div>

  {#if cat}
    <form class="grid gap-4 rounded-2xl border bg-card p-5 sm:p-6" onsubmit={submit} transition:slide={{ duration: 200 }}>
      {#if cat.introHtml}<div class="prose-forum rounded-lg bg-muted/50 p-4 text-sm">{@html cat.introHtml}</div>{/if}
      <Field label={t('Konu')} error={errors.subject}><Input bind:value={subject} maxlength={160} placeholder={t('Sorunu kısaca özetle')} class="h-11" /></Field>
      <Field label={t('Öncelik')}>
        <div class="flex flex-wrap gap-1.5">
          {#each ['low', 'normal', 'high'] as p (p)}
            <button type="button" onclick={() => (priority = p as TicketPriority)} class={cn('rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors', priority === p ? 'border-primary bg-primary-soft text-highlight' : 'hover:bg-accent')}>{t(TICKET_PRIORITY_LABELS[p as TicketPriority])}</button>
          {/each}
        </div>
      </Field>
      <Field label={t('Açıklama')} error={errors.body} hint={t('Ne oldu, ne zaman oldu, neler denedin? Ekran görüntüsü ekleyebilirsin.')}>
        <Editor bind:value={body} minHeight={220} maxLength={20000} mentions={false} placeholder={t('Sorunu ayrıntılı anlat…')} uploadUrl="/api/tickets/images" />
      </Field>
      <div class="flex justify-end"><Button type="submit" disabled={sending || subject.trim().length < 3}>{#if sending}<LoaderIcon class="animate-spin" />{:else}<PaperPlaneIcon />{/if}{t('Talebi gönder')}</Button></div>
    </form>
  {/if}
</div>
