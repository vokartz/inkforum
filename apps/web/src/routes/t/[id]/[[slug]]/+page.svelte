<script lang="ts">
  import ModeratorList from '$lib/components/forum/ModeratorList.svelte';
  import { onMount, tick } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { goto, invalidateAll, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import type { ForumIndex, Paginated, PostRevisionItem, TopicMember, TopicRelated, TopicTag, TopicViewerItem, UserSummary } from '@forum/shared';
  import PinIcon from 'phosphor-svelte/lib/PushPin';
  import LockIcon from 'phosphor-svelte/lib/Lock';
  import LockOpenIcon from 'phosphor-svelte/lib/LockOpen';
  import StarIcon from 'phosphor-svelte/lib/Star';
  import ShieldIcon from 'phosphor-svelte/lib/Shield';
  import MoveIcon from 'phosphor-svelte/lib/ArrowRight';
  import MergeIcon from 'phosphor-svelte/lib/GitMerge';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import Trash2Icon from 'phosphor-svelte/lib/Trash';
  import RotateCcwIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import HiddenIcon from 'phosphor-svelte/lib/LockKey';
  import QuoteIcon from 'phosphor-svelte/lib/Quotes';
  import ReplyIcon from 'phosphor-svelte/lib/ArrowBendUpLeft';
  import SendIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import EyeIcon from 'phosphor-svelte/lib/Eye';
  import MessageSquareIcon from 'phosphor-svelte/lib/ChatCenteredText';
  import XIcon from 'phosphor-svelte/lib/X';
  import InfoIcon from 'phosphor-svelte/lib/Info';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import Breadcrumbs from '$lib/components/forum/Breadcrumbs.svelte';
  import PostCard from '$lib/components/forum/PostCard.svelte';
  import PageJump from '$lib/components/forum/PageJump.svelte';
  import PrefixBadge from '$lib/components/forum/PrefixBadge.svelte';
  import TagChips from '$lib/components/forum/TagChips.svelte';
  import TopicRow from '$lib/components/forum/TopicRow.svelte';
  import ShareIcon from 'phosphor-svelte/lib/ShareNetwork';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import TagInput from '$lib/components/forum/TagInput.svelte';
  import PollCard from '$lib/components/forum/PollCard.svelte';
  import BellIcon from 'phosphor-svelte/lib/BellRinging';
  import BellSimpleIcon from 'phosphor-svelte/lib/BellSimple';
  import HashIcon from 'phosphor-svelte/lib/Hash';
  import UsersIcon from 'phosphor-svelte/lib/Users';
  import Editor from '$lib/components/editor/Editor.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserPicker from '$lib/components/UserPicker.svelte';
  import UserPlusIcon from 'phosphor-svelte/lib/UserPlus';
  import UserName from '$lib/components/UserName.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatNumber, formatDateTime } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const tv = $derived(data.topic);
  const topic = $derived(tv.topic);
  const viewer = $derived(data.viewer);
  const canReply = $derived(!tv.replyBlockedReason);

  let reply = $state('');
  let sending = $state(false);
  let editor = $state<ReturnType<typeof Editor> | null>(null);
  let replyBox = $state<HTMLElement | null>(null);

  // ----- Çoklu alıntı (oturum boyunca konu başına saklanır) -----
  const MQ_KEY = $derived(`forum:mq:${topic.id}`);
  let multi = $state<number[]>([]);
  onMount(() => {
    try {
      multi = JSON.parse(sessionStorage.getItem(MQ_KEY) ?? '[]');
    } catch {
      multi = [];
    }
  });
  function saveMulti() {
    try {
      sessionStorage.setItem(MQ_KEY, JSON.stringify(multi));
    } catch {
      /* yoksay */
    }
  }
  function toggleMulti(id: number) {
    multi = multi.includes(id) ? multi.filter((x) => x !== id) : [...multi, id];
    saveMulti();
  }

  async function fetchQuote(postId: number): Promise<string> {
    return (await api.get<{ bbcode: string }>(`/api/posts/${postId}/quote`)).bbcode;
  }

  async function scrollToReply() {
    await tick();
    replyBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    editor?.focus();
  }

  async function quote(postId: number) {
    try {
      editor?.insertBBCode(await fetchQuote(postId));
      await scrollToReply();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function quoteMulti() {
    try {
      const parts = await Promise.all([...multi].sort((a, b) => a - b).map(fetchQuote));
      editor?.insertBBCode(parts.join(''));
      multi = [];
      saveMulti();
      await scrollToReply();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  // ----- Seçili metni alıntıla -----
  let selQuote = $state<{ x: number; y: number; text: string; postId: number; author: string } | null>(null);
  function onSelection() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!sel || !text || !canReply || sel.rangeCount === 0) {
      selQuote = null;
      return;
    }
    const range = sel.getRangeAt(0);
    const body = (range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest('[data-part="post-body"]');
    const article = body?.closest<HTMLElement>('[data-post-id]');
    if (!body || !article) {
      selQuote = null;
      return;
    }
    const postId = Number(article.dataset.postId);
    const post = tv.posts.items.find((p) => p.id === postId);
    const rect = range.getBoundingClientRect();
    selQuote = { x: rect.left + rect.width / 2, y: rect.top, text: text.slice(0, 5000), postId, author: post?.author?.displayName ?? post?.authorName ?? '' };
  }
  function quoteSelection() {
    if (!selQuote) return;
    const author = selQuote.author.replace(/["\]\n]/g, '');
    editor?.insertBBCode(`[quote author="${author}" post=${selQuote.postId}]\n${selQuote.text}\n[/quote]\n`);
    window.getSelection()?.removeAllRanges();
    selQuote = null;
    void scrollToReply();
  }

  // ----- Yanıt -----
  async function sendReply() {
    if (sending || !reply.trim()) return;
    sending = true;
    try {
      const res = await api.post<{ postId: number; approved: boolean; location: { page: number } }>(`/api/topics/${topic.id}/posts`, { body: reply });
      editor?.clearDraft();
      reply = '';
      if (!res.approved) toast.info(t('Mesajınız moderatör onayından sonra yayınlanacak.'));
      const target = `/t/${topic.id}/${topic.slug}${res.location.page > 1 ? `?page=${res.location.page}` : ''}#post-${res.postId}`;
      if (res.location.page === tv.posts.page) {
        await invalidateAll();
        highlight(res.postId);
      } else {
        await goto(target);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      sending = false;
    }
  }

  function highlight(postId: number) {
    void tick().then(() => {
      const el = document.getElementById(`post-${postId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-primary/60');
      setTimeout(() => el.classList.remove('ring-2', 'ring-primary/60'), 2200);
    });
  }

  onMount(() => {
    if (data.jumpTo) {
      const url = new URL(page.url);
      if (tv.posts.page > 1) url.searchParams.set('page', String(tv.posts.page));
      else url.searchParams.delete('page');
      url.hash = `post-${data.jumpTo}`;
      replaceState(url, page.state);
      highlight(data.jumpTo);
    } else if (location.hash.startsWith('#post-')) {
      highlight(Number(location.hash.slice(6)));
    }
  });

  // ----- Moderasyon -----
  async function mod(action: string, message: string) {
    try {
      await api.post(`/api/mod/topics/${topic.id}/${action}`);
      toast.success(message);
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function deleteTopic() {
    if (!(await confirmAction({ title: t('Konu silinsin mi?'), description: t('Konu ve tüm mesajları çöp kutusuna taşınacak.'), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/mod/topics/${topic.id}`);
      toast.success(t('Konu silindi.'));
      await goto(`/f/${tv.board.id}/${tv.board.slug}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  let editOpen = $state(false);
  let editTitle = $state('');
  let editPrefix = $state<number | null>(null);
  function openEdit() {
    editTitle = topic.title;
    editPrefix = topic.prefix?.id ?? null;
    editOpen = true;
  }
  async function saveEdit() {
    try {
      await api.put(`/api/mod/topics/${topic.id}`, { title: editTitle, prefixId: editPrefix });
      editOpen = false;
      toast.success(t('Konu güncellendi.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  let moveOpen = $state(false);
  let moveTarget = $state<number | null>(null);
  let moveRedirect = $state(true);
  let moveOptions = $state<Array<{ value: number; label: string; group: string }>>([]);
  async function openMove() {
    moveOpen = true;
    moveTarget = null;
    try {
      const idx = await api.get<ForumIndex>('/api/forum');
      moveOptions = idx.categories.flatMap((c) =>
        c.boards
          .filter((b) => b.type === 'forum')
          .flatMap((b) => [
            { value: b.id, label: b.name, group: c.name },
            ...b.children.filter((ch) => ch.type === 'forum').map((ch) => ({ value: ch.id, label: `↳ ${ch.name}`, group: c.name })),
          ])
          .filter((o) => o.value !== topic.boardId),
      );
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function doMove() {
    if (!moveTarget) return;
    try {
      await api.post(`/api/mod/topics/${topic.id}/move`, { boardId: moveTarget, leaveRedirect: moveRedirect });
      moveOpen = false;
      toast.success(t('Konu taşındı.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  // ----- Gizli konu üyeleri (yetkililer başka üyeleri konuya ekleyebilir) -----
  let membersOpen = $state(false);
  let members = $state<TopicMember[] | null>(null);
  async function openMembers() {
    membersOpen = true;
    members = null;
    try {
      members = (await api.get<{ items: TopicMember[] }>(`/api/mod/topics/${topic.id}/members`)).items;
    } catch (e) {
      toast.error(errorMessage(e));
      members = [];
    }
  }
  async function addMember(u: UserSummary) {
    try {
      members = (await api.post<{ items: TopicMember[] }>(`/api/mod/topics/${topic.id}/members`, { userId: u.id })).items;
      toast.success(t('{name} konuya eklendi.', { name: u.displayName }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function removeMember(u: UserSummary) {
    try {
      members = (await api.delete<{ items: TopicMember[] }>(`/api/mod/topics/${topic.id}/members/${u.id}`)).items;
      toast.success(t('{name} konudan çıkarıldı.', { name: u.displayName }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  let mergeOpen = $state(false);
  let mergeInput = $state('');
  async function doMerge() {
    const m = /(?:\/t\/)?(\d+)/.exec(mergeInput.trim());
    if (!m) return toast.error(t('Hedef konunun numarasını veya bağlantısını girin.'));
    try {
      const res = await api.post<{ topicId: number }>(`/api/mod/topics/${topic.id}/merge`, { targetTopicId: Number(m[1]) });
      mergeOpen = false;
      toast.success(t('Konular birleştirildi.'));
      await goto(`/t/${res.topicId}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  // ----- Düzenleme geçmişi -----
  let historyOpen = $state(false);
  let history = $state<PostRevisionItem[] | null>(null);
  async function openHistory(postId: number) {
    historyOpen = true;
    history = null;
    try {
      history = await api.get<PostRevisionItem[]>(`/api/posts/${postId}/revisions`);
    } catch (e) {
      toast.error(errorMessage(e));
      historyOpen = false;
    }
  }

  // ---------- Alt gezinme (benzer konular, sonraki okunmamış) ----------
  let related = $state<TopicRelated | null>(null);
  $effect(() => {
    const id = topic.id;
    related = null;
    api
      .get<TopicRelated>(`/api/topics/${id}/related`)
      .then((r) => {
        if (topic.id === id) related = r;
      })
      .catch(() => undefined);
  });
  async function share() {
    try {
      await navigator.clipboard.writeText(`${page.url.origin}/t/${topic.id}/${topic.slug}`);
      toast.success(t('Konu bağlantısı kopyalandı.'));
    } catch {
      toast.error(t('Kopyalanamadı.'));
    }
  }

  // ---------- Takip, etiketler, görüntüleyenler ----------
  let subscribed = $derived(tv.subscribed);
  let subBusy = $state(false);
  async function toggleSubscribe() {
    subBusy = true;
    try {
      const res = await api.put<{ subscribed: boolean }>(`/api/topics/${topic.id}/subscription`, { on: !subscribed });
      subscribed = res.subscribed;
      toast.success(res.subscribed ? t('Konuyu takip ediyorsun; yeni yanıtlarda bildirim alacaksın.') : t('Konu takibi bırakıldı.'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      subBusy = false;
    }
  }

  let tags = $derived<TopicTag[]>(tv.tags);
  const canEditTags = $derived(tv.tagging.enabled && (tv.can.editTopic || (tv.can.editOwnTopic && !topic.isLocked)));
  let tagsOpen = $state(false);
  let tagDraft = $state<string[]>([]);
  let tagSaving = $state(false);
  function openTags() {
    tagDraft = tags.map((x) => x.name);
    tagsOpen = true;
  }
  async function saveTags() {
    tagSaving = true;
    try {
      tags = await api.put<TopicTag[]>(`/api/topics/${topic.id}/tags`, { tags: tagDraft });
      tagsOpen = false;
      toast.success(t('Etiketler güncellendi.'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      tagSaving = false;
    }
  }

  let viewersOpen = $state(false);
  let viewersData = $state<Paginated<TopicViewerItem> | null>(null);
  async function openViewers(p = 1) {
    viewersOpen = true;
    try {
      viewersData = await api.get<Paginated<TopicViewerItem>>(`/api/topics/${topic.id}/viewers?page=${p}`);
    } catch (e) {
      toast.error(errorMessage(e));
      viewersOpen = false;
    }
  }

  const showMod = $derived(tv.can.pin || tv.can.lock || tv.can.move || tv.can.merge || tv.can.editTopic || tv.can.deleteTopic || tv.can.approve || tv.can.lockOwn);
</script>

<svelte:head><title>{topic.title} · {viewer.settings['general.forumName']}</title></svelte:head>
<svelte:document onselectionchange={onSelection} />

<Breadcrumbs items={tv.breadcrumbs} />

<header data-part="topic-header" class="mb-5 flex animate-in flex-wrap items-start gap-4 duration-300 fade-in-0">
  <div class="min-w-0 flex-1 basis-full sm:basis-0">
    <h1 class="flex flex-wrap items-center gap-2 text-2xl leading-tight font-semibold tracking-tight">
      {#if topic.isPinned}<PinIcon class="size-5 -rotate-45 text-primary" aria-label={t('Sabit')} />{/if}
      {#if topic.isLocked}<LockIcon class="size-5 text-muted-foreground" aria-label={t('Kilitli')} />{/if}
      {#if topic.isFeatured}<StarIcon class="size-5 text-amber-400" weight="fill" aria-label={t('Öne çıkan')} />{/if}
      {#if topic.prefix}<PrefixBadge prefix={topic.prefix} class="text-xs" />{/if}
      <span class="min-w-0 break-words">{topic.title}</span>
    </h1>
    <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span class="flex items-center gap-1.5">
        <UserAvatar user={topic.author ?? { displayName: topic.authorName || '?', avatarUrl: null }} size={20} />
        {#if topic.author}<UserName user={topic.author} />{:else}{topic.authorName}{/if}
      </span>
      <span title={formatDateTime(topic.createdAt)}><TimeAgo ms={topic.createdAt} /></span>
      <span class="flex items-center gap-1"><MessageSquareIcon class="size-3.5" />{t('{n} yanıt', { n: formatNumber(topic.replyCount) })}</span>
      <span class="flex items-center gap-1"><EyeIcon class="size-3.5" />{t('{n} görüntülenme', { n: formatNumber(topic.viewCount) })}</span>
      <ModeratorList moderators={tv.moderators} compact />
    </div>
    {#if tags.length || canEditTags}
      <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
        <TagChips {tags} />
        {#if canEditTags}
          <button type="button" class="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground" onclick={openTags}>
            <HashIcon class="size-3" />{tags.length ? t('Düzenle') : t('Etiket ekle')}
          </button>
        {/if}
      </div>
    {/if}
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <Button variant="ghost" size="icon" onclick={share} class="text-muted-foreground" title={t('Bağlantıyı kopyala')} aria-label={t('Bağlantıyı kopyala')}><ShareIcon /></Button>
    {#if showMod}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}<Button {...props} variant="outline" title={t('Moderasyon')}><ShieldIcon /><span class="max-sm:sr-only">{t('Moderasyon')}</span></Button>{/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-56">
          {#if tv.can.approve && !topic.isApproved}<DropdownMenu.Item onSelect={() => mod('approve', t('Konu onaylandı.'))}><ShieldCheckIcon />{t('Konuyu onayla')}</DropdownMenu.Item>{/if}
          {#if tv.can.approve}
            <DropdownMenu.Item onSelect={() => mod(topic.isHidden ? 'unhide' : 'hide', topic.isHidden ? t('Konu herkese görünür yapıldı.') : t('Konu gizlendi; yalnızca yazarı ve yetkililer görebilir.'))}>
              {#if topic.isHidden}<EyeIcon />{t('Herkese göster')}{:else}<HiddenIcon />{t('Konuyu gizle')}{/if}
            </DropdownMenu.Item>
            {#if topic.isHidden}<DropdownMenu.Item onSelect={openMembers}><UserPlusIcon />{t('Konuya üye ekle')}</DropdownMenu.Item>{/if}
          {/if}
          {#if tv.can.pin}
            <DropdownMenu.Item onSelect={() => mod(topic.isPinned ? 'unpin' : 'pin', topic.isPinned ? t('Sabitleme kaldırıldı.') : t('Konu sabitlendi.'))}>
              <PinIcon />{topic.isPinned ? t('Sabitlemeyi kaldır') : t('Sabitle')}
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => mod(topic.isFeatured ? 'unfeature' : 'feature', topic.isFeatured ? t('Öne çıkarma kaldırıldı.') : t('Konu öne çıkarıldı.'))}>
              <StarIcon />{topic.isFeatured ? t('Öne çıkarmayı kaldır') : t('Öne çıkar')}
            </DropdownMenu.Item>
          {/if}
          {#if tv.can.lock || tv.can.lockOwn}
            <DropdownMenu.Item onSelect={() => mod(topic.isLocked ? 'unlock' : 'lock', topic.isLocked ? t('Kilit açıldı.') : t('Konu kilitlendi.'))}>
              {#if topic.isLocked}<LockOpenIcon />{t('Kilidi aç')}{:else}<LockIcon />{t('Kilitle')}{/if}
            </DropdownMenu.Item>
          {/if}
          {#if tv.can.editTopic}<DropdownMenu.Item onSelect={openEdit}><PencilIcon />{t('Başlığı düzenle')}</DropdownMenu.Item>{/if}
          {#if tv.can.move}<DropdownMenu.Item onSelect={openMove}><MoveIcon />{t('Taşı')}</DropdownMenu.Item>{/if}
          {#if tv.can.merge}<DropdownMenu.Item onSelect={() => ((mergeInput = ''), (mergeOpen = true))}><MergeIcon />{t('Başka konuyla birleştir')}</DropdownMenu.Item>{/if}
          {#if tv.can.moderate}<DropdownMenu.Item onSelect={() => openViewers(1)}><UsersIcon />{t('Görüntüleyenler')}</DropdownMenu.Item>{/if}
          {#if tv.can.deleteTopic}
            <DropdownMenu.Separator />
            {#if topic.isDeleted}
              <DropdownMenu.Item onSelect={() => mod('restore', t('Konu geri getirildi.'))}><RotateCcwIcon />{t('Geri getir')}</DropdownMenu.Item>
            {:else}
              <DropdownMenu.Item variant="destructive" onSelect={deleteTopic}><Trash2Icon />{t('Konuyu sil')}</DropdownMenu.Item>
            {/if}
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
    {#if viewer.user}
      <Button variant="outline" onclick={toggleSubscribe} disabled={subBusy} aria-pressed={subscribed} title={subscribed ? t('Takibi bırak') : t('Yeni yanıtlarda bildirim al')}>
        {#if subscribed}<BellIcon weight="fill" class="text-primary" /><span class="max-sm:sr-only">{t('Takip ediliyor')}</span>{:else}<BellSimpleIcon /><span class="max-sm:sr-only">{t('Takip et')}</span>{/if}
      </Button>
    {/if}
    {#if canReply}<Button onclick={scrollToReply} class="max-sm:flex-1"><ReplyIcon />{t('Yanıtla')}</Button>{/if}
  </div>
</header>

{#if tv.poll && tv.posts.page === 1}
  <div class="mb-4"><PollCard poll={tv.poll} topicId={topic.id} ondelete={() => invalidateAll()} /></div>
{/if}

{#if topic.isDeleted}
  <div class="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"><Trash2Icon class="size-4" />{t('Bu konu silinmiş; yalnızca yetkililer görebilir.')}</div>
{:else if !topic.isApproved}
  <div class="mb-4 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm"><InfoIcon class="size-4" />{t('Bu konu moderatör onayı bekliyor.')}</div>
{:else if topic.isHidden}
  <div class="mb-4 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm" data-part="hidden-notice"><HiddenIcon class="size-4" />{t('Gizli konu: yalnızca yazarı ve yetkililer görebilir.')}</div>
{:else if topic.isLocked}
  <div class="mb-4 flex items-center gap-2 rounded-xl border bg-muted/50 px-4 py-2.5 text-sm" data-part="locked-notice">
    <LockIcon class="size-4 text-muted-foreground" />{t('Bu konu kilitlendi; yeni yanıt yazılamaz.')}{#if tv.can.replyLocked}<span class="text-muted-foreground"> {t('Moderatör olarak yine de yanıt yazabilirsin.')}</span>{/if}
  </div>
{/if}

{#if tv.posts.total > tv.posts.perPage}
  <div class="mb-3 flex justify-end"><PageJump page={tv.posts.page} perPage={tv.posts.perPage} total={tv.posts.total} /></div>
{/if}

<div class="grid gap-4">
  {#each tv.posts.items as post, i (post.id)}
    {#if tv.firstUnreadPostId === post.id && i > 0}
      <div class="flex items-center gap-3 text-xs font-semibold tracking-wide text-primary uppercase" transition:fade>
        <span class="h-px flex-1 bg-primary/40"></span>{t('Okunmamış mesajlar')}<span class="h-px flex-1 bg-primary/40"></span>
      </div>
    {/if}
    <div class="animate-in duration-300 fade-in-0 slide-in-from-bottom-1 fill-mode-both" style="animation-delay:{Math.min(i, 8) * 40}ms">
      <PostCard
        {post}
        boardId={tv.board.id}
        topicTitle={topic.title}
        prefixes={tv.prefixes}
        {canReply}
        multiQuoted={multi.includes(post.id)}
        postMaxLength={tv.limits.postMaxLength}
        onquote={quote}
        ontogglemulti={toggleMulti}
        onchanged={() => invalidateAll()}
        onhistory={openHistory}
        reactionDefs={tv.reactions}
        loggedIn={!!data.viewer.user}
        layout={data.viewer.settings['appearance.postLayout'] === 'top' ? 'top' : 'side'}
      />
    </div>
  {/each}
</div>

<div class="mt-4 flex justify-end"><PageJump page={tv.posts.page} perPage={tv.posts.perPage} total={tv.posts.total} /></div>

<!-- Hızlı yanıt -->
<section bind:this={replyBox} data-part="quick-reply" class="mt-6 scroll-mt-24">
  {#if canReply}
    <div class="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-[auto_1fr] sm:p-5">
      {#if viewer.user}<UserAvatar user={viewer.user} size={44} class="hidden rounded-xl sm:inline-flex" />{/if}
      <div class="grid min-w-0 gap-3">
        {#if topic.isLocked}
          <p class="flex items-center gap-2 text-xs text-muted-foreground"><LockIcon class="size-3.5" />{t('Konu kilitli; yetkiniz olduğu için yanıt yazabilirsiniz.')}</p>
        {/if}
        <Editor
          bind:this={editor}
          bind:value={reply}
          boardId={tv.board.id}
          maxLength={tv.limits.postMaxLength}
          minHeight={140}
          placeholder={t('Yanıtınızı yazın…')}
          draftKey="reply:{topic.id}"
          onsubmit={sendReply}
        />
        <div class="flex justify-end">
          <Button onclick={sendReply} disabled={sending || !reply.trim()} size="lg" title={t('Gönder (Ctrl+Enter)')}>
            {#if sending}<LoaderIcon class="animate-spin" />{t('Gönderiliyor…')}{:else}<SendIcon />{t('Yanıtı gönder')}{/if}
          </Button>
        </div>
      </div>
    </div>
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed bg-card/50 px-5 py-4 text-sm text-muted-foreground">
      <span class="flex items-center gap-2"><InfoIcon class="size-4" />{tv.replyBlockedReason}</span>
      {#if !viewer.user}<Button href="/login?next={encodeURIComponent(page.url.pathname + page.url.search)}" size="sm">{t('Giriş yap')}</Button>{/if}
    </div>
  {/if}
</section>

<!-- Gezinme: bölüme dön, sonraki okunmamış konu, benzer konular -->
{#if related}
  <nav class="mt-6 grid gap-3 sm:grid-cols-2" aria-label={t('Konu gezinmesi')} data-part="topic-nav">
    <a href="/f/{related.board.id}/{related.board.slug}" class="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary">
      <ArrowLeftIcon class="size-5 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
      <span class="grid min-w-0"><span class="text-xs text-muted-foreground">{t('Konu listesine dön')}</span><span class="truncate font-semibold">{tc(related.board.name)}</span></span>
    </a>
    {#if related.nextUnread}
      <a href="/t/{related.nextUnread.id}/{related.nextUnread.slug}?page=unread" class="group flex items-center justify-end gap-3 rounded-xl border bg-card p-4 text-right transition-colors hover:border-primary">
        <span class="grid min-w-0"><span class="text-xs text-muted-foreground">{t('Sonraki okunmamış konu')}</span><span class="truncate font-semibold">{related.nextUnread.title}</span></span>
        <ArrowRightIcon class="size-5 text-primary transition-transform group-hover:translate-x-0.5" />
      </a>
    {:else}
      <div class="flex items-center justify-end gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"><CheckCircleIcon class="size-4 text-success" />{t('Bu bölümde okunmamış konu kalmadı')}</div>
    {/if}
  </nav>
  {#if related.similar.length}
    <section class="mt-6 overflow-hidden rounded-xl border bg-card" data-part="similar-topics">
      <h2 class="border-b bg-panel-header px-5 py-3 text-sm font-bold">{t('Benzer konular')}</h2>
      <div class="divide-y">
        {#each related.similar as s (s.id)}<TopicRow topic={s} board={s.board} />{/each}
      </div>
    </section>
  {/if}
{/if}

<!-- Seçili metni alıntıla -->
{#if selQuote}
  <button
    type="button"
    transition:fly={{ y: 6, duration: 150 }}
    class="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg"
    style="left:{selQuote.x}px;top:{selQuote.y - 8}px"
    onmousedown={(e) => e.preventDefault()}
    onclick={quoteSelection}
  >
    <QuoteIcon class="size-3.5" />{t('Seçimi alıntıla')}
  </button>
{/if}

<!-- Çoklu alıntı çubuğu -->
{#if multi.length && canReply}
  <div transition:fly={{ y: 20, duration: 200 }} class="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover py-1.5 pr-1.5 pl-4 text-sm shadow-xl">
    <span>{t('{n} mesaj seçildi', { n: multi.length })}</span>
    <Button size="sm" class="rounded-full" onclick={quoteMulti}><QuoteIcon />{t('Alıntıla')}</Button>
    <button
      type="button"
      class="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
      aria-label={t('Seçimi temizle')}
      onclick={() => {
        multi = [];
        saveMulti();
      }}><XIcon class="size-4" /></button
    >
  </div>
{/if}

<Dialog.Root bind:open={membersOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{t('Gizli konunun üyeleri')}</Dialog.Title>
      <Dialog.Description>{t('Eklediğin üyeler bu gizli konuyu görür, yanıtlayabilir ve yeni yanıtlarda bildirim alır. Konunun yazarı ve yetkililer zaten görür.')}</Dialog.Description>
    </Dialog.Header>
    <UserPicker placeholder={t('Üye ekle…')} exclude={[...(members ?? []).map((m) => m.user.id), ...(topic.author ? [topic.author.id] : [])]} onpick={addMember} />
    {#if members === null}
      <div class="flex justify-center py-6"><LoaderIcon class="size-5 animate-spin text-muted-foreground" /></div>
    {:else if members.length}
      <ul class="grid max-h-72 gap-1 overflow-y-auto">
        {#each members as m (m.user.id)}
          <li class="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent">
            <UserAvatar user={m.user} size={32} />
            <span class="grid min-w-0 flex-1">
              <span class="truncate text-sm font-semibold">{m.user.displayName}</span>
              <span class="truncate text-xs text-muted-foreground">{#if m.addedBy}{t('{name} ekledi', { name: m.addedBy.displayName })} · {/if}<TimeAgo ms={m.addedAt} /></span>
            </span>
            <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => removeMember(m.user)} title={t('Çıkar')} aria-label={t('Çıkar')}><XIcon /></Button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t('Henüz eklenmiş üye yok.')}</p>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={editOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header><Dialog.Title>{t('Konuyu düzenle')}</Dialog.Title></Dialog.Header>
    <div class="grid gap-3">
      {#if tv.prefixes.length}
        <Combobox options={tv.prefixes.map((p) => ({ value: p.id, label: p.name, swatch: p.color ?? 'var(--primary)' }))} bind:value={editPrefix} placeholder={t('Önek yok')} clearable />
      {/if}
      <Input bind:value={editTitle} maxlength={tv.limits.titleMaxLength} aria-label={t('Başlık')} />
    </div>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (editOpen = false)}>{t('Vazgeç')}</Button>
      <Button onclick={saveEdit} disabled={editTitle.trim().length < 3}>{t('Kaydet')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={moveOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{t('Konuyu taşı')}</Dialog.Title>
      <Dialog.Description>{t('Konunun taşınacağı bölümü seçin.')}</Dialog.Description>
    </Dialog.Header>
    <Combobox options={moveOptions} bind:value={moveTarget} placeholder={t('Bölüm seçin')} searchPlaceholder={t('Bölüm ara…')} />
    <label class="flex items-center gap-2 text-sm"><Switch bind:checked={moveRedirect} />{t('Eski bölümde yönlendirme bağlantısı bırak')}</label>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (moveOpen = false)}>{t('Vazgeç')}</Button>
      <Button onclick={doMove} disabled={!moveTarget}>{t('Taşı')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={mergeOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{t('Konuyu birleştir')}</Dialog.Title>
      <Dialog.Description>{t('Bu konunun tüm mesajları hedef konuya taşınır; bu konu hedefe yönlendiren bir bağlantıya dönüşür.')}</Dialog.Description>
    </Dialog.Header>
    <Input bind:value={mergeInput} placeholder={t('Hedef konu numarası ya da bağlantısı')} />
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (mergeOpen = false)}>{t('Vazgeç')}</Button>
      <Button onclick={doMerge} disabled={!mergeInput.trim()}>{t('Birleştir')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={historyOpen}>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header><Dialog.Title>{t('Düzenleme geçmişi')}</Dialog.Title></Dialog.Header>
    {#if !history}
      <div class="flex justify-center py-8"><LoaderIcon class="size-5 animate-spin text-muted-foreground" /></div>
    {:else if !history.length}
      <p class="py-6 text-center text-sm text-muted-foreground">{t('Kayıtlı önceki sürüm yok.')}</p>
    {:else}
      <ol class="grid gap-3">
        {#each history as rev (rev.id)}
          <li class="rounded-xl border">
            <div class="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {#if rev.user}<UserName user={rev.user} class="text-xs" />{/if}
              <span>{formatDateTime(rev.createdAt)}</span>
              {#if rev.reason}<span>· {rev.reason}</span>{/if}
            </div>
            <div class="prose-forum px-3 py-2.5 text-sm">{@html rev.html}</div>
          </li>
        {/each}
      </ol>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={tagsOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{t('Etiketler')}</Dialog.Title>
      <Dialog.Description>{t('Konunun bulunmasını kolaylaştıran anahtar kelimeler.')}</Dialog.Description>
    </Dialog.Header>
    <TagInput bind:value={tagDraft} max={tv.tagging.max} allowNew={tv.tagging.allowNew || tv.can.moderate} />
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (tagsOpen = false)}>{t('Vazgeç')}</Button>
      <Button onclick={saveTags} disabled={tagSaving}>{#if tagSaving}<LoaderIcon class="animate-spin" />{/if}{t('Kaydet')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={viewersOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{t('Görüntüleyenler')}</Dialog.Title>
      <Dialog.Description>{t('Konuyu açan üyeler; son görüntülemeye göre. Misafirler yalnızca toplam sayıya eklenir.')}</Dialog.Description>
    </Dialog.Header>
    {#if !viewersData}
      <div class="flex justify-center py-8"><LoaderIcon class="size-5 animate-spin text-muted-foreground" /></div>
    {:else if !viewersData.items.length}
      <p class="py-6 text-center text-sm text-muted-foreground">{t('Henüz kayıt yok.')}</p>
    {:else}
      <div class="grid max-h-[60vh] gap-1 overflow-y-auto">
        {#each viewersData.items as v (v.user.id)}
          <div class="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
            <UserAvatar user={v.user} size={30} />
            <div class="grid min-w-0 flex-1">
              <UserName user={v.user} class="text-sm" />
              <span class="text-xs text-muted-foreground" title={formatDateTime(v.firstAt)}>{t('İlk:')} <TimeAgo ms={v.firstAt} /></span>
            </div>
            <div class="grid text-right text-xs">
              <span class="font-semibold tabular-nums">{t('{n} kez', { n: formatNumber(v.views) })}</span>
              <span class="text-muted-foreground" title={formatDateTime(v.lastAt)}><TimeAgo ms={v.lastAt} /></span>
            </div>
          </div>
        {/each}
      </div>
      {#if viewersData.total > viewersData.perPage}
        <div class="flex items-center justify-between text-xs">
          <Button variant="ghost" size="sm" disabled={viewersData.page <= 1} onclick={() => openViewers(viewersData!.page - 1)}>{t('Önceki')}</Button>
          <span class="text-muted-foreground">{viewersData.page} / {Math.ceil(viewersData.total / viewersData.perPage)}</span>
          <Button variant="ghost" size="sm" disabled={viewersData.page * viewersData.perPage >= viewersData.total} onclick={() => openViewers(viewersData!.page + 1)}>{t('Sonraki')}</Button>
        </div>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
