<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import FunnelIcon from 'phosphor-svelte/lib/Funnel';
  import XIcon from 'phosphor-svelte/lib/X';
  import ChatTextIcon from 'phosphor-svelte/lib/ChatText';
  import ChatsIcon from 'phosphor-svelte/lib/Chats';
  import EyeIcon from 'phosphor-svelte/lib/Eye';
  import ChartIcon from 'phosphor-svelte/lib/ChartBar';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import Combobox from '$lib/components/Combobox.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import PrefixBadge from '$lib/components/forum/PrefixBadge.svelte';
  import TagChips from '$lib/components/forum/TagChips.svelte';
  import PageJump from '$lib/components/forum/PageJump.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { formatCompact, formatNumber } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const sp = $derived(page.url.searchParams);
  const r = $derived(data.results);

  // Form alanları adres çubuğuyla eşitlenir (geri / ileri gezinmede de).
  let q = $state(untrack(() => data.q));
  let type = $state<'topics' | 'posts'>('topics');
  let titleOnly = $state(false);
  let board = $state<number | null>(null);
  let tag = $state('');
  let author = $state('');
  let since = $state('all');
  let sort = $state('relevance');
  let showFilters = $state(false);
  $effect.pre(() => {
    const s = sp;
    untrack(() => {
      q = s.get('q') ?? '';
      type = s.get('type') === 'posts' ? 'posts' : 'topics';
      titleOnly = s.get('titleOnly') === '1';
      board = Number(s.get('board')) || null;
      tag = s.get('tag') ?? '';
      author = s.get('author') ?? '';
      since = s.get('since') ?? 'all';
      sort = s.get('sort') ?? 'relevance';
    });
  });
  const activeFilters = $derived([board && t('Bölüm'), tag && `#${tag}`, author && `@${author}`, since !== 'all' && t('Tarih'), titleOnly && t('Yalnızca başlık')].filter(Boolean) as string[]);

  function submit(e?: SubmitEvent, overrides: Record<string, string | null> = {}) {
    e?.preventDefault();
    const p = new URLSearchParams();
    const set = (k: string, v: string | null | undefined) => v && p.set(k, v);
    set('q', q.trim());
    set('type', type === 'posts' ? 'posts' : null);
    set('titleOnly', titleOnly && type === 'topics' ? '1' : null);
    set('board', board ? String(board) : null);
    set('tag', tag.trim().replace(/^#/, ''));
    set('author', author.trim().replace(/^@/, ''));
    set('since', since === 'all' ? null : since);
    set('sort', sort !== 'relevance' ? sort : null);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    void goto(`/search${p.size ? `?${p}` : ''}`, { keepFocus: true, noScroll: true });
  }
  function clearFilters() {
    board = null;
    tag = '';
    author = '';
    since = 'all';
    titleOnly = false;
    sort = 'relevance';
    submit();
  }

  /** Aranan ifadeyi vurgular (HTML kaçırılarak). */
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  function hl(text: string): string {
    const raw = (r?.query ?? '').trim();
    const needle = raw.length >= 5 && /[kpçt]$/i.test(raw) && !raw.includes(' ') ? raw.slice(0, -1) : raw;
    if (needle.length < 2) return esc(text);
    const pattern = new RegExp(esc(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    return esc(text).replace(pattern, (m) => `<mark class="rounded bg-primary/25 px-0.5 text-foreground">${m}</mark>`);
  }
  const SINCE = [
    { value: 'all', label: 'Her zaman' },
    { value: 'day', label: 'Son 24 saat' },
    { value: 'week', label: 'Son 7 gün' },
    { value: 'month', label: 'Son 30 gün' },
    { value: 'year', label: 'Son 1 yıl' },
  ];
  const SORT = [
    { value: 'relevance', label: 'En alakalı' },
    { value: 'newest', label: 'En yeni' },
    { value: 'oldest', label: 'En eski' },
    { value: 'replies', label: 'En çok yanıt' },
    { value: 'views', label: 'En çok görüntülenen' },
  ];
</script>

<svelte:head><title>{data.q ? t('"{q}" araması', { q: data.q }) : t('Ara')} · {data.viewer.settings['general.forumName']}</title></svelte:head>

<form onsubmit={submit} class="mb-6 grid gap-3" data-part="search-form">
  <h1 class="text-2xl font-extrabold tracking-tight">{t('Ara')}</h1>
  <div class="flex flex-wrap gap-2">
    <div class="relative min-w-0 flex-1">
      <SearchIcon class="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input bind:value={q} placeholder={t('Konu, mesaj ya da üye ara…')} class="h-12 pl-11 text-base" autofocus={!data.q} aria-label={t('Arama')} />
    </div>
    <Button type="submit" size="lg" class="h-12 px-6">{t('Ara')}</Button>
    <Button type="button" variant="outline" size="lg" class="h-12 lg:hidden" onclick={() => (showFilters = !showFilters)}><FunnelIcon />{t('Filtreler')}{#if activeFilters.length} ({activeFilters.length}){/if}</Button>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <div class="flex rounded-lg bg-muted p-1" role="radiogroup" aria-label={t('Arama türü')}>
      {#each [['topics', t('Konular'), ChatsIcon], ['posts', t('Mesajlar'), ChatTextIcon]] as [k, l, Icon] (k)}
        {@const I = Icon as typeof ChatsIcon}
        <button type="button" role="radio" aria-checked={type === k} onclick={() => ((type = k as typeof type), submit())} class={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', type === k ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          <I class="size-4" />{l}
        </button>
      {/each}
    </div>
    {#each activeFilters as f (f)}<span class="rounded-full border bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-highlight">{f}</span>{/each}
    {#if activeFilters.length}<button type="button" class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onclick={clearFilters}><XIcon class="size-3.5" />{t('Filtreleri temizle')}</button>{/if}
  </div>
</form>

<div class="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
  <!-- Filtreler -->
  <aside class={cn('grid gap-4 rounded-xl border bg-card p-4 lg:sticky lg:top-24', !showFilters && 'max-lg:hidden')} data-part="search-filters">
    <p class="flex items-center gap-2 text-sm font-bold"><FunnelIcon class="size-4" />{t('Filtreler')}</p>
    <div class="grid gap-1.5">
      <span class="text-xs font-semibold text-muted-foreground">{t('Bölüm')}</span>
      <Combobox options={data.boards.map((b) => ({ value: b.id, label: b.name, group: b.group }))} bind:value={board} placeholder={t('Tüm bölümler')} clearable onchange={() => submit()} />
    </div>
    <label class="grid gap-1.5"><span class="text-xs font-semibold text-muted-foreground">{t('Etiket')}</span><Input bind:value={tag} placeholder={t('#etiket')} onchange={() => submit()} /></label>
    <label class="grid gap-1.5"><span class="text-xs font-semibold text-muted-foreground">{t('Yazar')}</span><Input bind:value={author} placeholder={t('Kullanıcı adı')} onchange={() => submit()} /></label>
    <div class="grid gap-1.5">
      <span class="text-xs font-semibold text-muted-foreground">{t('Tarih')}</span>
      <Combobox options={SINCE.map((o) => ({ ...o, label: t(o.label) }))} bind:value={since as never} searchable={false} onchange={() => submit()} />
    </div>
    <div class="grid gap-1.5">
      <span class="text-xs font-semibold text-muted-foreground">{t('Sıralama')}</span>
      <Combobox options={(type === 'posts' ? SORT.filter((s) => s.value === 'newest' || s.value === 'oldest' || s.value === 'relevance') : SORT).map((o) => ({ ...o, label: t(o.label) }))} bind:value={sort as never} searchable={false} onchange={() => submit()} />
    </div>
    {#if type === 'topics'}
      <label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={titleOnly} onCheckedChange={() => submit()} />{t('Yalnızca başlıklarda ara')}</label>
    {/if}
  </aside>

  <!-- Sonuçlar -->
  <section class="grid min-w-0 gap-4" data-part="search-results">
    {#if !r}
      <EmptyState title={t('Ne aramak istersin?')} description={t('En az 2 karakter yaz ya da soldan bir etiket, yazar veya bölüm seç.')} />
    {:else}
      {#if r.members.length}
        <div class="rounded-xl border bg-card p-4">
          <p class="mb-3 text-xs font-bold tracking-wider text-muted-foreground uppercase">{t('Üyeler')}</p>
          <div class="flex flex-wrap gap-2">
            {#each r.members as m (m.id)}
              <a href="/u/{m.id}/{m.slug}" class="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors hover:border-primary"><UserAvatar user={m} size={28} /><UserName user={m} link={false} class="text-sm" /></a>
            {/each}
          </div>
        </div>
      {/if}

      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-muted-foreground"><b class="text-foreground">{formatNumber(r.total)}</b> {r.type === 'posts' ? t('mesaj bulundu') : t('konu bulundu')}{#if r.query} · "<b class="text-foreground">{r.query}</b>"{/if}</p>
        <PageJump page={r.page} perPage={r.perPage} total={r.total} />
      </div>

      {#if r.type === 'topics'}
        {#each r.topics as topic (topic.id)}
          <article class="grid gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 animate-rise">
            <div class="flex flex-wrap items-center gap-1.5">
              {#if topic.hasPoll}<ChartIcon class="size-4 text-primary" aria-label={t('Anket')} />{/if}
              {#if topic.prefix}<PrefixBadge prefix={topic.prefix} />{/if}
              <a href="/t/{topic.id}/{topic.slug}" class="text-base font-bold hover:text-highlight">{@html hl(topic.title)}</a>
            </div>
            {#if topic.excerpt}<p class="line-clamp-2 text-sm text-muted-foreground">{@html hl(topic.excerpt)}</p>{/if}
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span class="flex items-center gap-1.5"><UserAvatar user={topic.author ?? { displayName: topic.authorName, avatarUrl: null }} size={18} />{#if topic.author}<UserName user={topic.author} class="text-xs" />{:else}{topic.authorName}{/if}</span>
              <TimeAgo ms={topic.createdAt} />
              <a href="/f/{topic.board.id}/{topic.board.slug}" class="hover:text-foreground hover:underline">{topic.board.name}</a>
              <span class="flex items-center gap-1"><ChatsIcon class="size-3.5" />{formatCompact(topic.replyCount)}</span>
              <span class="flex items-center gap-1"><EyeIcon class="size-3.5" />{formatCompact(topic.viewCount)}</span>
              {#if topic.tags.length}<TagChips tags={topic.tags} size="xs" />{/if}
            </div>
          </article>
        {:else}
          <EmptyState title={t('Sonuç bulunamadı')} description={t('Farklı kelimeler dene ya da filtreleri gevşet.')} />
        {/each}
      {:else}
        {#each r.posts as p (p.postId)}
          <article class="grid gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 animate-rise">
            <div class="flex items-center gap-2.5">
              <UserAvatar user={p.author ?? { displayName: p.authorName, avatarUrl: null }} size={32} />
              <div class="grid min-w-0 flex-1">
                <a href="/p/{p.postId}" class="truncate text-sm font-bold hover:text-highlight">{p.isFirst ? '' : `${t('Yanıt:')} `}{p.topicTitle}</a>
                <span class="text-xs text-muted-foreground">{#if p.author}<UserName user={p.author} class="text-xs" />{:else}{p.authorName}{/if} · <TimeAgo ms={p.createdAt} /> · {p.board.name}</span>
              </div>
            </div>
            <p class="text-sm leading-relaxed">{@html hl(p.excerpt)}</p>
          </article>
        {:else}
          <EmptyState title={t('Sonuç bulunamadı')} description={t('Farklı kelimeler dene ya da filtreleri gevşet.')} />
        {/each}
      {/if}

      {#if r.total > r.perPage}<div class="flex justify-end"><PageJump page={r.page} perPage={r.perPage} total={r.total} /></div>{/if}
    {/if}
  </section>
</div>
