<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import BookmarkIcon from 'phosphor-svelte/lib/BookmarkSimple';
  import ChecksIcon from 'phosphor-svelte/lib/Checks';
  import HandWavingIcon from 'phosphor-svelte/lib/HandWaving';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import CategorySection from '$lib/components/forum/CategorySection.svelte';
  import BoardRow from '$lib/components/forum/BoardRow.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api, errorMessage } from '$lib/api';
  import HomeBlock from '$lib/components/home/HomeBlock.svelte';
  import ExtensionSlotView from '$lib/components/ExtensionSlotView.svelte';
  import SignInIcon from 'phosphor-svelte/lib/SignIn';
  import UserPlusIcon from 'phosphor-svelte/lib/UserPlus';
  import { t, tc } from '$lib/i18n.svelte';

  import type { ForumIndexData } from '$lib/forum-index';
  import type { Viewer } from '@forum/shared';

  let { data }: { data: ForumIndexData & { viewer: Viewer } } = $props();
  const viewer = $derived(data.viewer);
  const s = $derived(viewer.settings);
  const forum = $derived(data.forum);
  const welcome = $derived(page.url.searchParams.has('welcome'));
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const extTop = $derived(page.data.ext?.slots.homeTop ?? []);
  const extSide = $derived(page.data.ext?.slots.homeSidebar ?? []);
  const hasSidebar = $derived(data.home.sidebar.length > 0 || extSide.length > 0);

  let pickerOpen = $state(false);
  let pickBoard = $state<number | null>(null);
  let marking = $state(false);

  const showWelcome = $derived(!viewer.user && s['appearance.welcomeEnabled'] !== false);
  const welcomeTitle = $derived(String(s['appearance.welcomeTitle'] ?? '').trim() || t('{name} topluluğuna hoş geldin', { name: forumName }));
  const welcomeText = $derived(
    String(s['appearance.welcomeText'] ?? '').trim() || String(s['general.forumDescription'] ?? '').trim() || t('Sorular sor, deneyimlerini paylaş, yeni insanlarla tanış.'),
  );

  function newTopic() {
    if (forum.postableBoards.length === 1) void goto(`/f/${forum.postableBoards[0]!.id}/new`);
    else pickerOpen = true;
  }

  async function markAllRead() {
    marking = true;
    try {
      await api.post('/api/forum/mark-read');
      toast.success(t('Tüm içerik okundu olarak işaretlendi.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      marking = false;
    }
  }
</script>

<svelte:head><title>{forumName}</title></svelte:head>

<div class="grid gap-6">
  {#if showWelcome}
    <!-- Misafir karşılama şeridi -->
    <section
      data-part="welcome"
      class="relative isolate flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border bg-card px-5 py-4 shadow-card animate-rise"
    >
      <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><HandWavingIcon class="size-6" weight="duotone" /></span>
      <div class="min-w-[12rem] flex-1">
        <h1 class="text-base font-extrabold">{welcomeTitle}</h1>
        <p class="text-sm text-muted-foreground">{welcomeText}</p>
      </div>
      <div class="flex w-full gap-2 sm:w-auto">
        <Button variant="outline" href="/login" class="flex-1 sm:flex-none"><SignInIcon />{t('Giriş yap')}</Button>
        {#if s['registration.mode'] !== 'closed'}<Button href="/register" class="flex-1 sm:flex-none"><UserPlusIcon />{t('Kayıt ol')}</Button>{/if}
      </div>
    </section>
  {/if}
  {#if welcome && viewer.user}
    <div class="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm animate-rise">
      {t('Aramıza hoş geldin')} <strong>{viewer.user.displayName}</strong>{t('! Profilini tamamlamak için')}
      <a href="/settings/profile" class="font-semibold underline">{t('ayarlarına')}</a> {t('göz at.')}
    </div>
  {/if}

  {#each data.home.top as block (block.id)}
    <HomeBlock {block} forum={data.forum} recent={data.recent} birthdays={data.birthdays} />
  {/each}

  <div class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-2xl font-extrabold tracking-tight" data-part="page-title">{t('Forumlar')}</h1>
    <div class="flex flex-wrap items-center gap-2">
      {#if viewer.user}
        <Button variant="ghost" href="/unread" class="text-muted-foreground" title={t('Okunmamış içerik')}><BookmarkIcon /><span class="max-sm:sr-only">{t('Okunmamış içerik')}</span></Button>
        <Button variant="ghost" onclick={markAllRead} disabled={marking} class="text-muted-foreground" title={t('Tümünü okundu say')}><ChecksIcon /><span class="max-sm:sr-only">{t('Tümünü okundu say')}</span></Button>
      {/if}
      {#if forum.postableBoards.length && !viewer.user}
        <Button onclick={newTopic} class="press"><PlusIcon weight="bold" />{t('Yeni konu')}</Button>
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-[minmax(0,1fr)] gap-6 {hasSidebar ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}" data-part="home-grid">
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
      {#if extTop.length}<ExtensionSlotView items={extTop} key="homeTop" />{/if}
      {#each forum.categories as cat, i (cat.id)}
        <div class="animate-rise" style="--i:{i}">
          <CategorySection id={cat.id} name={tc(cat.name)} description={tc(cat.description)} collapsible={cat.isCollapsible} background={cat.background} count={cat.boards.length}>
            {#each cat.boards as board (board.id)}
              <BoardRow {board} />
            {/each}
          </CategorySection>
        </div>
      {:else}
        <EmptyState title={t('Henüz bölüm yok')} description={t('Yönetim panelinden kategori ve bölüm ekleyerek forumu oluşturun.')}>
          {#if viewer.isAdmin}<Button href="/admin/forum" size="sm">{t('Forumu düzenle')}</Button>{/if}
        </EmptyState>
      {/each}
      {#each data.home.bottom as block (block.id)}
        <HomeBlock {block} forum={data.forum} recent={data.recent} birthdays={data.birthdays} />
      {/each}
    </div>

    {#if hasSidebar}
        <aside class="grid content-start gap-5" data-part="home-sidebar">
          {#each data.home.sidebar as block (block.id)}
            <HomeBlock {block} compact forum={data.forum} recent={data.recent} birthdays={data.birthdays} />
          {/each}
          {#if extSide.length}<ExtensionSlotView items={extSide} key="homeSidebar" card />{/if}
        </aside>
    {/if}
  </div>
</div>

<Dialog.Root bind:open={pickerOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{t('Yeni konu aç')}</Dialog.Title>
      <Dialog.Description>{t('Konunu açmak istediğin bölümü seç.')}</Dialog.Description>
    </Dialog.Header>
    <Combobox
      options={forum.postableBoards.map((b) => ({ value: b.id, label: tc(b.name), group: tc(b.category) }))}
      bind:value={pickBoard}
      placeholder={t('Bölüm seç')}
      searchPlaceholder={t('Bölüm ara…')}
    />
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (pickerOpen = false)}>{t('Vazgeç')}</Button>
      <Button disabled={!pickBoard} onclick={() => goto(`/f/${pickBoard}/new`).then(() => (pickerOpen = false))}>{t('Devam et')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
