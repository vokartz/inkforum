<script lang="ts">
  import { goto, invalidate, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ExternalLinkIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import * as Card from '$lib/components/ui/card';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import GroupBadge from '$lib/components/GroupBadge.svelte';
  import Field from '$lib/components/Field.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import WarningBar from '$lib/components/WarningBar.svelte';
  import WarningList from '$lib/components/WarningList.svelte';
  import AchievementIcon from '$lib/components/AchievementIcon.svelte';
  import IssueWarningDialog from '$lib/components/IssueWarningDialog.svelte';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import BanForm from '$lib/components/admin/BanForm.svelte';
  import { api, errorMessage } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { confirmAction, promptAction } from '$lib/confirm.svelte';
  import { formatDate, formatDateTime, fromLocalInput, toLocalInput } from '$lib/format';
  import { can, profileUrl } from '$lib/viewer';
  import { t, tc } from '$lib/i18n.svelte';
  import type { GroupDto, WarningItem } from '$lib/types';

  let { data } = $props();
  const d = $derived(data.detail!);
  const v = $derived(data.viewer);

  async function refresh() {
    await invalidate('app:admin-user');
  }

  async function run(fn: () => Promise<unknown>, success: string) {
    try {
      await fn();
      toast.success(success);
      await refresh();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  }

  const general = createForm();
  let email = $state('');
  let status = $state('active');
  let emailVerified = $state(false);
  let postCount = $state(0);
  let customTitle = $state('');
  let mustChangePassword = $state(false);
  let isWatched = $state(false);
  let newPassword = $state('');
  let username = $state('');
  let displayName = $state('');

  function syncState1() {
    if (!data.detail) return;
    email = d.email;
    status = d.status === 'deactivated' ? 'deactivated' : 'active';
    emailVerified = !!d.emailVerifiedAt;
    postCount = d.postCount;
    customTitle = d.summary.customTitle ?? '';
    mustChangePassword = d.mustChangePassword;
    isWatched = d.isWatched;
    username = d.summary.username;
    displayName = d.summary.displayName;
  }
  syncState1();
  $effect.pre(syncState1);

  async function saveGeneral(e: SubmitEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { email, emailVerified, postCount: Number(postCount), customTitle: customTitle || null, mustChangePassword, isWatched };
    if (d.status === 'active' || d.status === 'deactivated') body.status = status;
    if (newPassword) body.newPassword = newPassword;
    const res = await general.submit(() => api.put(`/api/admin/users/${d.summary.id}`, body), { success: t('Üye güncellendi.') });
    if (res) {
      newPassword = '';
      await refresh();
    }
  }

  async function saveNames() {
    if (username !== d.summary.username) await run(() => api.post(`/api/admin/users/${d.summary.id}/username`, { username }), t('Kullanıcı adı değiştirildi.'));
    if (displayName !== d.summary.displayName)
      await run(() => api.post(`/api/admin/users/${d.summary.id}/display-name`, { displayName }), t('Görünen ad değiştirildi.'));
  }

  async function approve() {
    await run(() => api.post(`/api/admin/users/${d.summary.id}/approve`), t('Üyelik onaylandı.'));
  }

  async function reject() {
    const reason = await promptAction({
      title: t('{name} adlı üyenin başvurusu reddedilsin mi?', { name: d.summary.displayName }),
      description: t('Gerekçe yazarsan üyeye gönderilen e-postada gösterilir.'),
      input: { label: t('Gerekçe (isteğe bağlı)'), multiline: true, placeholder: t('ör. Kayıt bilgileri eksik') },
      confirmLabel: t('Reddet'),
      destructive: true,
    });
    if (reason === null) return;
    if (await run(() => api.post(`/api/admin/users/${d.summary.id}/reject`, { reason: reason || null }), t('Başvuru reddedildi.'))) goto('/admin/users');
  }

  async function remove() {
    if (
      !(await confirmAction({
        title: t('{name} silinsin mi?', { name: d.summary.displayName }),
        description: t('Kişisel veriler kalıcı olarak silinir; kullanıcı adı ve e-posta serbest kalır. Bu işlem geri alınamaz.'),
        confirmLabel: t('Hesabı sil'),
        destructive: true,
      }))
    )
      return;
    try {
      await api.delete(`/api/admin/users/${d.summary.id}`);
      toast.success(t('Hesap silindi.'));
      await goto('/admin/users');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const profileForm = createForm();
  let bio = $state('');
  let location = $state('');
  let websiteUrl = $state('');
  let birthdate = $state('');
  let signature = $state('');
  function syncState2() {
    if (!data.detail) return;
    bio = d.profile.bio;
    location = d.profile.location;
    websiteUrl = d.profile.websiteUrl;
    birthdate = d.profile.birthdate;
    signature = d.profile.signature;
  }
  syncState2();
  $effect.pre(syncState2);

  async function saveProfile(e: SubmitEvent) {
    e.preventDefault();
    const custom = Object.fromEntries(d.profile.customFields.map((f) => [f.key, f.value]));
    const ok = await profileForm.submit(() => api.put(`/api/admin/users/${d.summary.id}/profile`, { bio, location, websiteUrl, birthdate, customFields: custom }), {
      success: t('Profil kaydedildi.'),
    });
    if (ok) await api.put(`/api/admin/users/${d.summary.id}/signature`, { signature }).catch(() => undefined);
  }

  const assignable = $derived(data.groups.filter((g) => g.kind === 'regular' && !['guest', 'member', 'moderator'].includes(g.systemKey ?? '')));
  let primaryId = $state('');
  let primaryExpires = $state('');
  let additional = $state<Array<{ groupId: number; expires: string }>>([]);
  let addGroupId = $state('');
  function syncState3() {
    if (!data.detail) return;
    primaryId = d.memberships.primary ? String(d.memberships.primary.id) : '';
    primaryExpires = toLocalInput(d.memberships.primaryExpiresAt);
    additional = d.memberships.additional.map((a) => ({ groupId: a.group.id, expires: toLocalInput(a.expiresAt) }));
  }
  syncState3();
  $effect.pre(syncState3);
  const groupById = (id: number): GroupDto | undefined => data.groups.find((g) => g.id === id);

  async function saveGroups() {
    await run(
      () =>
        api.put(`/api/admin/users/${d.summary.id}/groups`, {
          primaryGroupId: primaryId ? Number(primaryId) : null,
          primaryExpiresAt: fromLocalInput(primaryExpires),
          additional: additional.map((a) => ({ groupId: a.groupId, expiresAt: fromLocalInput(a.expires) })),
        }),
      t('Gruplar güncellendi.'),
    );
  }

  let warnOpen = $state(false);
  let banOpen = $state(false);

  async function revokeWarning(w: WarningItem) {
    const reason = await promptAction({
      title: t('Uyarı geri alınsın mı?'),
      description: t('Uyarı puanı üyenin toplamından düşülür.'),
      input: { label: t('Gerekçe (isteğe bağlı)'), multiline: true },
      confirmLabel: t('Geri al'),
      tone: 'warning',
    });
    if (reason === null) return;
    await run(() => api.post(`/api/mod/warnings/${w.id}/revoke`, { reason: reason || null }), t('Uyarı geri alındı.'));
  }

  let awardId = $state('');
  let awardReason = $state('');
  async function award() {
    if (!awardId) return;
    await run(() => api.post(`/api/admin/achievements/${awardId}/award`, { userId: d.summary.id, reason: awardReason || null }), t('Başarı verildi.'));
    awardId = '';
    awardReason = '';
  }

  let note = $state('');
  async function addNote() {
    if (!note.trim()) return;
    if (await run(() => api.post(`/api/admin/users/${d.summary.id}/notes`, { body: note }), t('Not eklendi.'))) note = '';
  }
</script>

<svelte:head><title>{data.detail ? t('{name} — Üye yönetimi', { name: data.detail.summary.displayName }) : t('Üye yönetimi')}</title></svelte:head>

{#if data.detail}

  <div class="mb-6 flex flex-wrap items-center gap-4">
    <UserAvatar user={d.summary} size={64} />
    <div class="grid min-w-0 flex-1 gap-1">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-semibold" style={d.summary.color ? `color:${d.summary.color}` : undefined}>{d.summary.displayName}</h1>
        <StatusBadge status={d.status} />
        {#if d.isAdmin}<span class="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">{t('Yönetici')}</span>{/if}
        {#if d.twoFactorEnabled}<span class="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">2FA</span>{/if}
      </div>
      <p class="text-sm text-muted-foreground">
        #{d.summary.id} · @{d.summary.username} · {d.email} · {t('Kayıt {date}', { date: formatDate(d.registeredAt) })} · {t('Son etkinlik')} <TimeAgo ms={d.lastActiveAt} />
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if d.status === 'pending_approval' && can(v, 'admin.users.approve')}
        <Button size="sm" onclick={approve}>{t('Onayla')}</Button>
        <Button size="sm" variant="destructive" onclick={reject}>{t('Reddet')}</Button>
      {/if}
      {#if d.status === 'pending_email'}
        <Button size="sm" variant="outline" onclick={() => run(() => api.post(`/api/admin/users/${d.summary.id}/resend-verification`), t('Doğrulama e-postası gönderildi.'))}
          >{t('Doğrulama e-postası gönder')}</Button
        >
      {/if}
      <Button href={profileUrl(d.summary)} variant="outline" size="sm"><ExternalLinkIcon />{t('Profil')}</Button>
    </div>
  </div>

  <Tabs.Root value="general">
    <Tabs.List class="flex-wrap">
      <Tabs.Trigger value="general">{t('Genel')}</Tabs.Trigger>
      <Tabs.Trigger value="profile">{t('Profil')}</Tabs.Trigger>
      <Tabs.Trigger value="groups">{t('Gruplar')}</Tabs.Trigger>
      {#if d.warnings}<Tabs.Trigger value="warnings">{t('Uyarılar ({n})', { n: d.warnings.length })}</Tabs.Trigger>{/if}
      <Tabs.Trigger value="bans">{t('Yasaklar ({n})', { n: d.bans.length })}</Tabs.Trigger>
      <Tabs.Trigger value="achievements">{t('Başarılar ({n})', { n: d.achievements.length })}</Tabs.Trigger>
      <Tabs.Trigger value="sessions">{t('Oturumlar')}</Tabs.Trigger>
      {#if d.notes}<Tabs.Trigger value="notes">{t('Notlar ({n})', { n: d.notes.length })}</Tabs.Trigger>{/if}
      <Tabs.Trigger value="logs">{t('Kayıtlar')}</Tabs.Trigger>
    </Tabs.List>

    <!-- Genel -->
    <Tabs.Content value="general" class="mt-4 grid gap-6 lg:grid-cols-2">
      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Hesap bilgileri')}</Card.Title></Card.Header>
        <Card.Content>
          <form class="grid gap-4" onsubmit={saveGeneral}>
            <FormMessage message={general.message} />
            <Field label={t('E-posta')} for="a-email" error={general.error('email')}>
              <Input id="a-email" type="email" bind:value={email} />
            </Field>
            <div class="flex items-center justify-between"><label for="a-verified" class="text-sm">{t('E-posta doğrulandı')}</label><Switch id="a-verified" bind:checked={emailVerified} /></div>
            {#if d.status === 'active' || d.status === 'deactivated'}
              <Field label={t('Durum')} for="a-status">
                <NativeSelect id="a-status" bind:value={status} options={[{ value: 'active', label: t('Etkin') }, { value: 'deactivated', label: t('Devre dışı') }]} />
              </Field>
            {/if}
            <Field label={t('Mesaj sayısı')} for="a-posts" error={general.error('postCount')} hint={t('Rütbe (mesaj grubu) otomatik güncellenir.')}>
              <Input id="a-posts" type="number" min="0" bind:value={postCount} />
            </Field>
            <Field label={t('Özel başlık')} for="a-title"><Input id="a-title" bind:value={customTitle} /></Field>
            <div class="flex items-center justify-between"><label for="a-mcp" class="text-sm">{t('Sonraki girişte şifre değiştirsin')}</label><Switch id="a-mcp" bind:checked={mustChangePassword} /></div>
            <div class="flex items-center justify-between"><label for="a-watch" class="text-sm">{t('İzleme listesinde')}</label><Switch id="a-watch" bind:checked={isWatched} /></div>
            <Field label={t('Yeni şifre belirle')} for="a-pw" error={general.error('newPassword')} hint={t('Boş bırakılırsa değişmez. Tüm oturumlar kapatılır.')}>
              <Input id="a-pw" type="password" bind:value={newPassword} autocomplete="new-password" />
            </Field>
            <div><Button type="submit" disabled={general.submitting}>{t('Kaydet')}</Button></div>
          </form>
        </Card.Content>
      </Card.Root>

      <div class="grid content-start gap-6">
        <Card.Root>
          <Card.Header><Card.Title class="text-base">{t('İsimler')}</Card.Title></Card.Header>
          <Card.Content class="grid gap-3">
            <Field label={t('Kullanıcı adı')} for="a-username"><Input id="a-username" bind:value={username} /></Field>
            <Field label={t('Görünen ad')} for="a-display"><Input id="a-display" bind:value={displayName} /></Field>
            <div><Button variant="outline" onclick={saveNames} disabled={username === d.summary.username && displayName === d.summary.displayName}>{t('İsimleri kaydet')}</Button></div>
            {#if d.nameHistory.length}
              <div class="grid gap-1 border-t pt-3 text-xs text-muted-foreground">
                {#each d.nameHistory as h (h.changedAt)}
                  <span>{formatDate(h.changedAt)}: {h.oldUsername !== h.newUsername ? `@${h.oldUsername} → @${h.newUsername}` : `${h.oldDisplayName} → ${h.newDisplayName}`}</span>
                {/each}
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header><Card.Title class="text-base">{t('Ayrıntılar')}</Card.Title></Card.Header>
          <Card.Content class="grid gap-1.5 text-sm">
            <div><span class="text-muted-foreground">{t('Son giriş:')}</span> {formatDateTime(d.lastLoginAt)}</div>
            {#if d.registeredIp}<div><span class="text-muted-foreground">{t('Kayıt IP:')}</span> {d.registeredIp}</div>{/if}
            {#if d.lastIp}<div><span class="text-muted-foreground">{t('Son IP:')}</span> {d.lastIp}</div>{/if}
            {#if d.approvedAt}<div><span class="text-muted-foreground">{t('Onay:')}</span> {formatDate(d.approvedAt)}</div>{/if}
            <div><span class="text-muted-foreground">{t('Başarı puanı:')}</span> {d.achievementPoints}</div>
            <div class="mt-2"><WarningBar points={d.warningPoints} max={Number(v.settings['warnings.maxPoints'] ?? 100)} /></div>
          </Card.Content>
        </Card.Root>
        {#if can(v, 'admin.users.delete') && !d.isAdmin}
          <Card.Root class="border-destructive/40">
            <Card.Header>
              <Card.Title class="text-base text-destructive">{t('Hesabı sil')}</Card.Title>
              <Card.Description>{t('Kişisel veriler silinir, hesap "Silinmiş üye" olarak kalır.')}</Card.Description>
            </Card.Header>
            <Card.Content><Button variant="destructive" onclick={remove}><TrashIcon />{t('Hesabı sil')}</Button></Card.Content>
          </Card.Root>
        {/if}
      </div>
    </Tabs.Content>

    <!-- Profil -->
    <Tabs.Content value="profile" class="mt-4 grid gap-6 lg:grid-cols-2">
      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Profil')}</Card.Title></Card.Header>
        <Card.Content>
          <form class="grid gap-4" onsubmit={saveProfile}>
            <FormMessage message={profileForm.message} />
            <Field label={t('Hakkında')} for="a-bio" error={profileForm.error('bio')}><Textarea id="a-bio" bind:value={bio} rows={5} /></Field>
            <Field label={t('Konum')} for="a-loc"><Input id="a-loc" bind:value={location} /></Field>
            <Field label={t('Web sitesi')} for="a-web" error={profileForm.error('websiteUrl')}><Input id="a-web" bind:value={websiteUrl} /></Field>
            <Field label={t('Doğum tarihi')} for="a-birth" error={profileForm.error('birthdate')}><Input id="a-birth" type="date" bind:value={birthdate} /></Field>
            <Field label={t('İmza')} for="a-sig"><Textarea id="a-sig" bind:value={signature} rows={3} /></Field>
            {#each d.profile.customFields as f (f.key)}
              <Field label={f.name} for="a-cf-{f.key}" error={profileForm.error(`customFields.${f.key}`)}><Input id="a-cf-{f.key}" bind:value={f.value} /></Field>
            {/each}
            <div><Button type="submit" disabled={profileForm.submitting || !can(v, 'profile.edit.any')}>{t('Kaydet')}</Button></div>
            {#if !can(v, 'profile.edit.any')}<p class="text-xs text-muted-foreground">{t('Profil düzenlemek için "Herhangi bir üyenin profilini düzenleme" yetkisi gerekir.')}</p>{/if}
          </form>
        </Card.Content>
      </Card.Root>
      <Card.Root class="h-fit">
        <Card.Header><Card.Title class="text-base">{t('Avatar')}</Card.Title></Card.Header>
        <Card.Content>
          <ImageUpload
            current={d.profile.avatarUrl}
            squareSize={d.profile.limits.avatarSize}
            maxBytes={d.profile.limits.avatarMaxKb * 1024}
            rounded
            onupload={async (blob, name) => {
              await api.upload(`/api/admin/users/${d.summary.id}/avatar`, blob, name);
              await refresh();
            }}
            onremove={async () => {
              await api.delete(`/api/admin/users/${d.summary.id}/avatar`);
              await refresh();
            }}
          />
        </Card.Content>
      </Card.Root>
    </Tabs.Content>

    <!-- Gruplar -->
    <Tabs.Content value="groups" class="mt-4">
      <Card.Root class="max-w-3xl">
        <Card.Content class="grid gap-5">
          <div class="grid gap-3 sm:grid-cols-2">
            <Field label={t('Ana grup')} for="g-primary">
              <NativeSelect id="g-primary" bind:value={primaryId} options={[{ value: '', label: t('(Yok — rütbe gösterilir)') }, ...assignable.map((g) => ({ value: String(g.id), label: tc(g.name) }))]} />
            </Field>
            <Field label={t('Ana grup bitişi')} for="g-pexp" hint={t('Boş = süresiz')}>
              <Input id="g-pexp" type="datetime-local" bind:value={primaryExpires} disabled={!primaryId} />
            </Field>
          </div>
          <div class="grid gap-2">
            <span class="text-sm font-medium">{t('Ek gruplar')}</span>
            {#each additional as a, i (a.groupId)}
              {@const g = groupById(a.groupId)}
              <div class="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                {#if g}<GroupBadge group={{ id: g.id, name: g.name, color: g.color, iconUrl: g.iconUrl, iconCount: g.iconCount }} />{/if}
                <Input type="datetime-local" bind:value={a.expires} class="ml-auto w-56" aria-label={t('Bitiş')} />
                <Button variant="ghost" size="icon-sm" onclick={() => (additional = additional.filter((_, j) => j !== i))} aria-label={t('Kaldır')}><TrashIcon /></Button>
              </div>
            {/each}
            <div class="flex gap-2">
              <NativeSelect
                bind:value={addGroupId}
                class="w-64"
                options={[{ value: '', label: t('Grup seçin…') }, ...assignable.filter((g) => String(g.id) !== primaryId && !additional.some((a) => a.groupId === g.id)).map((g) => ({ value: String(g.id), label: tc(g.name) }))]}
              />
              <Button
                variant="outline"
                disabled={!addGroupId}
                onclick={() => {
                  additional = [...additional, { groupId: Number(addGroupId), expires: '' }];
                  addGroupId = '';
                }}><PlusIcon />{t('Ekle')}</Button
              >
            </div>
          </div>
          {#if d.memberships.postGroup}
            <p class="text-sm text-muted-foreground">{t('Rütbe (otomatik):')} <GroupBadge group={{ id: d.memberships.postGroup.id, name: d.memberships.postGroup.name, color: d.memberships.postGroup.color, iconUrl: d.memberships.postGroup.iconUrl, iconCount: d.memberships.postGroup.iconCount }} /></p>
          {/if}
          <div><Button onclick={saveGroups}>{t('Grupları kaydet')}</Button></div>
        </Card.Content>
      </Card.Root>
    </Tabs.Content>

    <!-- Uyarılar -->
    {#if d.warnings}
      <Tabs.Content value="warnings" class="mt-4 grid max-w-3xl gap-4">
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1"><WarningBar points={d.warningPoints} max={Number(v.settings['warnings.maxPoints'] ?? 100)} /></div>
          {#if can(v, 'mod.warnings.issue')}<Button variant="destructive" size="sm" onclick={() => (warnOpen = true)}>{t('Uyarı ver')}</Button>{/if}
        </div>
        <WarningList items={d.warnings} staff onrevoke={can(v, 'mod.warnings.revoke') ? revokeWarning : undefined} />
      </Tabs.Content>
    {/if}

    <!-- Yasaklar -->
    <Tabs.Content value="bans" class="mt-4 grid max-w-3xl gap-3">
      {#if can(v, 'mod.users.ban')}<div><Button variant="destructive" size="sm" onclick={() => (banOpen = true)}>{t('Üyeyi yasakla')}</Button></div>{/if}
      {#each d.bans as b (b.id)}
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm {b.isActive ? '' : 'opacity-60'}">
          <div class="grid">
            <span class="font-medium">{b.name}</span>
            <span class="text-xs text-muted-foreground">
              {b.isActive ? t('Aktif') : b.liftedAt ? t('Kaldırıldı') : t('Süresi doldu')} · {b.expiresAt ? t('{date} tarihine kadar', { date: formatDateTime(b.expiresAt) }) : t('Kalıcı')}
              {#if b.source === 'warning'}· {t('uyarı puanıyla otomatik')}{/if}
            </span>
          </div>
          <div class="flex gap-1">
            {#if b.isActive}<Button size="sm" variant="outline" onclick={() => run(() => api.post(`/api/mod/bans/${b.id}/lift`), t('Yasak kaldırıldı.'))}>{t('Kaldır')}</Button>{/if}
            {#if can(v, 'admin.bans.manage')}<Button href="/admin/bans/{b.id}" size="sm" variant="ghost">{t('Düzenle')}</Button>{/if}
          </div>
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">{t('Bu üyeye doğrudan uygulanmış yasak yok.')}</p>
      {/each}
    </Tabs.Content>

    <!-- Başarılar -->
    <Tabs.Content value="achievements" class="mt-4 grid max-w-3xl gap-4">
      {#if can(v, 'admin.achievements.manage')}
        <Card.Root>
          <Card.Content class="flex flex-wrap items-end gap-2">
            <Field label={t('Başarı ver')} for="aw-id" class="min-w-56 flex-1">
              <NativeSelect
                id="aw-id"
                bind:value={awardId}
                options={[{ value: '', label: t('Başarı seçin…') }, ...data.achievements.filter((a) => !d.achievements.some((e) => e.id === a.id)).map((a) => ({ value: String(a.id), label: t('{name} ({n} puan)', { name: a.name, n: a.points }) }))]}
              />
            </Field>
            <Field label={t('Gerekçe')} for="aw-reason" class="min-w-56 flex-1"><Input id="aw-reason" bind:value={awardReason} /></Field>
            <Button disabled={!awardId} onclick={award}>{t('Ver')}</Button>
          </Card.Content>
        </Card.Root>
      {/if}
      {#each d.achievements as a (a.id)}
        <div class="flex items-center gap-3 rounded-lg border p-3">
          <AchievementIcon iconUrl={a.iconUrl} tier={a.tier} size={40} />
          <div class="grid flex-1 text-sm">
            <span class="font-medium">{tc(a.name)}</span>
            <span class="text-xs text-muted-foreground">{a.source === 'manual' ? t('Elle verildi') : t('Otomatik')} · {formatDate(a.awardedAt)}{#if a.reason} · {a.reason}{/if}</span>
          </div>
          {#if can(v, 'admin.achievements.manage')}
            <Button size="sm" variant="ghost" onclick={() => run(() => api.delete(`/api/admin/achievements/${a.id}/holders/${d.summary.id}`), t('Başarı geri alındı.'))}>{t('Geri al')}</Button>
          {/if}
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">{t('Başarı yok.')}</p>
      {/each}
    </Tabs.Content>

    <!-- Oturumlar -->
    <Tabs.Content value="sessions" class="mt-4 grid max-w-3xl gap-3">
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onclick={() => run(() => api.post(`/api/admin/users/${d.summary.id}/sessions/revoke`), t('Tüm oturumlar kapatıldı.'))}>{t('Tüm oturumları kapat')}</Button>
        {#if d.twoFactorEnabled}
          <Button variant="outline" size="sm" onclick={async () => {
            if (await confirmAction({ title: t('İki adımlı doğrulama kapatılsın mı?'), description: t('Üye telefonuna erişimini kaybettiyse kullanın.'), destructive: true }))
              await run(() => api.post(`/api/admin/users/${d.summary.id}/2fa/disable`), t('2FA kapatıldı.'));
          }}>{t("2FA'yı sıfırla")}</Button>
        {/if}
      </div>
      {#each d.sessions as s (s.id)}
        <div class="rounded-lg border p-3 text-sm">
          <span class="font-medium">{s.deviceLabel ?? t('Bilinmeyen cihaz')}</span>
          <span class="text-xs text-muted-foreground"> · {s.ip ?? ''} · {t('son etkinlik')} <TimeAgo ms={s.lastSeenAt} /> · {t('giriş {date}', { date: formatDate(s.createdAt) })}</span>
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">{t('Açık oturum yok.')}</p>
      {/each}
    </Tabs.Content>

    <!-- Notlar -->
    {#if d.notes}
      <Tabs.Content value="notes" class="mt-4 grid max-w-3xl gap-3">
        <div class="grid gap-2">
          <Textarea bind:value={note} rows={3} placeholder={t('Yalnızca yetkililerin göreceği bir not…')} />
          <div><Button size="sm" onclick={addNote} disabled={!note.trim()}>{t('Not ekle')}</Button></div>
        </div>
        {#each d.notes as n (n.id)}
          <div class="rounded-lg border p-3 text-sm">
            <p class="whitespace-pre-wrap">{n.body}</p>
            <div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {#if n.author}<UserName user={n.author} />{/if} · {formatDateTime(n.createdAt)}
              <button class="ml-auto hover:text-destructive" onclick={() => run(() => api.delete(`/api/admin/users/${d.summary.id}/notes/${n.id}`), t('Not silindi.'))}>{t('Sil')}</button>
            </div>
          </div>
        {/each}
      </Tabs.Content>
    {/if}

    <!-- Kayıtlar -->
    <Tabs.Content value="logs" class="mt-4">
      <div class="overflow-hidden rounded-xl border bg-card text-sm">
        {#each d.logs as l (l.id)}
          <div class="flex flex-wrap gap-x-3 border-b px-3 py-2 last:border-b-0">
            <span class="font-mono text-xs">{l.action}</span>
            <span class="text-xs text-muted-foreground">{l.type}</span>
            <span class="ml-auto text-xs text-muted-foreground">{formatDateTime(l.createdAt)}{#if l.ip} · {l.ip}{/if}</span>
          </div>
        {:else}
          <p class="p-4 text-muted-foreground">{t('Kayıt yok.')}</p>
        {/each}
      </div>
      {#if can(v, 'admin.logs.view')}<a href="/admin/logs?targetId={d.summary.id}" class="mt-2 inline-block text-sm text-primary hover:underline">{t('Tüm kayıtlar')}</a>{/if}
    </Tabs.Content>
  </Tabs.Root>

  <IssueWarningDialog bind:open={warnOpen} userId={d.summary.id} userName={d.summary.displayName} ondone={refresh} />

  <Dialog.Root bind:open={banOpen}>
    <Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <Dialog.Header><Dialog.Title>{t('{name} kullanıcısını yasakla', { name: d.summary.displayName })}</Dialog.Title></Dialog.Header>
      <BanForm
        initial={{ name: t('{name} yasağı', { name: d.summary.username }), triggers: [{ type: 'user', value: String(d.summary.id) }] }}
        ondone={async () => {
          banOpen = false;
          await invalidateAll();
        }}
      />
    </Dialog.Content>
  </Dialog.Root>
{/if}
