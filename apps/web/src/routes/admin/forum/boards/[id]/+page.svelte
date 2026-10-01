<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/ChatsCircle';
  import { goto, invalidate } from '$app/navigation';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import type { IconNode, Paginated, UserSummary } from '@forum/shared';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import SaveIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import MessagesSquareIcon from 'phosphor-svelte/lib/ChatsCircle';
  import LinkIcon from 'phosphor-svelte/lib/Link';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import Combobox, { type ComboOption } from '$lib/components/Combobox.svelte';
  import IconPicker from '$lib/components/IconPicker.svelte';
  import BoardIcon from '$lib/components/forum/BoardIcon.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';

  let { data } = $props();
  const tree = $derived(data.tree);
  const b = $derived(data.board);

  let name = $state('');
  let description = $state('');
  let categoryId = $state<number | null>(null);
  let parentId = $state<number | null>(null);
  let type = $state<'forum' | 'redirect'>('forum');
  let redirectUrl = $state('');
  let iconKind = $state<'icon' | 'image' | 'none'>('icon');
  let iconName = $state<string | null>('messages-square');
  let iconColor = $state<string | null>(null);
  let iconNodes = $state<IconNode | null>(null);
  let iconUrl = $state<string | null>(null);
  let profileId = $state<number | null>(null);
  let countPosts = $state(true);
  let approvalTopics = $state(false);
  let approvalPosts = $state(false);
  let isHidden = $state(false);
  let about = $state('');
  let cover = $state<string | null>(null);
  let coverBusy = $state(false);
  let modUsers = $state<number[]>([]);
  let modGroups = $state<number[]>([]);
  let modUserOptions = $state<ComboOption[]>([]);

  function syncState1() {
    const cat = Number(page.url.searchParams.get('category')) || null;
    if (!b) {
      categoryId = cat ?? tree?.categories[0]?.id ?? null;
      return;
    }
    name = b.name;
    description = b.description;
    categoryId = b.categoryId;
    parentId = b.parentId;
    type = b.type;
    redirectUrl = b.redirectUrl ?? '';
    iconKind = b.icon.kind;
    iconName = b.icon.name;
    iconColor = b.icon.color;
    iconNodes = b.icon.nodes;
    iconUrl = b.icon.url;
    profileId = b.permissionProfileId;
    countPosts = b.countPosts;
    approvalTopics = b.requireApprovalTopics;
    approvalPosts = b.requireApprovalPosts;
    isHidden = b.isHidden;
    about = b.about;
    cover = b.cover;
    modUsers = b.moderators.filter((m) => m.user).map((m) => m.user!.id);
    modGroups = b.moderators.filter((m) => m.group).map((m) => m.group!.id);
    modUserOptions = b.moderators.filter((m) => m.user).map((m) => userOption(m.user!));
  }
  syncState1();
  $effect.pre(syncState1);

  function userOption(u: UserSummary): ComboOption {
    return { value: u.id, label: u.displayName, description: `@${u.username}`, color: u.color, avatar: u };
  }

  async function searchUsers(q: string): Promise<ComboOption[]> {
    if (q.trim().length < 2) return [];
    const res = await api.get<Paginated<{ user: UserSummary }>>(`/api/members?q=${encodeURIComponent(q)}&perPage=10&sort=name&dir=asc`);
    return res.items.map((i) => userOption(i.user));
  }

  /** Bölüm ve alt bölümleri (üst bölüm seçiminde döngüyü önlemek için hariç tutulur) */
  const excluded = $derived.by(() => {
    if (!b || !tree) return new Set<number>();
    const all = tree.categories.flatMap((c) => c.boards);
    const out = new Set<number>([b.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const x of all) {
        if (x.parentId && out.has(x.parentId) && !out.has(x.id)) {
          out.add(x.id);
          grew = true;
        }
      }
    }
    return out;
  });

  const parentOptions = $derived(
    (tree?.categories.find((c) => c.id === categoryId)?.boards ?? [])
      .filter((x) => x.type === 'forum' && !excluded.has(x.id))
      .map((x) => ({ value: x.id, label: x.name })),
  );

  $effect(() => {
    // Kategori değişince geçersiz üst bölüm seçimini temizle.
    if (parentId && !parentOptions.some((o) => o.value === parentId)) parentId = null;
  });

  const form = createForm();
  const modForm = createForm();
  let uploading = $state(false);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const body = {
      categoryId,
      parentId,
      type,
      name,
      description,
      icon: { kind: iconKind, name: iconKind === 'icon' ? iconName : null, color: iconColor },
      redirectUrl: type === 'redirect' ? redirectUrl : null,
      permissionProfileId: profileId,
      countPosts,
      requireApprovalTopics: approvalTopics,
      requireApprovalPosts: approvalPosts,
      isHidden,
      about,
    };
    const res = await form.submit(
      () => (b ? api.put(`/api/admin/forum/boards/${b.id}`, body) : api.post<{ id: number }>('/api/admin/forum/boards', body)),
      { success: b ? t('Bölüm kaydedildi.') : t('Bölüm oluşturuldu.') },
    );
    if (!res) return;
    if (!b && typeof res === 'object' && res && 'id' in res) {
      if (modUsers.length || modGroups.length) await api.put(`/api/admin/forum/boards/${res.id}/moderators`, { userIds: modUsers, groupIds: modGroups });
      await goto(`/admin/forum/boards/${res.id}`, { invalidateAll: true });
    } else {
      await invalidate('app:admin-forum');
    }
  }

  async function saveModerators() {
    if (!b) return;
    await modForm.submit(() => api.put(`/api/admin/forum/boards/${b.id}/moderators`, { userIds: modUsers, groupIds: modGroups }), {
      success: t('Moderatörler kaydedildi.'),
      toastErrors: true,
    });
    await invalidate('app:admin-forum');
  }

  async function uploadIcon(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !b) return;
    uploading = true;
    try {
      const res = await api.upload<{ url: string }>(`/api/admin/forum/boards/${b.id}/icon`, file, file.name);
      iconUrl = res.url;
      iconKind = 'image';
      toast.success(t('İkon görseli yüklendi.'));
      await invalidate('app:admin-forum');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Yüklenemedi.'));
    } finally {
      uploading = false;
    }
  }

  async function uploadCover(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !b) return;
    coverBusy = true;
    try {
      cover = (await api.upload<{ url: string }>(`/api/admin/forum/boards/${b.id}/cover`, file, file.name)).url;
      toast.success(t('Kapak fotoğrafı yüklendi.'));
      await invalidate('app:admin-forum');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Yüklenemedi.'));
    } finally {
      coverBusy = false;
    }
  }
  async function removeCover() {
    if (!b) return;
    coverBusy = true;
    try {
      await api.delete(`/api/admin/forum/boards/${b.id}/cover`);
      cover = null;
      await invalidate('app:admin-forum');
    } finally {
      coverBusy = false;
    }
  }

  const preview = $derived({ kind: iconKind, name: iconName, nodes: iconNodes, color: iconColor, url: iconKind === 'image' ? iconUrl : null });
  const segBtn = 'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors';
