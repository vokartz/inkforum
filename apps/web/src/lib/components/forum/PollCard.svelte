<script lang="ts">
  import type { PollView, PollVoter } from '@forum/shared';
  import { toast } from 'svelte-sonner';
  import ChartIcon from 'phosphor-svelte/lib/ChartBar';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import LockIcon from 'phosphor-svelte/lib/LockSimple';
  import LockOpenIcon from 'phosphor-svelte/lib/LockSimpleOpen';
  import UsersIcon from 'phosphor-svelte/lib/Users';
  import ArrowCounterIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import DotsIcon from 'phosphor-svelte/lib/DotsThreeVertical';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import ClockIcon from 'phosphor-svelte/lib/Clock';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import UserAvatar from '../UserAvatar.svelte';
  import UserName from '../UserName.svelte';
  import TimeAgo from '../TimeAgo.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDateTime, formatNumber } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { poll: initial, topicId, ondelete }: { poll: PollView; topicId: number; ondelete?: () => void } = $props();
  // Sunucudan yeni veri gelene kadar yerel olarak güncellenebilir.
  let poll = $derived(initial);

  let changing = $state(false);
  // Oy değiştirirken mevcut seçimle başlar; yerel olarak değiştirilebilir.
  let selected = $derived<number[]>(changing ? [...poll.myVotes] : []);
  let peek = $state(false);
  let busy = $state(false);
  const voted = $derived(poll.myVotes.length > 0);
  const showForm = $derived(poll.can.vote && ((!voted && !peek) || changing));
  const total = $derived(poll.options.reduce((n, o) => n + (o.votes ?? 0), 0));
  const multi = $derived(poll.maxChoices > 1);

  function toggle(id: number) {
    if (!multi) selected = [id];
    else if (selected.includes(id)) selected = selected.filter((x) => x !== id);
    else if (selected.length < poll.maxChoices) selected = [...selected, id];
    else toast.info(t('En fazla {n} seçenek işaretleyebilirsin.', { n: poll.maxChoices }));
  }

  async function run(fn: () => Promise<PollView>) {
    busy = true;
    try {
      poll = await fn();
      changing = false;
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = false;
    }
  }
  const vote = () => run(() => api.post<PollView>(`/api/topics/${topicId}/poll/vote`, { optionIds: selected }));
  const unvote = () => run(() => api.delete<PollView>(`/api/topics/${topicId}/poll/vote`));
  const setClosed = (closed: boolean) => run(() => api.post<PollView>(`/api/topics/${topicId}/poll/close`, { closed }));
  async function remove() {
    if (!(await confirmAction({ title: t('Anket silinsin mi?'), description: t('Tüm oylar da silinir.'), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/topics/${topicId}/poll`);
      toast.success(t('Anket silindi.'));
      ondelete?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  let votersOpen = $state(false);
  let voters = $state<PollVoter[] | null>(null);
  async function openVoters() {
    votersOpen = true;
    voters = null;
    try {
      voters = await api.get<PollVoter[]>(`/api/topics/${topicId}/poll/voters`);
    } catch (e) {
      toast.error(errorMessage(e));
      votersOpen = false;
    }
  }
  const pct = (v: number | null) => (total ? Math.round(((v ?? 0) / total) * 1000) / 10 : 0);
  const winner = $derived(Math.max(0, ...poll.options.map((o) => o.votes ?? 0)));
</script>

<section class="overflow-hidden rounded-xl border bg-card shadow-card animate-rise" data-part="poll">
  <header class="flex items-start gap-3 border-b px-4 py-3.5 sm:px-5">
    <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><ChartIcon class="size-5" weight="duotone" /></span>
    <div class="min-w-0 flex-1">
      <h2 class="text-base leading-snug font-bold">{poll.question}</h2>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span class="inline-flex items-center gap-1"><UsersIcon class="size-3.5" />{t('{n} kişi oy verdi', { n: formatNumber(poll.voterCount) })}</span>
        {#if multi}<span>{t('En fazla {n} seçim', { n: poll.maxChoices })}</span>{/if}
        {#if poll.closed}<span class="inline-flex items-center gap-1 font-semibold text-warning"><LockIcon class="size-3.5" />{t('Anket kapandı')}</span>
        {:else if poll.closesAt}<span class="inline-flex items-center gap-1" title={formatDateTime(poll.closesAt)}><ClockIcon class="size-3.5" />{t('Bitiş:')} <TimeAgo ms={poll.closesAt} /></span>{/if}
      </p>
    </div>
    {#if poll.can.manage}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}<Button {...props} variant="ghost" size="icon-sm" aria-label={t('Anket işlemleri')}><DotsIcon weight="bold" /></Button>{/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          {#if poll.closed}<DropdownMenu.Item onSelect={() => setClosed(false)}><LockOpenIcon />{t('Anketi yeniden aç')}</DropdownMenu.Item>
          {:else}<DropdownMenu.Item onSelect={() => setClosed(true)}><LockIcon />{t('Anketi kapat')}</DropdownMenu.Item>{/if}
          <DropdownMenu.Item onSelect={openVoters}><UsersIcon />{t('Oy verenler')}</DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item variant="destructive" onSelect={remove}><TrashIcon />{t('Anketi sil')}</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  </header>

  <div class="grid gap-2 p-4 sm:p-5">
    {#if showForm}
      {#each poll.options as o (o.id)}
        {@const on = selected.includes(o.id)}
        <button
          type="button"
          class={cn('flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors', on ? 'border-primary bg-primary-soft' : 'hover:border-foreground/30 hover:bg-accent/50')}
          onclick={() => toggle(o.id)}
          aria-pressed={on}
        >
          <span class={cn('flex size-5 shrink-0 items-center justify-center border-2 transition-colors', multi ? 'rounded' : 'rounded-full', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50')}>
            {#if on}<CheckIcon class="size-3" weight="bold" />{/if}
          </span>
          <span class="font-medium">{o.label}</span>
        </button>
      {/each}
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <Button onclick={vote} disabled={busy || !selected.length}>{#if busy}<LoaderIcon class="animate-spin" />{:else}<CheckIcon weight="bold" />{/if}{t('Oy ver')}</Button>
        {#if changing}<Button variant="ghost" onclick={() => (changing = false)}>{t('Vazgeç')}</Button>{/if}
        {#if poll.can.seeResults && !changing && poll.voterCount > 0}<Button variant="ghost" onclick={() => (peek = true)}><ChartIcon />{t('Sonuçları gör')}</Button>{/if}
      </div>
    {:else}
      {#each poll.options as o (o.id)}
        {@const mine = poll.myVotes.includes(o.id)}
        {@const p = pct(o.votes)}
        <div class="grid gap-1.5">
          <div class="flex items-center gap-2 text-sm">
            <span class={cn('font-medium', mine && 'text-highlight')}>{o.label}</span>
            {#if mine}<span class="inline-flex items-center gap-0.5 rounded bg-primary-soft px-1.5 text-[10px] font-bold text-highlight"><CheckIcon class="size-3" weight="bold" />{t('Oyun')}</span>{/if}
            {#if o.votes !== null}<span class="ml-auto text-xs text-muted-foreground tabular-nums"><b class="text-foreground">{t('%{p}', { p })}</b> · {t('{n} oy', { n: formatNumber(o.votes) })}</span>{/if}
          </div>
          {#if o.votes !== null}
            <div class="h-2.5 overflow-hidden rounded-full bg-muted">
              <div class={cn('h-full rounded-full transition-[width] duration-700', o.votes === winner && winner > 0 ? 'bg-primary' : 'bg-primary/45')} style="width:{p}%"></div>
            </div>
          {/if}
        </div>
      {/each}
      {#if !poll.can.seeResults}
        <p class="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <EyeSlashIcon class="size-4" />{poll.showResults === 'after_close' ? t('Sonuçlar anket kapanınca görünecek.') : t('Sonuçları görmek için oy verin.')}
        </p>
      {/if}
      <div class="mt-1 flex flex-wrap items-center gap-2">
        {#if poll.can.vote && !voted && peek}<Button size="sm" onclick={() => (peek = false)}><CheckIcon weight="bold" />{t('Oy ver')}</Button>{/if}
        {#if poll.can.vote && voted}
          <Button variant="outline" size="sm" onclick={() => (changing = true)}>{t('Oyumu değiştir')}</Button>
          <Button variant="ghost" size="sm" onclick={unvote} disabled={busy}><ArrowCounterIcon />{t('Oyumu geri al')}</Button>
        {/if}
        {#if poll.publicVotes && poll.voterCount > 0 && poll.can.seeResults}<Button variant="ghost" size="sm" onclick={openVoters}><UsersIcon />{t('Kim ne dedi?')}</Button>{/if}
      </div>
    {/if}
  </div>
</section>

<Dialog.Root bind:open={votersOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header><Dialog.Title>{t('Oy verenler')}</Dialog.Title><Dialog.Description>{poll.question}</Dialog.Description></Dialog.Header>
    <div class="grid max-h-[60vh] gap-4 overflow-y-auto">
      {#if !voters}
        <p class="flex items-center gap-2 text-sm text-muted-foreground"><LoaderIcon class="animate-spin" />{t('Yükleniyor…')}</p>
      {:else}
        {#each poll.options as o (o.id)}
          {@const list = voters.filter((v) => v.optionId === o.id)}
          <div class="grid gap-1.5">
            <p class="text-xs font-bold text-muted-foreground uppercase">{o.label} · {list.length}</p>
            {#each list as v (v.user.id)}
              <div class="flex items-center gap-2 text-sm"><UserAvatar user={v.user} size={24} /><UserName user={v.user} /><TimeAgo ms={v.at} class="ml-auto text-xs text-muted-foreground" /></div>
            {:else}<p class="text-xs text-muted-foreground">{t('Oy yok.')}</p>{/each}
          </div>
        {/each}
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
