<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Shield';
  import type { UserSummary } from '@forum/shared';
  import { goto, invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import XIcon from 'phosphor-svelte/lib/X';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import GroupBadge from '$lib/components/GroupBadge.svelte';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import UserPicker from '$lib/components/UserPicker.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import { api, errorMessage } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDate, fromLocalInput } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const g = $derived(data.group);
  const isSystem = $derived(!!g?.systemKey || g?.kind === 'system');

  const PRESETS = ['#dc2626', '#ea580c', '#d97706', '#65a30d', '#16a34a', '#0d9488', '#0284c7', '#2563eb', '#7c3aed', '#c026d3', '#db2777', '#475569'];

  let name = $state('');
  let description = $state('');
  let hasColor = $state(false);
  let color = $state('#2563eb');
  let iconCount = $state(0);
  let kind = $state<'regular' | 'post_count'>('regular');
  let minPosts = $state<number | ''>(0);
  let joinType = $state('closed');
  let visibility = $state('visible');
  let parentId = $state('');
  let require2fa = $state(false);
  let sortOrder = $state(0);

  // SSR sırasında da dolu gelmesi için hemen çalıştırılır; veri değişince yeniden eşitlenir.
  function syncState1() {
    if (!g) return;
    name = g.name;
    description = g.description;
    hasColor = !!g.color;
    color = g.color ?? '#2563eb';
    iconCount = g.iconCount;
    kind = g.kind === 'post_count' ? 'post_count' : 'regular';
    minPosts = g.minPosts ?? 0;
    joinType = g.joinType;
    visibility = g.visibility;
    parentId = g.parentId ? String(g.parentId) : '';
    require2fa = g.require2fa;
    sortOrder = g.sortOrder;
  }
  syncState1();
  $effect.pre(syncState1);

  const form = createForm();
  const preview = $derived({ id: 0, name: name || t('Grup adı'), color: hasColor ? color : null, iconUrl: g?.iconUrl ?? null, iconCount });
  const parents = $derived(data.groups.filter((x) => x.id !== g?.id && !x.parentId && x.systemKey !== 'admin' && x.kind !== 'post_count'));

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const body = {
      name,
      description,
      color: hasColor ? color : null,
      iconCount: Number(iconCount),
      kind,
      minPosts: kind === 'post_count' ? Number(minPosts) : null,
      joinType,
      visibility,
      parentId: parentId ? Number(parentId) : null,
      require2fa,
      sortOrder: Number(sortOrder),
    };
    if (data.isNew) {
      const res = await form.submit(() => api.post<{ id: number }>('/api/admin/groups', body), { success: t('Grup oluşturuldu.') });
      if (res) await goto(`/admin/groups/${res.id}`);
    } else {
      const res = await form.submit(() => api.put(`/api/admin/groups/${g!.id}`, body), { success: t('Grup kaydedildi.') });
      if (res) await invalidate('app:admin-group');
    }
  }

  async function remove() {
    if (!g) return;
    if (!(await confirmAction({ title: t('"{name}" grubu silinsin mi?', { name: g.name }), description: t('Üyelikler ve grup yetkileri kaldırılır.'), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/groups/${g.id}`);
      toast.success(t('Grup silindi.'));
      await goto('/admin/groups');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function run(fn: () => Promise<unknown>, success: string) {
    try {
      await fn();
      toast.success(success);
      await invalidate('app:admin-group');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  // Liderler
  async function setModerators(ids: number[]) {
    await run(() => api.put(`/api/admin/groups/${g!.id}/moderators`, { userIds: ids }), t('Grup liderleri güncellendi.'));
  }

  // Üye ekleme
  let picked = $state<UserSummary | null>(null);
  let asPrimary = $state(false);
  let expires = $state('');
  async function addMember() {
    if (!picked || !g) return;
    const u = picked;
    await run(() => api.post(`/api/admin/groups/${g.id}/members`, { userId: u.id, asPrimary, expiresAt: fromLocalInput(expires) }), t('{name} eklendi.', { name: u.displayName }));
    picked = null;
    expires = '';
  }
</script>

<PageHeader icon={PageHeaderIcon} title={data.isNew ? t('Yeni grup') : (g ? tc(g.name) : t('Grup'))}>
  {#snippet actions()}
    <Button href="/admin/groups" variant="outline" size="sm">{t('Tüm gruplar')}</Button>
    {#if g && !isSystem && !g.isProtected}<Button variant="destructive" size="sm" onclick={remove}><TrashIcon />{t('Sil')}</Button>{/if}
  {/snippet}
</PageHeader>

{#if data.isNew || g}
  <div class="grid gap-6 lg:grid-cols-[1fr_320px]">
    <Card.Root>
      <Card.Content>
        <form class="grid gap-4" onsubmit={save}>
          <FormMessage message={form.message} />
          <Field label={t('Grup adı')} for="g-name" error={form.error('name')} required><Input id="g-name" bind:value={name} maxlength={50} /></Field>
          <Field label={t('Açıklama')} for="g-desc" error={form.error('description')}><Textarea id="g-desc" bind:value={description} rows={2} /></Field>

          <div class="grid gap-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">{t('İsim rengi')}</span>
              <label class="flex items-center gap-2 text-sm"><Switch bind:checked={hasColor} />{t('Renk kullan')}</label>
            </div>
            {#if hasColor}
              <div class="flex flex-wrap items-center gap-2">
                {#each PRESETS as c (c)}
                  <button
                    type="button"
                    class="size-7 rounded-full ring-offset-2 ring-offset-background {color === c ? 'ring-2 ring-foreground' : ''}"
                    style="background:{c}"
                    onclick={() => (color = c)}
                    aria-label={c}
                  ></button>
                {/each}
                <input type="color" bind:value={color} class="h-8 w-12 cursor-pointer rounded border bg-transparent" aria-label={t('Özel renk')} />
                <Input bind:value={color} class="w-28 font-mono" maxlength={7} />
              </div>
              {#if form.error('color')}<p class="text-xs text-destructive">{form.error('color')}</p>{/if}
            {/if}
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <Field label={t('Yıldız / ikon sayısı')} for="g-icons" hint={t('Rütbe görseli yoksa rozette kaç yıldız gösterilecek.')}>
              <Input id="g-icons" type="number" min="0" max="10" bind:value={iconCount} />
            </Field>
            <Field label={t('Sıra')} for="g-sort" hint={t('Küçük değerler önce listelenir.')}>
              <Input id="g-sort" type="number" bind:value={sortOrder} />
            </Field>
          </div>

          {#if !isSystem}
            <div class="grid gap-4 sm:grid-cols-2">
              <Field label={t('Grup türü')} for="g-kind" error={form.error('kind')}>
                <NativeSelect
                  id="g-kind"
                  bind:value={kind}
                  options={[
                    { value: 'regular', label: t('Normal grup') },
                    { value: 'post_count', label: t('Rütbe (mesaj sayısına göre)') },
                  ]}
                />
              </Field>
              {#if kind === 'post_count'}
                <Field label={t('Gereken mesaj sayısı')} for="g-min" error={form.error('minPosts')}>
                  <Input id="g-min" type="number" min="0" bind:value={minPosts} />
                </Field>
              {:else}
                <Field label={t('Katılım')} for="g-join">
                  <NativeSelect
                    id="g-join"
                    bind:value={joinType}
                    options={[
                      { value: 'closed', label: t('Kapalı (yalnız yöneticiler ekler)') },
                      { value: 'requestable', label: t('İstekle (liderler onaylar)') },
                      { value: 'free', label: t('Serbest (herkes katılabilir)') },
                    ]}
                  />
                </Field>
              {/if}
            </div>
          {/if}

          {#if g?.systemKey !== 'guest' && g?.systemKey !== 'member'}
            <div class="grid gap-4 sm:grid-cols-2">
              <Field label={t('Görünürlük')} for="g-vis">
                <NativeSelect
                  id="g-vis"
                  bind:value={visibility}
                  options={[
                    { value: 'visible', label: t('Görünür') },
                    { value: 'hidden', label: t('Gizli (yalnız üyeleri görür)') },
                    { value: 'additional_only', label: t('Yalnızca ek grup olabilir') },
                  ]}
                />
              </Field>
              {#if !g?.systemKey && kind === 'regular'}
                <Field label={t('Yetkileri miras al')} for="g-parent" error={form.error('parentId')} hint={t('Seçilirse bu grubun yetkileri o gruptan gelir.')}>
                  <NativeSelect id="g-parent" bind:value={parentId} options={[{ value: '', label: t('Miras yok') }, ...parents.map((p) => ({ value: String(p.id), label: p.name }))]} />
                </Field>
              {/if}
            </div>
          {/if}

          <label class="flex items-center justify-between gap-4 text-sm">
            <span>
              <span class="font-medium">{t('İki adımlı doğrulama zorunlu')}</span>
              <span class="block text-xs text-muted-foreground">{t('Bu grubun üyeleri 2FA kurmadan foruma devam edemez.')}</span>
            </span>
            <Switch bind:checked={require2fa} />
          </label>

          <div><Button type="submit" disabled={form.submitting}>{data.isNew ? t('Grubu oluştur') : t('Kaydet')}</Button></div>
        </form>
      </Card.Content>
    </Card.Root>

    <div class="grid content-start gap-6">
      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Önizleme')}</Card.Title></Card.Header>
        <Card.Content class="grid gap-3">
          <GroupBadge group={preview} />
          <span class="font-semibold" style={preview.color ? `color:${preview.color}` : undefined}>{t('Örnek Üye')}</span>
        </Card.Content>
      </Card.Root>
      {#if g}
        <Card.Root>
          <Card.Header>
            <Card.Title class="text-base">{t('Rütbe görseli')}</Card.Title>
            <Card.Description>{t('Yüklenirse grup adı ve yıldızlar yerine bu görsel yatay bir banner olarak gösterilir (mesajlarda, profilde, rozetlerde). Önerilen boyut 300×60 piksel; şeffaf PNG, WEBP ya da hareketli GIF.')}</Card.Description>
          </Card.Header>
          <Card.Content>
            <ImageUpload
              current={g.iconUrl}
              maxBytes={1024 * 1024}
              previewSize={56}
              previewWidth={260}
              onupload={async (blob, filename) => {
                await api.upload(`/api/admin/groups/${g.id}/icon`, blob, filename);
                await invalidate('app:admin-group');
              }}
              onremove={async () => {
                await api.delete(`/api/admin/groups/${g.id}/icon`);
                await invalidate('app:admin-group');
              }}
            />
          </Card.Content>
        </Card.Root>
      {/if}
    </div>
  </div>

  {#if g && g.kind === 'regular' && g.systemKey !== 'guest' && g.systemKey !== 'member'}
    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">{t('Grup liderleri')}</Card.Title>
          <Card.Description>{t('Katılım isteklerini onaylayabilir, üye ekleyip çıkarabilirler.')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-3">
          <div class="flex flex-wrap gap-2">
            {#each g.moderators as m (m.id)}
              <span class="inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2 text-sm">
                <UserName user={m} link={false} />
                <button
                  type="button"
                  class="rounded-full p-0.5 hover:bg-muted"
                  onclick={() => setModerators(g.moderators.filter((x) => x.id !== m.id).map((x) => x.id))}
                  aria-label={t('Kaldır')}><XIcon class="size-3.5" /></button
                >
              </span>
            {:else}
              <span class="text-sm text-muted-foreground">{t('Lider yok.')}</span>
            {/each}
          </div>
          <UserPicker placeholder={t('Lider ekle…')} exclude={g.moderators.map((m) => m.id)} onpick={(u) => setModerators([...g.moderators.map((m) => m.id), u.id])} />
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Üye ekle')}</Card.Title></Card.Header>
        <Card.Content class="grid gap-3">
          {#if picked}
            <div class="flex items-center justify-between rounded-lg border p-2">
              <UserName user={picked} avatar link={false} />
              <Button variant="ghost" size="xs" onclick={() => (picked = null)}>{t('Değiştir')}</Button>
            </div>
          {:else}
            <UserPicker onpick={(u) => (picked = u)} />
          {/if}
          <label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={asPrimary} />{t('Ana grup olarak ata')}</label>
          <Field label={t('Üyelik bitişi')} for="m-exp" hint={t('Boş = süresiz')}><Input id="m-exp" type="datetime-local" bind:value={expires} /></Field>
          <div><Button onclick={addMember} disabled={!picked}>{t('Ekle')}</Button></div>
        </Card.Content>
      </Card.Root>
    </div>

    {#if g.requests.length}
      <Card.Root class="mt-6">
        <Card.Header><Card.Title class="text-base">{t('Bekleyen istekler')}</Card.Title></Card.Header>
        <Card.Content class="grid gap-2">
          {#each g.requests as r (r.id)}
            <div class="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div class="grid">
                <UserName user={r.user} />
                {#if r.reason}<span class="text-muted-foreground">{r.reason}</span>{/if}
              </div>
              <div class="flex gap-1">
                <Button size="sm" onclick={() => run(() => api.post(`/api/admin/group-requests/${r.id}`, { approve: true }), t('Onaylandı.'))}>{t('Onayla')}</Button>
                <Button size="sm" variant="destructive" onclick={() => run(() => api.post(`/api/admin/group-requests/${r.id}`, { approve: false }), t('Reddedildi.'))}
                  >{t('Reddet')}</Button
                >
              </div>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    {/if}
  {/if}

  {#if data.members && g?.systemKey !== 'guest'}
    <h2 class="mt-8 mb-3 text-lg font-semibold">{t('Üyeler')} ({data.members.total})</h2>
    <div class="grid gap-2">
      {#each data.members.items as m (m.user.id)}
        <div class="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
          <div class="grid">
            <UserName user={m.user} avatar avatarSize={22} />
            <span class="text-xs text-muted-foreground">{m.isPrimary ? t('Ana grup') : t('Ek grup')}{#if m.expiresAt} · {t('{date} tarihine kadar', { date: formatDate(m.expiresAt) })}{/if}</span>
          </div>
          <div class="flex gap-1">
            <Button href="/admin/users/{m.user.id}" size="xs" variant="ghost">{t('Üyeyi yönet')}</Button>
            {#if g?.kind === 'regular' && g.systemKey !== 'member'}
              <Button size="xs" variant="ghost" onclick={() => run(() => api.delete(`/api/admin/groups/${g.id}/members/${m.user.id}`), t('Üye çıkarıldı.'))}>{t('Çıkar')}</Button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    <Pagination page={data.members.page} perPage={data.members.perPage} total={data.members.total} />
  {/if}
{/if}
