<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ClipboardIcon from 'phosphor-svelte/lib/ClipboardText';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import XCircleIcon from 'phosphor-svelte/lib/XCircle';
  import LockIcon from 'phosphor-svelte/lib/LockSimple';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneTilt';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import UsersIcon from 'phosphor-svelte/lib/UsersThree';
  import TrayIcon from 'phosphor-svelte/lib/Tray';
  import { Button } from '$lib/components/ui/button';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import QuestionField from '$lib/components/applications/QuestionField.svelte';
  import StatusPill from '$lib/components/applications/StatusPill.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { loginHref } from '$lib/nav-auth';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const f = $derived(data.form);
  const el = $derived(f.eligibility);
  const canApply = $derived(!!el?.ok);

  type Value = string | string[] | number | boolean | null;
  // Bağlanan alanlar tanımsız başlamasın (Svelte bind: varsayılanlı prop kuralı)
  let answers = $state<Record<string, Value>>(untrack(() => Object.fromEntries(data.form.questions.map((q) => [q.id, null]))));
  let errors = $state<Record<string, string>>({});
  let sending = $state(false);
  const answered = $derived(f.questions.filter((q) => {
    const v = answers[q.id];
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
  }).length);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    sending = true;
    errors = {};
    try {
      const res = await api.post<{ id: number }>(`/api/applications/forms/${f.slug}`, { answers });
      toast.success(t('Başvurun gönderildi. Sonuçlandığında bildirim alacaksın.'));
      await goto(`/applications/view/${res.id}`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        errors = Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k.replace(/^answers\./, ''), v]));
        toast.error(t('Lütfen işaretli soruları kontrol et.'));
        document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else toast.error(errorMessage(err));
    } finally {
      sending = false;
    }
  }
</script>

<svelte:head><title>{f.title} · {t('Başvurular')}</title></svelte:head>

<div class="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]" data-part="application-form">
  <div class="grid min-w-0 content-start gap-5">
    <a href="/applications" class="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon class="size-4" />{t('Başvurular')}</a>
    <header class="rounded-2xl border bg-card p-6">
      <div class="flex items-start gap-3.5">
        <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">{#if f.iconNodes}<NodeIcon nodes={f.iconNodes} size={22} />{:else}<ClipboardIcon class="size-6" weight="duotone" />{/if}</span>
        <div class="min-w-0">
          <h1 class="text-2xl font-bold tracking-tight">{f.title}</h1>
          <p class="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span>{t('{n} soru', { n: f.questions.length })}</span>
            {#if f.targetGroup}<span class="inline-flex items-center gap-1"><UsersIcon class="size-4" />{t('Onaylanınca:')} <b style={f.targetGroup.color ? `color:${f.targetGroup.color}` : ''}>{f.targetGroup.name}</b></span>{/if}
          </p>
        </div>
      </div>
      {#if f.descriptionHtml}<div class="prose-forum mt-4 border-t pt-4 text-[15px]">{@html f.descriptionHtml}</div>{/if}
    </header>

    {#if !data.viewer.user}
      <div class="rounded-xl border border-dashed p-6 text-center">
        <p class="mb-3 text-sm text-muted-foreground">{t('Başvuru yapmak için giriş yapmalısın.')}</p>
        <Button href={loginHref()}>{t('Giriş yap')}</Button>
      </div>
    {:else if f.myLatest && (f.myLatest.status === 'pending' || f.myLatest.status === 'reviewing')}
      <div class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-5">
        <StatusPill status={f.myLatest.status} />
        <p class="flex-1 text-sm">{t('Bu forma ait bir başvurun inceleniyor.')}</p>
        <Button href="/applications/view/{f.myLatest.id}" size="sm">{t('Başvuruma git')}</Button>
      </div>
    {:else if !canApply}
      <div class="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-5 text-sm">
        <LockIcon class="size-5 shrink-0" />{el?.blocker ?? t('Başvuru gereksinimlerini henüz karşılamıyorsun.')}
      </div>
    {:else}
      <form class="grid gap-3" onsubmit={submit}>
        {#each f.questions as q, i (q.id)}
          <QuestionField {q} index={i} bind:value={answers[q.id]} error={errors[q.id]} />
        {/each}
        <div class="sticky bottom-3 z-10 flex items-center gap-3 rounded-xl border bg-popover/95 px-4 py-3 shadow-lg backdrop-blur">
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary transition-[width] duration-300" style="width:{(answered / Math.max(1, f.questions.length)) * 100}%"></div></div>
          <span class="text-xs text-muted-foreground tabular-nums">{answered}/{f.questions.length}</span>
          <Button type="submit" disabled={sending}>{#if sending}<LoaderIcon class="animate-spin" />{:else}<PaperPlaneIcon />{/if}{t('Başvuruyu gönder')}</Button>
        </div>
      </form>
    {/if}
  </div>

  <!-- Gereksinimler -->
  <aside class="grid content-start gap-3 lg:sticky lg:top-24">
    <section class="rounded-2xl border bg-card p-4">
      <h2 class="mb-3 text-sm font-bold">{t('Gereksinimler')}</h2>
      {#if el && el.checks.length}
        <ul class="grid gap-2 text-sm">
          {#each el.checks as c (c.key)}
            <li class="flex items-start gap-2">
              {#if c.ok}<CheckCircleIcon class="mt-0.5 size-4 shrink-0 text-success" weight="fill" />{:else}<XCircleIcon class="mt-0.5 size-4 shrink-0 text-destructive" weight="fill" />{/if}
              <span class={cn(!c.ok && 'text-muted-foreground')}>{c.label}{#if c.detail}<span class="block text-xs text-muted-foreground">{t('Sende: {detail}', { detail: c.detail })}</span>{/if}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-sm text-muted-foreground">{t('Özel bir gereksinim yok.')}</p>
      {/if}
      {#if f.requirements.cooldownDays}<p class="mt-3 border-t pt-3 text-xs text-muted-foreground">{t('Reddedilen başvurudan sonra {days} gün beklemen gerekir.', { days: f.requirements.cooldownDays })}</p>{/if}
    </section>
    {#if f.canReview}<Button href="/applications/review?form={f.id}" variant="outline"><TrayIcon />{t('Başvuruları incele')}{#if f.pendingCount}<span class="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{f.pendingCount}</span>{/if}</Button>{/if}
  </aside>
</div>
