<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/ChatsCircle';
  import { invalidate } from '$app/navigation';
  import { flip } from 'svelte/animate';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { toast } from 'svelte-sonner';
  import type { AdminBoard } from '@forum/shared';
  import GripVerticalIcon from 'phosphor-svelte/lib/DotsSixVertical';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import Trash2Icon from 'phosphor-svelte/lib/Trash';
  import FolderPlusIcon from 'phosphor-svelte/lib/FolderPlus';
  import TagIcon from 'phosphor-svelte/lib/Tag';
  import RefreshCwIcon from 'phosphor-svelte/lib/ArrowsClockwise';
  import LinkIcon from 'phosphor-svelte/lib/Link';
  import ShieldIcon from 'phosphor-svelte/lib/Shield';
  import EyeOffIcon from 'phosphor-svelte/lib/EyeSlash';
  import LayersIcon from 'phosphor-svelte/lib/Stack';
  import CornerDownRightIcon from 'phosphor-svelte/lib/ArrowBendDownRight';
  import ExternalLinkIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import ImageIcon from 'phosphor-svelte/lib/Image';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { Badge } from '$lib/components/ui/badge';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import BoardIcon from '$lib/components/forum/BoardIcon.svelte';
  import PrefixBadge from '$lib/components/forum/PrefixBadge.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const tree = $derived(data.tree);

  interface Node extends AdminBoard {
    children: Node[];
  }
  interface Cat {
    id: number;
    name: string;
    description: string;
    isCollapsible: boolean;
    background: string | null;
    boards: Node[];
  }

  const FLIP = 180;
  let cats = $state<Cat[]>([]);

  function build(boards: AdminBoard[]): Node[] {
    const byParent = (pid: number | null): Node[] =>
      boards.filter((b) => (b.parentId ?? null) === pid && (pid !== null || !boards.some((x) => x.id === b.parentId))).map((b) => ({ ...b, children: byParent(b.id) }));
    return byParent(null);
  }

  function syncState1() {
    if (!tree) return;
    cats = tree.categories.map((c) => ({ id: c.id, name: c.name, description: c.description, isCollapsible: c.isCollapsible, background: c.background, boards: build(c.boards) }));
  }
  syncState1();
  $effect.pre(syncState1);

  const profileName = (id: number | null) => {
    const p = tree?.profiles.find((x) => (id ? x.id === id : x.key === 'default'));
    return p ? tc(p.name) : t('Varsayılan');
  };
  const allBoards = $derived(tree ? tree.categories.flatMap((c) => c.boards.map((b) => ({ ...b, category: c.name }))) : []);

  // ---------- Sıralama (sürükle-bırak) ----------

  async function persist() {
    const flatten = (nodes: Node[], parentId: number | null): Array<{ id: number; parentId: number | null }> =>
      nodes.flatMap((n) => [{ id: n.id, parentId }, ...flatten(n.children, n.id)]);
    try {
      await api.put('/api/admin/forum/order', { categories: cats.map((c) => ({ id: c.id, boards: flatten(c.boards, null) })) });
      toast.success(t('Sıralama kaydedildi.'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
    await invalidate('app:admin-forum');
  }

  function onCats(e: CustomEvent<DndEvent<Cat>>, final: boolean) {
    cats = e.detail.items;
    if (final) void persist();
  }

  function onBoards(owner: { boards?: Node[]; children?: Node[] }, key: 'boards' | 'children', e: CustomEvent<DndEvent<Node>>, final: boolean) {
    owner[key] = e.detail.items;
    if (final && e.detail.info.trigger === 'droppedIntoZone') void persist();
  }

  // ---------- Kategoriler ----------

  let catOpen = $state(false);
  let catEdit = $state<{ id: number | null; name: string; description: string; isCollapsible: boolean; background: string | null }>({
    id: null,
    name: '',
    description: '',
    isCollapsible: true,
    background: null,
  });
  let bgBusy = $state(false);
  let catSaving = $state(false);

  function openCat(c?: Cat) {
    catEdit = c
      ? { id: c.id, name: c.name, description: c.description, isCollapsible: c.isCollapsible, background: c.background }
      : { id: null, name: '', description: '', isCollapsible: true, background: null };
    catOpen = true;
  }

  async function saveCat(e: SubmitEvent) {
    e.preventDefault();
    catSaving = true;
    try {
      const body = { name: catEdit.name, description: catEdit.description, isCollapsible: catEdit.isCollapsible };
      if (catEdit.id) await api.put(`/api/admin/forum/categories/${catEdit.id}`, body);
      else await api.post('/api/admin/forum/categories', body);
      catOpen = false;
      toast.success(t('Kategori kaydedildi.'));
      await invalidate('app:admin-forum');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      catSaving = false;
    }
  }

  async function uploadBg(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !catEdit.id) return;
    bgBusy = true;
    try {
      const res = await api.upload<{ url: string }>(`/api/admin/forum/categories/${catEdit.id}/background`, file, file.name);
      catEdit.background = res.url;
      toast.success(t('Arka plan yüklendi.'));
      await invalidate('app:admin-forum');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      bgBusy = false;
    }
  }

  async function removeBg() {
    if (!catEdit.id) return;
    try {
      await api.delete(`/api/admin/forum/categories/${catEdit.id}/background`);
      catEdit.background = null;
      await invalidate('app:admin-forum');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function deleteCat(c: Cat) {
    if (!(await confirmAction({ title: t('"{name}" kategorisi silinsin mi?', { name: c.name }), description: t('Yalnızca boş kategoriler silinebilir.'), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/forum/categories/${c.id}`);
      toast.success(t('Kategori silindi.'));
      await invalidate('app:admin-forum');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  // ---------- Bölüm silme ----------

  let delBoard = $state<Node | null>(null);
  let delTarget = $state<number | null>(null);
  async function confirmDeleteBoard() {
    if (!delBoard) return;
    try {
      await api.delete(`/api/admin/forum/boards/${delBoard.id}${delTarget ? `?moveTopicsTo=${delTarget}` : ''}`);
      toast.success(t('Bölüm silindi.'));
      delBoard = null;
      await invalidate('app:admin-forum');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  // ---------- Önekler ----------

  const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];
  let pxOpen = $state(false);
  let pxEdit = $state<{ id: number | null; name: string; color: string | null; boardIds: number[] }>({ id: null, name: '', color: '#3b82f6', boardIds: [] });
  function openPrefix(p?: { id: number; name: string; color: string | null; boardIds: number[] | null }) {
    pxEdit = p ? { id: p.id, name: p.name, color: p.color, boardIds: p.boardIds ?? [] } : { id: null, name: '', color: '#3b82f6', boardIds: [] };
    pxOpen = true;
  }
  async function savePrefix(e: SubmitEvent) {
    e.preventDefault();
    try {
      const body = { name: pxEdit.name, color: pxEdit.color, boardIds: pxEdit.boardIds.length ? pxEdit.boardIds : null };
      if (pxEdit.id) await api.put(`/api/admin/forum/prefixes/${pxEdit.id}`, body);
      else await api.post('/api/admin/forum/prefixes', body);
      pxOpen = false;
      toast.success(t('Önek kaydedildi.'));
      await invalidate('app:admin-forum');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }
  async function deletePrefix(id: number, name: string) {
    if (!(await confirmAction({ title: t('"{name}" öneki silinsin mi?', { name }), description: t('Bu öneki kullanan konulardan kaldırılır.'), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/forum/prefixes/${id}`);
      toast.success(t('Önek silindi.'));
      await invalidate('app:admin-forum');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  let recounting = $state(false);
  async function recount() {
    recounting = true;
    try {
      await api.post('/api/admin/forum/recount');
      toast.success(t('Sayaçlar yeniden hesaplandı.'));
      await invalidate('app:admin-forum');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      recounting = false;
    }
  }
</script>

<PageHeader
  icon={PageHeaderIcon}
  title={t('Forum yapısı')}
  description={t('Kategorileri ve bölümleri sürükleyip bırakarak sıralayın. Bir bölümü başka bir bölümün altına bırakırsanız alt bölüm olur.')}
>
  {#snippet actions()}
    <Button variant="ghost" onclick={recount} disabled={recounting}><RefreshCwIcon class={recounting ? 'animate-spin' : ''} />{t('Sayaçları yenile')}</Button>
    <Button variant="outline" onclick={() => openCat()}><FolderPlusIcon />{t('Kategori ekle')}</Button>
    <Button href="/admin/forum/boards/new"><PlusIcon />{t('Bölüm ekle')}</Button>
  {/snippet}
</PageHeader>

{#snippet boardList(owner: { boards?: Node[]; children?: Node[] }, key: 'boards' | 'children', depth: number)}
  <div
    class="grid gap-1.5 {depth === 0 ? 'min-h-3' : (owner[key]?.length ?? 0) > 0 ? 'mt-1.5 ml-7 border-l-2 border-dashed pl-3' : 'ml-7 min-h-2'}"
    use:dndzone={{ items: owner[key] ?? [], flipDurationMs: FLIP, type: 'board', dropTargetStyle: { outline: '2px dashed var(--primary)', borderRadius: '10px' } }}
    onconsider={(e) => onBoards(owner, key, e, false)}
    onfinalize={(e) => onBoards(owner, key, e, true)}
  >
    {#each owner[key] ?? [] as b (b.id)}
      <div animate:flip={{ duration: FLIP }}>
        <div class="group flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-xs transition-shadow hover:shadow-md">
          <GripVerticalIcon class="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
          {#if depth > 0}<CornerDownRightIcon class="size-3.5 shrink-0 text-muted-foreground" />{/if}
          <BoardIcon icon={b.icon} unread size={34} redirect={b.type === 'redirect'} />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <a href="/admin/forum/boards/{b.id}" class="font-medium hover:underline">{b.name}</a>
              {#if b.type === 'redirect'}<Badge variant="secondary" class="gap-1"><LinkIcon class="size-3" />{t('Bağlantı')}</Badge>{/if}
              {#if b.isHidden}<Badge variant="outline" class="gap-1"><EyeOffIcon class="size-3" />{t('Gizli')}</Badge>{/if}
              {#if b.requireApprovalTopics || b.requireApprovalPosts}<Badge variant="outline">{t('Onaylı')}</Badge>{/if}
            </div>
            <p class="truncate text-xs text-muted-foreground">
              {#if b.type === 'redirect'}
                {b.redirectUrl} · {t('{n} tıklama', { n: formatNumber(b.redirectClicks) })}
              {:else}
                {t('{n} konu', { n: formatNumber(b.topicCount) })} · {t('{n} mesaj', { n: formatNumber(b.postCount) })} · <LayersIcon class="inline size-3" /> {profileName(b.permissionProfileId)}
                {#if b.moderators.length} · <ShieldIcon class="inline size-3" /> {t('{n} moderatör', { n: b.moderators.length })}{/if}
              {/if}
            </p>
          </div>
          <div class="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
            {#if b.type === 'forum'}
              <Button variant="ghost" size="icon-sm" href="/f/{b.id}/{b.slug}" target="_blank" title={t('Forumda aç')}><ExternalLinkIcon /></Button>
            {/if}
            <Button variant="ghost" size="icon-sm" href="/admin/forum/boards/{b.id}" title={t('Düzenle')}><PencilIcon /></Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t('Sil')}
              class="text-destructive"
              onclick={() => {
                delBoard = b;
                delTarget = null;
              }}><Trash2Icon /></Button
            >
          </div>
        </div>
        {@render boardList(b, 'children', depth + 1)}
      </div>
    {/each}
  </div>
{/snippet}

{#if tree}
  {#if !cats.length}
    <EmptyState title={t('Henüz kategori yok')} description={t('Önce bir kategori ekleyin, ardından bölümleri oluşturun.')}>
      <Button size="sm" onclick={() => openCat()}><FolderPlusIcon />{t('Kategori ekle')}</Button>
    </EmptyState>
  {/if}

  <div
    class="grid gap-5"
    use:dndzone={{ items: cats, flipDurationMs: FLIP, type: 'category', dropTargetStyle: {} }}
    onconsider={(e) => onCats(e, false)}
    onfinalize={(e) => onCats(e, true)}
  >
    {#each cats as c (c.id)}
      <section animate:flip={{ duration: FLIP }} class="rounded-2xl border bg-muted/30 p-3">
        <header class="mb-2.5 flex items-center gap-2 px-1">
          <GripVerticalIcon class="size-4 cursor-grab text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <h2 class="flex items-center gap-1.5 font-semibold">{c.name}{#if c.background}<ImageIcon class="size-3.5 text-muted-foreground" aria-label={t('Arka plan görseli var')} />{/if}</h2>
            {#if c.description}<p class="truncate text-xs text-muted-foreground">{c.description}</p>{/if}
          </div>
          <Button variant="ghost" size="sm" href="/admin/forum/boards/new?category={c.id}"><PlusIcon />{t('Bölüm')}</Button>
          <Button variant="ghost" size="icon-sm" onclick={() => openCat(c)} title={t('Kategoriyi düzenle')}><PencilIcon /></Button>
          <Button variant="ghost" size="icon-sm" onclick={() => deleteCat(c)} title={t('Kategoriyi sil')} class="text-destructive"><Trash2Icon /></Button>
        </header>
        {@render boardList(c, 'boards', 0)}
        {#if !c.boards.length}<p class="px-2 py-3 text-center text-sm text-muted-foreground">{t('Bölümleri buraya sürükleyin ya da yeni bölüm ekleyin.')}</p>{/if}
      </section>
    {/each}
  </div>

  <!-- Önekler -->
  <section class="mt-10">
    <div class="mb-3 flex items-center justify-between gap-2">
      <div>
        <h2 class="flex items-center gap-2 text-lg font-semibold"><TagIcon class="size-5" />{t('Konu önekleri')}</h2>
        <p class="text-sm text-muted-foreground">{t('Konu başlıklarının önünde görünen renkli etiketler ("Soru", "Çözüldü" gibi).')}</p>
      </div>
      <Button variant="outline" onclick={() => openPrefix()}><PlusIcon />{t('Önek ekle')}</Button>
    </div>
    <div class="overflow-hidden rounded-xl border bg-card">
      {#each tree.prefixes as p (p.id)}
        <div class="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
          <PrefixBadge prefix={p} />
          <span class="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {p.boardIds?.length ? p.boardIds.map((id) => allBoards.find((b) => b.id === id)?.name ?? `#${id}`).join(', ') : t('Tüm bölümler')}
          </span>
          <Button variant="ghost" size="icon-sm" onclick={() => openPrefix(p)} title={t('Düzenle')}><PencilIcon /></Button>
          <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => deletePrefix(p.id, p.name)} title={t('Sil')}><Trash2Icon /></Button>
        </div>
      {:else}
        <p class="px-4 py-6 text-center text-sm text-muted-foreground">{t('Henüz önek yok.')}</p>
      {/each}
    </div>
  </section>
{/if}

<Dialog.Root bind:open={catOpen}>
  <Dialog.Content class="sm:max-w-md">
    <form class="grid gap-4" onsubmit={saveCat}>
      <Dialog.Header><Dialog.Title>{catEdit.id ? t('Kategoriyi düzenle') : t('Yeni kategori')}</Dialog.Title></Dialog.Header>
      <Field label={t('Ad')} for="cat-name"><Input id="cat-name" bind:value={catEdit.name} maxlength={80} required /></Field>
      <Field label={t('Açıklama')} for="cat-desc"><Input id="cat-desc" bind:value={catEdit.description} maxlength={300} /></Field>
      <label class="flex items-center gap-2 text-sm"><Switch bind:checked={catEdit.isCollapsible} />{t('Ziyaretçiler daraltabilsin')}</label>
      <Field
        label={t('Başlık arka planı')}
        hint={catEdit.id ? t('Geniş bir görsel seçin (en az 1200×200 piksel, en fazla 4 MB).') : t('Kategoriyi kaydettikten sonra görsel ekleyebilirsiniz.')}
      >
        <div
          class="relative flex h-24 items-end overflow-hidden rounded-xl border bg-muted bg-cover bg-center p-3"
          style={catEdit.background ? `background-image:linear-gradient(90deg,rgb(0 0 0/.75),rgb(0 0 0/.1)),url('${catEdit.background}')` : ''}
        >
          <span class={catEdit.background ? 'font-extrabold text-white drop-shadow' : 'font-extrabold text-muted-foreground'}>{catEdit.name || t('Kategori adı')}</span>
          <div class="absolute top-2 right-2 flex gap-1.5">
            {#if catEdit.id}
              <label class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-card/90 px-3 text-xs font-semibold shadow backdrop-blur hover:bg-card {bgBusy ? 'pointer-events-none opacity-60' : ''}">
                <UploadIcon class="size-3.5" />{catEdit.background ? t('Değiştir') : t('Görsel yükle')}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" onchange={uploadBg} />
              </label>
              {#if catEdit.background}
                <Button type="button" variant="destructive" size="icon-sm" onclick={removeBg} title={t('Kaldır')} class="bg-card/90"><Trash2Icon /></Button>
              {/if}
            {/if}
          </div>
        </div>
      </Field>
      <Dialog.Footer>
        <Button type="button" variant="ghost" onclick={() => (catOpen = false)}>{t('Vazgeç')}</Button>
        <Button type="submit" disabled={catSaving || !catEdit.name.trim()}>{t('Kaydet')}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root open={!!delBoard} onOpenChange={(v) => !v && (delBoard = null)}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{t('"{name}" silinsin mi?', { name: delBoard?.name ?? '' })}</Dialog.Title>
      <Dialog.Description>
        {#if delBoard?.children.length}{t('Bu bölümün alt bölümleri var; önce onları taşıyın.')}{:else if delBoard?.topicCount}{t('Bölümdeki {n} konu seçtiğiniz bölüme taşınacak.', { n: delBoard.topicCount })}{:else}{t('Bu işlem geri alınamaz.')}{/if}
      </Dialog.Description>
    </Dialog.Header>
    {#if delBoard?.topicCount}
      <Combobox
        options={allBoards.filter((b) => b.id !== delBoard?.id && b.type === 'forum').map((b) => ({ value: b.id, label: b.name, group: b.category }))}
        bind:value={delTarget}
        placeholder={t('Konuların taşınacağı bölüm')}
      />
    {/if}
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (delBoard = null)}>{t('Vazgeç')}</Button>
      <Button variant="destructive" onclick={confirmDeleteBoard} disabled={!!delBoard?.children.length || (!!delBoard?.topicCount && !delTarget)}>{t('Sil')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={pxOpen}>
  <Dialog.Content class="sm:max-w-md">
    <form class="grid gap-4" onsubmit={savePrefix}>
      <Dialog.Header><Dialog.Title>{pxEdit.id ? t('Öneki düzenle') : t('Yeni önek')}</Dialog.Title></Dialog.Header>
      <Field label={t('Ad')} for="px-name"><Input id="px-name" bind:value={pxEdit.name} maxlength={40} required /></Field>
      <Field label={t('Renk')}>
        <div class="flex flex-wrap items-center gap-2">
          {#each PALETTE as c (c)}
            <button
              type="button"
              class="size-7 rounded-full transition-transform hover:scale-110 {pxEdit.color === c ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}"
              style="background:{c}"
              aria-label={c}
              onclick={() => (pxEdit.color = c)}
            ></button>
          {/each}
          <input type="color" bind:value={pxEdit.color} class="size-7 cursor-pointer rounded-full border-0 bg-transparent" aria-label={t('Özel renk')} />
          {#if pxEdit.name}<PrefixBadge prefix={{ id: 0, name: pxEdit.name, color: pxEdit.color }} class="ml-auto" />{/if}
        </div>
      </Field>
      <Field label={t('Bölümler')} hint={t('Boş bırakırsanız tüm bölümlerde kullanılabilir.')}>
        <Combobox
          multiple
          options={allBoards.filter((b) => b.type === 'forum').map((b) => ({ value: b.id, label: b.name, group: b.category }))}
          bind:value={pxEdit.boardIds}
          placeholder={t('Tüm bölümler')}
        />
      </Field>
      <Dialog.Footer>
        <Button type="button" variant="ghost" onclick={() => (pxOpen = false)}>{t('Vazgeç')}</Button>
        <Button type="submit" disabled={!pxEdit.name.trim()}>{t('Kaydet')}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
