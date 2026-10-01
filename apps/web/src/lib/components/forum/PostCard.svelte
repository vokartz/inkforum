<script lang="ts">
  import type { PostItem, ReactionDef, TopicPrefix } from '@forum/shared';
  import { toast } from 'svelte-sonner';
  import QuoteIcon from 'phosphor-svelte/lib/Quotes';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import Trash2Icon from 'phosphor-svelte/lib/Trash';
  import HistoryIcon from 'phosphor-svelte/lib/ClockCounterClockwise';
  import LinkIcon from 'phosphor-svelte/lib/Link';
  import EllipsisIcon from 'phosphor-svelte/lib/DotsThree';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import RotateCcwIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import MessageSquareIcon from 'phosphor-svelte/lib/ChatCenteredText';
  import TriangleAlertIcon from 'phosphor-svelte/lib/Warning';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import UserAvatar from '../UserAvatar.svelte';
  import UserName from '../UserName.svelte';
  import GroupBadge from '../GroupBadge.svelte';
  import TimeAgo from '../TimeAgo.svelte';
  import Combobox from '../Combobox.svelte';
  import Editor from '../editor/Editor.svelte';
  import ReactionBar from './ReactionBar.svelte';
  import HeartIcon from 'phosphor-svelte/lib/Heart';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDateTime, formatNumber, formatDate } from '$lib/format';
  import { profileUrl } from '$lib/viewer';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    post: PostItem;
    boardId: number;
    /** İlk mesaj düzenlenirken başlık/önek de düzenlenebilir. */
    topicTitle?: string;
    prefixes?: TopicPrefix[];
    canReply?: boolean;
    multiQuoted?: boolean;
    postMaxLength?: number;
    onquote?: (postId: number) => void;
    ontogglemulti?: (postId: number) => void;
    onchanged?: () => void;
    onhistory?: (postId: number) => void;
    /** Etkin tepki seti */
    reactionDefs?: ReactionDef[];
    loggedIn?: boolean;
    /** side: yazar solda sütun; top: yazar mesajın üstünde yatay şerit */
    layout?: 'side' | 'top';
  }
  let {
    post,
    boardId,
    topicTitle = '',
    prefixes = [],
    canReply = false,
    multiQuoted = false,
    postMaxLength,
    onquote,
    ontogglemulti,
    onchanged,
    onhistory,
    reactionDefs = [],
    loggedIn = false,
    layout = 'side',
  }: Props = $props();

  let editing = $state(false);
  let loadingSource = $state(false);
  let saving = $state(false);
  let body = $state('');
  let reason = $state('');
  let title = $state('');
  let prefixId = $state<number | null>(null);
  let html = $state('');

  function syncHtml() {
    html = post.html;
  }
  syncHtml();
  $effect.pre(syncHtml);

  const author = $derived(post.author);

  async function startEdit() {
    loadingSource = true;
    try {
      const src = await api.get<{ bbcode: string; title: string | null; prefixId: number | null; isFirst: boolean }>(`/api/posts/${post.id}/source`);
      body = src.bbcode;
      title = src.title ?? topicTitle;
      prefixId = src.prefixId;
      reason = '';
      editing = true;
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      loadingSource = false;
    }
  }

  async function save() {
    saving = true;
    try {
      const res = await api.put<{ html: string }>(`/api/posts/${post.id}`, {
        body,
        reason,
        ...(post.isFirst ? { title, prefixId } : {}),
      });
      html = res.html;
      editing = false;
      toast.success(t('Mesaj güncellendi.'));
      onchanged?.();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }

  async function remove() {
    const ok = await confirmAction({
      title: post.isFirst ? t('Konu silinsin mi?') : t('Mesaj silinsin mi?'),
      description: post.isFirst ? t('Bu konunun ilk mesajı; konu tüm mesajlarıyla birlikte silinecek.') : t('Mesaj konudan kaldırılacak.'),
      confirmLabel: t('Sil'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/posts/${post.id}`);
      toast.success(post.isFirst ? t('Konu silindi.') : t('Mesaj silindi.'));
      onchanged?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function act(path: string, message: string) {
    try {
      await api.post(path);
      toast.success(message);
      onchanged?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function copyLink() {
    const url = `${location.origin}/p/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('Mesaj bağlantısı kopyalandı.'));
    } catch {
      toast.info(url);
    }
  }
</script>

<article
  id="post-{post.id}"
  data-part="post"
  data-post-id={post.id}
  class={cn(
    'group/post scroll-mt-24 overflow-hidden rounded-xl border bg-card shadow-card transition-shadow target:ring-2 target:ring-primary/60',
    post.isDeleted && 'border-destructive/40 opacity-75',
    !post.isApproved && 'border-warning/60',
  )}
>
  <div class={cn('grid', layout === 'side' && 'md:grid-cols-[13rem_1fr]')} data-layout={layout}>
    {#if layout === 'top'}
      <!-- Yazar şeridi (yatay düzen) -->
      <aside data-part="post-author" class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-[color-mix(in_oklch,var(--muted)_45%,var(--card))] px-4 py-3 sm:px-5">
        <div class="relative shrink-0">
          {#if author}
            <a href={profileUrl(author)} class="block"><UserAvatar user={author} size={52} shape="rounded" /></a>
            {#if author.isOnline}<span class="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-card bg-success" title={t('Çevrimiçi')}></span>{/if}
          {:else}
            <UserAvatar user={{ displayName: post.authorName || '?', avatarUrl: null }} size={52} shape="rounded" />
          {/if}
        </div>
        <div class="min-w-0 flex-1">
          {#if author}
            <div class="flex flex-wrap items-center gap-2">
              <UserName user={author} class="text-[15px]" />
              {#each author.groups.slice(0, 3) as g (g.id)}<GroupBadge group={g} />{/each}
            </div>
            {#if author.customTitle}<p class="truncate text-xs text-muted-foreground">{author.customTitle}</p>{/if}
          {:else}
            <span class="font-medium text-muted-foreground">{post.authorName}</span>
            <p class="text-xs text-muted-foreground">{t('Misafir / silinmiş üye')}</p>
          {/if}
        </div>
        {#if author}
          <dl class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div class="flex items-center gap-1"><MessageSquareIcon class="size-3.5" /><b class="text-foreground tabular-nums">{formatNumber(author.postCount)}</b> {t('mesaj')}</div>
            <div class="flex items-center gap-1"><HeartIcon class="size-3.5 {author.reputation > 0 ? 'text-destructive' : ''}" weight={author.reputation > 0 ? 'fill' : 'regular'} /><b class="text-foreground tabular-nums">{formatNumber(author.reputation)}</b> {t('itibar')}</div>
            <div class="hidden sm:block">{t('Kayıt: {date}', { date: formatDate(author.registeredAt) })}</div>
            {#if author.warningPoints !== null && author.warningPoints > 0}<div class="flex items-center gap-1 text-warning"><TriangleAlertIcon class="size-3.5" />{author.warningPoints}</div>{/if}
          </dl>
        {/if}
      </aside>
    {:else}
    <!-- Yazar paneli -->
    <aside
      data-part="post-author"
      class="flex items-center gap-3 border-b bg-[color-mix(in_oklch,var(--muted)_45%,var(--card))] p-3 md:flex-col md:items-center md:gap-2 md:border-r md:border-b-0 md:p-5 md:text-center"
    >
      <div class="relative shrink-0">
        {#if author}
          <a href={profileUrl(author)} class="block">
            <UserAvatar user={author} size={96} shape="rounded" class="hidden md:inline-flex" />
            <UserAvatar user={author} size={44} shape="rounded" class="md:hidden" />
          </a>
          {#if author.isOnline}
            <span class="absolute right-0.5 bottom-0.5 size-3.5 rounded-full border-2 border-card bg-success md:right-1 md:bottom-1 md:size-4" title={t('Çevrimiçi')}></span>
          {/if}
        {:else}
          <UserAvatar user={{ displayName: post.authorName || '?', avatarUrl: null }} size={44} class="rounded-xl" />
        {/if}
      </div>
      <div class="min-w-0 md:w-full">
        {#if author}
          <UserName user={author} class="max-w-full text-[15px] md:justify-center" />
          {#if author.customTitle}<p class="truncate text-xs text-muted-foreground">{author.customTitle}</p>{/if}
          <div class="mt-1.5 hidden flex-col items-center gap-1 md:flex">
            {#each author.groups.slice(0, 3) as g (g.id)}
              <GroupBadge group={g} />
            {/each}
          </div>
          <dl class="mt-3 hidden w-full gap-1 text-xs text-muted-foreground md:grid">
            <div class="flex items-center justify-center gap-1.5">
              <MessageSquareIcon class="size-3.5" /><span class="font-medium text-foreground tabular-nums">{formatNumber(author.postCount)}</span> {t('mesaj')}
            </div>
            <div class="flex items-center justify-center gap-1.5" title={t('Mesajlarına verilen tepkilerden gelen itibar')}>
              <HeartIcon class="size-3.5 {author.reputation > 0 ? 'text-destructive' : ''}" weight={author.reputation > 0 ? 'fill' : 'regular'} /><span class="font-medium text-foreground tabular-nums">{formatNumber(author.reputation)}</span> {t('itibar')}
            </div>
            <div>{t('Kayıt: {date}', { date: formatDate(author.registeredAt) })}</div>
            {#if author.warningPoints !== null && author.warningPoints > 0}
              <div class="flex items-center justify-center gap-1 text-warning"><TriangleAlertIcon class="size-3.5" />{t('{n} uyarı puanı', { n: author.warningPoints })}</div>
            {/if}
          </dl>
          <p class="text-xs text-muted-foreground md:hidden">{author.primaryGroup?.name ?? ''}{author.primaryGroup ? ' · ' : ''}{t('{n} mesaj', { n: formatNumber(author.postCount) })}</p>
        {:else}
          <span class="font-medium text-muted-foreground">{post.authorName}</span>
          <p class="text-xs text-muted-foreground">{t('Misafir / silinmiş üye')}</p>
        {/if}
      </div>
    </aside>
    {/if}

    <!-- İçerik -->
    <div class="flex min-w-0 flex-col">
      <header class="flex items-center gap-2 border-b px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        <a href="/p/{post.id}" class="hover:text-foreground" title={formatDateTime(post.createdAt)}>
          {post.isFirst ? t('Konu tarihi') : t('Gönderim')}: <TimeAgo ms={post.createdAt} />
        </a>
        {#if post.editedAt}
          <span title="{formatDateTime(post.editedAt)}{post.editedByName ? ` · ${post.editedByName}` : ''}{post.editReason ? ` · ${post.editReason}` : ''}">
            {t('(düzenlendi)')}
          </span>
        {/if}
        {#if !post.isApproved}<span class="rounded bg-warning/20 px-1.5 py-0.5 font-medium text-foreground">{t('Onay bekliyor')}</span>{/if}
        {#if post.isDeleted}<span class="rounded bg-destructive/15 px-1.5 py-0.5 font-medium text-destructive">{t('Silinmiş')}</span>{/if}
        <span class="ml-auto flex items-center gap-1">
          <a href="/p/{post.id}" class="rounded px-1.5 py-0.5 font-medium tabular-nums hover:bg-accent hover:text-foreground">#{post.number}</a>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger class="rounded-md p-1 hover:bg-accent hover:text-foreground" aria-label={t('Mesaj işlemleri')}>
              <EllipsisIcon class="size-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="w-48">
              <DropdownMenu.Item onSelect={copyLink}><LinkIcon />{t('Bağlantıyı kopyala')}</DropdownMenu.Item>
              {#if post.can.history}<DropdownMenu.Item onSelect={() => onhistory?.(post.id)}><HistoryIcon />{t('Düzenleme geçmişi')}</DropdownMenu.Item>{/if}
              {#if post.can.approve}<DropdownMenu.Item onSelect={() => act(`/api/posts/${post.id}/approve`, t('Mesaj onaylandı.'))}><ShieldCheckIcon />{t('Onayla')}</DropdownMenu.Item>{/if}
              {#if post.can.restore}<DropdownMenu.Item onSelect={() => act(`/api/posts/${post.id}/restore`, t('Mesaj geri getirildi.'))}><RotateCcwIcon />{t('Geri getir')}</DropdownMenu.Item>{/if}
              {#if post.can.edit}<DropdownMenu.Item onSelect={startEdit}><PencilIcon />{t('Düzenle')}</DropdownMenu.Item>{/if}
              {#if post.can.delete}
                <DropdownMenu.Separator />
                <DropdownMenu.Item variant="destructive" onSelect={remove}><Trash2Icon />{post.isFirst ? t('Konuyu sil') : t('Sil')}</DropdownMenu.Item>
              {/if}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </span>
      </header>

      <div class="flex-1 px-4 py-4 sm:px-5">
        {#if editing}
          <div class="grid gap-3">
            {#if post.isFirst}
              <div class="grid gap-2 sm:grid-cols-[12rem_1fr]">
                {#if prefixes.length}
                  <Combobox
                    options={prefixes.map((p) => ({ value: p.id, label: p.name, swatch: p.color ?? 'var(--primary)' }))}
                    bind:value={prefixId}
                    placeholder={t('Önek yok')}
                    clearable
                  />
                {/if}
                <Input bind:value={title} maxlength={150} aria-label={t('Konu başlığı')} class={prefixes.length ? '' : 'sm:col-span-2'} />
              </div>
            {/if}
            <Editor bind:value={body} {boardId} maxLength={postMaxLength} minHeight={160} onsubmit={save} />
            <div class="flex flex-wrap items-center gap-2">
              <Input bind:value={reason} placeholder={t('Düzenleme nedeni (isteğe bağlı)')} class="max-w-xs" maxlength={200} />
              <div class="ml-auto flex gap-2">
                <Button variant="ghost" onclick={() => (editing = false)} disabled={saving}>{t('Vazgeç')}</Button>
                <Button onclick={save} disabled={saving}>{#if saving}<LoaderIcon class="animate-spin" />{/if}{t('Kaydet')}</Button>
              </div>
            </div>
          </div>
        {:else}
          <div class="prose-forum" data-part="post-body">{@html html}</div>
        {/if}
      </div>

      {#if author?.signatureHtml && !editing}
        <div data-part="post-signature" class="mx-4 mb-3 border-t border-dashed pt-3 text-sm text-muted-foreground sm:mx-5">
          <div class="prose-forum max-h-40 overflow-hidden text-[13px]">{@html author.signatureHtml}</div>
        </div>
      {/if}

      {#if !editing}
        <footer class="flex flex-wrap items-center gap-1 px-3 pb-3 sm:px-4">
          <div class="mr-auto min-w-0 py-0.5">
            <ReactionBar postId={post.id} defs={reactionDefs} reactions={post.reactions} myReaction={post.myReaction} canReact={post.can.react} {loggedIn} />
          </div>
          {#if post.can.edit}
            <Button variant="ghost" size="sm" onclick={startEdit} disabled={loadingSource} class="text-muted-foreground">
              {#if loadingSource}<LoaderIcon class="animate-spin" />{:else}<PencilIcon />{/if}{t('Düzenle')}
            </Button>
          {/if}
          {#if canReply && !post.isDeleted}
            <Button
              variant={multiQuoted ? 'secondary' : 'ghost'}
              size="sm"
              class="text-muted-foreground"
              title={t('Çoklu alıntıya ekle')}
              aria-pressed={multiQuoted}
              onclick={() => ontogglemulti?.(post.id)}
            >
              {#if multiQuoted}<CheckIcon />{:else}<PlusIcon />{/if}
            </Button>
            <Button variant="outline" size="sm" onclick={() => onquote?.(post.id)}><QuoteIcon />{t('Alıntıla')}</Button>
          {/if}
        </footer>
      {/if}
    </div>
  </div>
</article>