</script>

<PageHeader
  icon={PageHeaderIcon}
  title={b ? b.name : t('Yeni bölüm')}
  description={b ? t('Bölüm ayarlarını, ikonunu, yetki profilini ve moderatörlerini düzenleyin.') : t('Forumda yeni bir bölüm oluşturun.')}
>
  {#snippet actions()}
    <Button variant="ghost" href="/admin/forum"><ArrowLeftIcon />{t('Forum yapısı')}</Button>
  {/snippet}
</PageHeader>

{#if tree}
  <form class="grid gap-6 lg:grid-cols-[1fr_20rem]" onsubmit={save}>
    <div class="grid content-start gap-6">
      <FormMessage message={form.message} />
      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Temel bilgiler')}</Card.Title></Card.Header>
        <Card.Content class="grid gap-4">
          <div class="flex gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label={t('Bölüm türü')}>
            <button type="button" role="radio" aria-checked={type === 'forum'} class={cn(segBtn, type === 'forum' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')} onclick={() => (type = 'forum')}>
              <MessagesSquareIcon class="size-4" />{t('Tartışma bölümü')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={type === 'redirect'}
              disabled={!!b && b.type === 'forum' && b.topicCount > 0}
              class={cn(segBtn, type === 'redirect' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground', 'disabled:opacity-40')}
              onclick={() => (type = 'redirect')}
            >
              <LinkIcon class="size-4" />{t('Bağlantı')}
            </button>
          </div>
          <Field label={t('Ad')} for="name" error={form.error('name')}><Input id="name" bind:value={name} maxlength={80} required /></Field>
          <Field label={t('Açıklama')} for="desc" error={form.error('description')}><Textarea id="desc" bind:value={description} maxlength={500} rows={2} /></Field>
          {#if type === 'redirect'}
            <Field label={t('Bağlantı adresi')} for="url" error={form.error('redirectUrl')} hint={t('Site dışı (https://…) ya da site içi (/…) bir adres. Tıklamalar sayılır.')}>
              <Input id="url" bind:value={redirectUrl} placeholder="https://discord.gg/…" />
            </Field>
          {/if}
          <div class="grid gap-4 sm:grid-cols-2">
            <Field label={t('Kategori')} error={form.error('categoryId')}>
              <Combobox options={tree.categories.map((c) => ({ value: c.id, label: c.name }))} bind:value={categoryId} placeholder={t('Kategori seçin')} />
            </Field>
            <Field label={t('Üst bölüm')} error={form.error('parentId')} hint={t('Seçerseniz alt bölüm olur.')}>
              <Combobox options={parentOptions} bind:value={parentId} placeholder={t('Yok (ana bölüm)')} clearable />
            </Field>
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">{t('İkon')}</Card.Title>
          <Card.Description>{t('Ana sayfada bölüm adının solunda görünür.')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-4">
          <div class="flex gap-1 rounded-lg bg-muted p-1">
            {#each [{ k: 'icon', l: t('Hazır ikon') }, { k: 'image', l: t('Görsel') }, { k: 'none', l: t('Yok') }] as opt (opt.k)}
              <button type="button" class={cn(segBtn, iconKind === opt.k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')} onclick={() => (iconKind = opt.k as typeof iconKind)}>{opt.l}</button>
            {/each}
          </div>
          {#if iconKind === 'icon'}
            <IconPicker bind:name={iconName} bind:color={iconColor} bind:nodes={iconNodes} />
            {#if form.error('icon')}<p class="text-xs text-destructive">{form.error('icon')}</p>{/if}
          {:else if iconKind === 'image'}
            {#if b}
              <label class="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 transition-colors hover:bg-accent/40">
                {#if uploading}<LoaderIcon class="size-5 animate-spin" />{:else}<UploadIcon class="size-5 text-muted-foreground" />{/if}
                <span class="text-sm">{iconUrl ? t('Görseli değiştir') : t('Görsel yükle')} <span class="text-muted-foreground">{t('(PNG/JPEG/WEBP, kare önerilir)')}</span></span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" onchange={uploadIcon} />
              </label>
            {:else}
              <p class="text-sm text-muted-foreground">{t('Görsel yüklemek için önce bölümü kaydedin.')}</p>
            {/if}
          {/if}
        </Card.Content>
      </Card.Root>

      {#if type === 'forum'}
        <Card.Root>
          <Card.Header>
            <Card.Title class="text-base">{t('Bölüm sayfası')}</Card.Title>
            <Card.Description>{t('Bölüm açılınca en üstte görünen kapak fotoğrafı ve ayrıntılı açıklama (kurallar, bilgiler, bağlantılar).')}</Card.Description>
          </Card.Header>
          <Card.Content class="grid gap-4">
            {#if b}
              <div class="relative overflow-hidden rounded-lg border bg-muted/30">
                {#if cover}
                  <img src={cover} alt="" class="h-40 w-full object-cover" />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                  <div class="absolute right-3 bottom-3 flex gap-2">
                    <label class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-black/50 px-3 text-xs font-semibold text-white backdrop-blur hover:bg-black/70">
                      {#if coverBusy}<LoaderIcon class="size-4 animate-spin" />{:else}<UploadIcon class="size-4" />{/if}{t('Değiştir')}
                      <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange={uploadCover} />
                    </label>
                    <Button type="button" size="sm" variant="secondary" class="h-8 bg-black/50 text-white backdrop-blur hover:bg-black/70" onclick={removeCover} disabled={coverBusy}>{t('Kaldır')}</Button>
                  </div>
                {:else}
                  <label class="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:bg-accent/40">
                    {#if coverBusy}<LoaderIcon class="size-5 animate-spin" />{:else}<UploadIcon class="size-5" />{/if}
                    {t('Kapak fotoğrafı yükle')} <span class="text-xs">{t('(geniş görsel önerilir, ör. 1600×400 · en fazla 6 MB)')}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange={uploadCover} />
                  </label>
                {/if}
              </div>
            {:else}
              <p class="text-sm text-muted-foreground">{t('Kapak fotoğrafı yüklemek için önce bölümü kaydedin.')}</p>
            {/if}
            <Field label={t('Ayrıntılı açıklama')} error={form.error('about')} hint={t('Boş bırakılırsa gösterilmez. Başlık, liste, bağlantı ve görsel kullanılabilir.')}>
              <Editor bind:value={about} maxLength={20000} minHeight={160} mentions={false} />
            </Field>
          </Card.Content>
        </Card.Root>
      {/if}

      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Yetkiler ve kurallar')}</Card.Title></Card.Header>
        <Card.Content class="grid gap-4">
          <Field label={t('Yetki profili')} hint={t('Hangi grupların bu bölümü görebileceğini ve yazabileceğini belirler.')}>
            <div class="flex gap-2">
              <Combobox
                class="flex-1"
                options={tree.profiles.map((p) => ({ value: p.id, label: p.name, description: p.description }))}
                bind:value={profileId}
                placeholder={t('Varsayılan')}
                clearable
              />
              <Button variant="outline" href="/admin/forum/profiles/{profileId ?? tree.profiles.find((p) => p.key === 'default')?.id}">{t('Düzenle')}</Button>
            </div>
          </Field>
          {#if type === 'forum'}
            <div class="grid gap-3">
              <label class="flex items-start gap-3 text-sm"><Switch bind:checked={countPosts} class="mt-0.5" /><span>{t('Mesajlar üyelerin mesaj sayısına eklensin')}<span class="block text-xs text-muted-foreground">{t('Kapatırsanız (ör. oyun/spam bölümleri) rütbelere etki etmez.')}</span></span></label>
              <label class="flex items-start gap-3 text-sm"><Switch bind:checked={approvalTopics} class="mt-0.5" /><span>{t('Yeni konular onaydan sonra yayınlansın')}</span></label>
              <label class="flex items-start gap-3 text-sm"><Switch bind:checked={approvalPosts} class="mt-0.5" /><span>{t('Yanıtlar onaydan sonra yayınlansın')}</span></label>
            </div>
          {/if}
          <label class="flex items-start gap-3 text-sm"><Switch bind:checked={isHidden} class="mt-0.5" /><span>{t('Ana sayfada gizle')}<span class="block text-xs text-muted-foreground">{t('Bölüm listede görünmez ama bağlantıyla erişilebilir (moderatörler görür).')}</span></span></label>
        </Card.Content>
      </Card.Root>
    </div>

    <aside class="grid content-start gap-6 lg:sticky lg:top-6">
      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Önizleme')}</Card.Title></Card.Header>
        <Card.Content>
          <div class="flex items-center gap-3 rounded-xl border bg-background p-3">
            <BoardIcon icon={preview} unread redirect={type === 'redirect'} />
            <div class="min-w-0">
              <p class="truncate font-semibold">{name || t('Bölüm adı')}</p>
              <p class="line-clamp-2 text-xs text-muted-foreground">{description || t('Açıklama')}</p>
            </div>
          </div>
        </Card.Content>
      </Card.Root>

      {#if type === 'forum'}
        <Card.Root>
          <Card.Header>
            <Card.Title class="text-base">{t('Moderatörler')}</Card.Title>
            <Card.Description>{t('Bu bölümde "Moderatör" grubunun yetkilerini alırlar.')}</Card.Description>
          </Card.Header>
          <Card.Content class="grid gap-3">
            <Field label={t('Üyeler')}>
              <Combobox multiple load={searchUsers} selected={modUserOptions} bind:value={modUsers} placeholder={t('Üye ekle')} searchPlaceholder={t('En az 2 harf yazın…')} />
            </Field>
            <Field label={t('Gruplar')}>
              <Combobox
                multiple
                options={data.groups.filter((g) => g.kind !== 'system').map((g) => ({ value: g.id, label: g.name, color: g.color, swatch: g.color }))}
                bind:value={modGroups}
                placeholder={t('Grup ekle')}
              />
            </Field>
            {#if b}<Button type="button" variant="outline" onclick={saveModerators} disabled={modForm.submitting}>{t('Moderatörleri kaydet')}</Button>{/if}
          </Card.Content>
        </Card.Root>
      {/if}

      <Button type="submit" size="lg" disabled={form.submitting || !name.trim() || !categoryId}>
        {#if form.submitting}<LoaderIcon class="animate-spin" />{:else}<SaveIcon />{/if}{b ? t('Değişiklikleri kaydet') : t('Bölümü oluştur')}
      </Button>
    </aside>
  </form>
{/if}
