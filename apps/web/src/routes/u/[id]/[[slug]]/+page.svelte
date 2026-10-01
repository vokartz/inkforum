<script lang="ts">
  import { tierName } from '$lib/tiers';
  import EnvelopeIcon from 'phosphor-svelte/lib/EnvelopeSimple';
  import { invalidateAll } from '$app/navigation';
  import type { Paginated, UnreadTopicItem } from '@forum/shared';
  import CalendarIcon from 'phosphor-svelte/lib/CalendarBlank';
  import MapPinIcon from 'phosphor-svelte/lib/MapPin';
  import LinkIcon from 'phosphor-svelte/lib/Link';
  import CakeIcon from 'phosphor-svelte/lib/Cake';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import SettingsIcon from 'phosphor-svelte/lib/Gear';
  import ShieldIcon from 'phosphor-svelte/lib/Shield';
  import TriangleAlertIcon from 'phosphor-svelte/lib/Warning';
  import TrophyIcon from 'phosphor-svelte/lib/Trophy';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import MessagesSquareIcon from 'phosphor-svelte/lib/ChatsCircle';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Button } from '$lib/components/ui/button';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import GroupBadge from '$lib/components/GroupBadge.svelte';
  import GroupStars from '$lib/components/GroupStars.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import AchievementIcon from '$lib/components/AchievementIcon.svelte';
  import IssueWarningDialog from '$lib/components/IssueWarningDialog.svelte';
  import ProfileCover from '$lib/components/profile/ProfileCover.svelte';
  import TopicRow from '$lib/components/forum/TopicRow.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import CustomHtml from '$lib/components/CustomHtml.svelte';
  import { api } from '$lib/api';
  import { formatBirthdate, formatDate, formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const p = $derived(data.profile);
  const u = $derived(p.user);
  const isOwn = $derived(data.viewer.user?.id === u.id);
  let warnOpen = $state(false);

  // ----- Sekmeler (içerik ilk açılışta yüklenir) -----
  interface PostEntry {
    postId: number;
    html: string;
    createdAt: number;
    isFirst: boolean;
    topic: { id: number; title: string; slug: string };
    board: { id: number; name: string; slug: string };
  }
  let tab = $state('about');
  let topics = $state<Paginated<UnreadTopicItem> | null>(null);
  let posts = $state<Paginated<PostEntry> | null>(null);
  let loadingTab = $state(false);

  async function openTab(v: string) {
    tab = v;
    loadingTab = true;
    try {
      if (v === 'topics' && !topics) topics = await api.get(`/api/users/${u.id}/topics`);
      if (v === 'posts' && !posts) posts = await api.get(`/api/users/${u.id}/posts`);
    } finally {
      loadingTab = false;
    }
  }
  async function more(kind: 'topics' | 'posts') {
    const cur = kind === 'topics' ? topics : posts;
    if (!cur) return;
    loadingTab = true;
    try {
      const next = await api.get<Paginated<never>>(`/api/users/${u.id}/${kind}?page=${cur.page + 1}`);
      if (kind === 'topics') topics = { ...next, items: [...topics!.items, ...next.items] } as Paginated<UnreadTopicItem>;
      else posts = { ...next, items: [...posts!.items, ...next.items] } as Paginated<PostEntry>;
    } finally {
      loadingTab = false;
    }
  }
  // Başka bir profile geçilince sekmeler sıfırlanır.
  let lastId = 0;
  $effect.pre(() => {
    if (u.id !== lastId) {
      lastId = u.id;
      topics = null;
      posts = null;
      tab = 'about';
    }
  });

  const warnPct = $derived(p.warnings ? Math.min(100, Math.round((p.warnings.points / Math.max(1, p.warnings.max)) * 100)) : 0);

  // Yönetimden eklenen profil parçacıkları (UCP karakterleri vb.): yan sütun kartları ve ek sekmeler.
  const profileSidebar = $derived((data.custom?.snippets ?? []).filter((sn) => sn.placement === 'profileSidebar'));
  const profileTabs = $derived((data.custom?.snippets ?? []).filter((sn) => sn.placement === 'profileTab'));
  const profileVars = $derived({
    'profile.id': u.id,
    'profile.username': u.username,
    'profile.displayName': u.displayName,
    ...Object.fromEntries(p.customFields.map((f) => [`profile.field.${f.key}`, f.value])),
  });
</script>

<svelte:head><title>{u.displayName} — {t('Profil')}</title></svelte:head>

<div class="grid gap-6">
  <!-- Üst bölüm: kapak, avatar, isim, istatistikler -->
  <section data-part="profile-header" class="overflow-hidden rounded-2xl border bg-card shadow-card">
    <ProfileCover cover={p.cover} color={u.color} canEdit={isOwn && p.can.cover} maxKb={Number(data.viewer.settings['profile.coverMaxKb'] ?? 4096)}>
      {#snippet actions()}
        {#if isOwn}
          <Button href="/settings/account" size="sm" variant="secondary" class="bg-black/45 text-white backdrop-blur hover:bg-black/60"><SettingsIcon />{t('Hesap ayarları')}</Button>
          <Button href="/settings/profile" size="sm" variant="secondary" class="bg-black/45 text-white backdrop-blur hover:bg-black/60"><PencilIcon />{t('Profili düzenle')}</Button>
        {/if}
        {#if !isOwn && data.viewer.user && data.viewer.permissions.includes('messages.send')}
          <Button href="/messages/new?to={u.id}" size="sm" variant="secondary" class="bg-black/45 text-white backdrop-blur hover:bg-black/60"><EnvelopeIcon />{t('Mesaj gönder')}</Button>
        {/if}
        {#if p.can.warn}
          <Button size="sm" variant="secondary" class="bg-black/45 text-white backdrop-blur hover:bg-black/60" onclick={() => (warnOpen = true)}><TriangleAlertIcon />{t('Uyar')}</Button>
        {/if}
        {#if p.can.manage}
          <Button href="/admin/users/{u.id}" size="sm" variant="secondary" class="bg-black/45 text-white backdrop-blur hover:bg-black/60"><ShieldIcon />{t('Yönet')}</Button>
        {/if}
      {/snippet}
    </ProfileCover>

    <div class="relative flex flex-col gap-4 px-5 pb-4 sm:flex-row sm:items-end sm:px-6">
      <div class="relative -mt-16 shrink-0 self-start rounded-2xl border-4 border-card bg-card shadow-lg sm:-mt-20">
        <UserAvatar user={u} size={132} class="rounded-xl" />
        {#if p.isOnline}<span class="absolute -right-1.5 -bottom-1.5 size-6 rounded-full border-4 border-card bg-success" title={t('Çevrimiçi')}></span>{/if}
      </div>
      <div class="min-w-0 flex-1 sm:pb-1">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="truncate text-2xl leading-tight font-bold sm:text-3xl" style={u.color ? `color:${u.color}` : undefined}>{u.displayName}</h1>
          {#if p.status && p.status !== 'active'}<span class="rounded-full bg-muted px-2 py-0.5 text-xs">{p.status}</span>{/if}
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {#if u.primaryGroup?.iconUrl}
            <GroupStars count={u.primaryGroup.iconCount} iconUrl={u.primaryGroup.iconUrl} bannerHeight={30} title={tc(u.primaryGroup.name)} />
          {:else if u.primaryGroup}
            <span class="inline-flex items-center gap-1.5 font-semibold" style={u.primaryGroup.color ? `color:${u.primaryGroup.color}` : undefined}>
              {tc(u.primaryGroup.name)}<GroupStars count={u.primaryGroup.iconCount} color={u.primaryGroup.color} size={13} />
            </span>
          {/if}
          <span>@{u.username}</span>
          {#if u.customTitle}<span>· {u.customTitle}</span>{/if}
        </div>
      </div>
    </div>

    <!-- İstatistik şeridi -->
    <dl data-part="profile-stats" class="grid grid-cols-2 border-t bg-panel-header text-sm sm:flex sm:flex-wrap">
      <div class="px-5 py-3 sm:border-r sm:px-6">
        <dt class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{t('Gönderi sayısı')}</dt>
        <dd class="text-base font-semibold tabular-nums">{formatNumber(p.postCount)}</dd>
      </div>
      <div class="px-5 py-3 sm:border-r sm:px-6">
        <dt class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{t('Kayıt tarihi')}</dt>
        <dd class="text-base font-semibold">{formatDate(p.registeredAt)}</dd>
      </div>
      <div class="px-5 py-3 sm:border-r sm:px-6">
        <dt class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{t('Son ziyareti')}</dt>
        <dd class="flex items-center gap-1.5 text-base font-semibold">
          {#if p.isOnline}<span class="size-2.5 animate-pulse rounded-full bg-success"></span>{t('Şu an')}{:else if p.lastActiveAt}<TimeAgo ms={p.lastActiveAt} />{:else}{t('Gizli')}{/if}
        </dd>
      </div>
      <div class="px-5 py-3 sm:px-6">
        <dt class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{t('Başarı puanı')}</dt>
        <dd class="text-base font-semibold tabular-nums">{formatNumber(p.achievementPoints)}</dd>
      </div>
      <div class="col-span-2 flex items-center px-5 pb-3 sm:ml-auto sm:p-3 sm:pr-5">
        <Button variant="outline" size="sm" class="w-full sm:w-auto" onclick={() => openTab('posts')}><MessagesSquareIcon />{isOwn ? t('Mesajlarım') : t('Mesajları')}</Button>
      </div>
    </dl>
  </section>

  <div class="grid gap-6 lg:grid-cols-[20rem_1fr]">
    <!-- Kenar çubuğu -->
    <aside class="grid content-start gap-5">
      {#if p.warnings}
        <div data-part="profile-warnings" class="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-card">
          <div class="relative size-14 shrink-0">
            <svg viewBox="0 0 36 36" class="size-14 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--muted)" stroke-width="3.5" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke={warnPct >= 80 ? 'var(--destructive)' : warnPct >= 50 ? 'var(--warning)' : warnPct > 0 ? 'var(--primary)' : 'var(--success)'}
                stroke-width="3.5"
                stroke-linecap="round"
                stroke-dasharray="{(warnPct / 100) * 97.4} 97.4"
                class="transition-all duration-700"
              />
            </svg>
            <span class="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">{p.warnings.points}</span>
          </div>
          <div>
            <p class="font-semibold">{t('{n} uyarı puanı', { n: p.warnings.points })}</p>
            <p class="text-sm text-muted-foreground">{p.warnings.points === 0 ? t('Hiçbir kısıtlama yok') : t('En fazla {max} puan', { max: p.warnings.max })}</p>
          </div>
        </div>
      {/if}

      <div class="rounded-2xl border bg-card p-4 shadow-card">
        <h2 class="mb-3 text-sm font-semibold">{t('Hakkında')}</h2>
        <div class="grid gap-2.5 text-sm">
          <div class="flex items-center gap-2"><CalendarIcon class="size-4 text-muted-foreground" />{t('Katılım: {date}', { date: formatDate(p.registeredAt) })}</div>
          {#if p.birthdate}
            <div class="flex items-center gap-2"><CakeIcon class="size-4 text-muted-foreground" />{formatBirthdate(p.birthdate)}{#if p.age !== null} ({t('{age} yaş', { age: p.age })}){/if}</div>
          {/if}
          {#if p.location}<div class="flex items-center gap-2"><MapPinIcon class="size-4 text-muted-foreground" />{p.location}</div>{/if}
          {#if p.websiteUrl}
            <div class="flex items-center gap-2">
              <LinkIcon class="size-4 text-muted-foreground" />
              <a href={p.websiteUrl} rel="nofollow noopener noreferrer" target="_blank" class="truncate text-link hover:underline">{p.websiteUrl.replace(/^https?:\/\//, '')}</a>
            </div>
          {/if}
          {#each p.customFields as f (f.key)}
            <div class="grid gap-0.5">
              <span class="text-xs text-muted-foreground">{f.name}</span>
              {#if f.type === 'url'}
                <a href={f.value} rel="nofollow noopener noreferrer" target="_blank" class="truncate text-link hover:underline">{f.value}</a>
              {:else if f.type === 'checkbox'}<span>{t('Evet')}</span>{:else}<span class="break-words">{f.value}</span>{/if}
            </div>
          {/each}
        </div>
      </div>

      {#if p.groups.length}
        <div class="rounded-2xl border bg-card p-4 shadow-card">
          <h2 class="mb-3 text-sm font-semibold">{t('Gruplar')}</h2>
          <div class="flex flex-wrap gap-1.5">{#each p.groups as g (g.id)}<GroupBadge group={g} href="/groups/{g.id}" />{/each}</div>
        </div>
      {/if}


      {#each profileSidebar as sn (sn.id)}
        <div class="rounded-2xl border bg-card p-4 shadow-card" data-part="profile-custom-card">
          {#if sn.title}<h2 class="mb-3 text-sm font-semibold">{sn.title}</h2>{/if}
          <CustomHtml html={sn.html} vars={profileVars} class="text-sm" part="custom-profileSidebar" />
        </div>
      {/each}
      {#if p.staff}
        <div class="rounded-2xl border border-dashed bg-card p-4 text-sm">
          <h2 class="mb-2 font-semibold">{t('Yetkili bilgileri')}</h2>
          <div class="grid gap-1">
            {#if p.staff.email}<div><span class="text-muted-foreground">{t('E-posta:')}</span> {p.staff.email}</div>{/if}
            {#if p.staff.registeredIp}<div><span class="text-muted-foreground">{t('Kayıt IP:')}</span> {p.staff.registeredIp}</div>{/if}
            {#if p.staff.lastIp}<div><span class="text-muted-foreground">{t('Son IP:')}</span> {p.staff.lastIp}</div>{/if}
            {#if p.staff.watched}<div class="text-warning">{t('İzleme listesinde')}</div>{/if}
          </div>
        </div>
      {/if}
    </aside>

    <!-- Ana alan -->
    <div class="grid min-w-0 content-start gap-5">
      {#if p.achievements.total}
        <section class="flex flex-wrap items-center gap-5 rounded-2xl border bg-card p-4 shadow-card">
          <div class="min-w-0 flex-1">
            <h2 class="mb-3 text-sm font-semibold">{isOwn ? t('Başarılarınız') : t('Başarıları')}</h2>
            <div class="flex flex-wrap gap-2">
              {#each (p.achievements.featured.length ? p.achievements.featured : p.achievements.recent).slice(0, 8) as a (a.id)}
                <span class="transition-transform hover:-translate-y-0.5" title="{tc(a.name)} — {tc(a.description)}"><AchievementIcon iconUrl={a.iconUrl} tier={a.tier} size={42} /></span>
              {/each}
            </div>
          </div>
          <div class="grid place-items-center text-center">
            <span class="flex size-14 items-center justify-center rounded-full bg-success text-lg font-bold text-white shadow-lg">{formatNumber(p.achievementPoints)}</span>
            <span class="mt-1 text-xs text-muted-foreground">{t('Başarı puanı')}</span>
          </div>
        </section>
      {/if}

      <Tabs.Root value={tab} onValueChange={(v) => void openTab(v)}>
        <Tabs.List>
          <Tabs.Trigger value="about">{t('Genel')}</Tabs.Trigger>
          <Tabs.Trigger value="topics">{t('Konular')}</Tabs.Trigger>
          <Tabs.Trigger value="posts">{t('Mesajlar')}</Tabs.Trigger>
          <Tabs.Trigger value="achievements">{t('Başarılar ({n})', { n: p.achievements.total })}</Tabs.Trigger>
          {#each profileTabs as sn (sn.id)}<Tabs.Trigger value="custom-{sn.id}">{sn.title}</Tabs.Trigger>{/each}
        </Tabs.List>

        <Tabs.Content value="about" class="mt-4 grid gap-5">
          <div class="rounded-2xl border bg-card p-5 shadow-card">
            {#if p.bioHtml}
              <div class="prose-forum">{@html p.bioHtml}</div>
            {:else}
              <p class="text-sm text-muted-foreground">{isOwn ? t('Henüz kendinizi tanıtmadınız.') : t('Bu üye henüz kendini tanıtmadı.')}</p>
            {/if}
          </div>
          {#if p.signatureHtml}
            <div class="rounded-2xl border bg-card p-5 shadow-card">
              <h3 class="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t('İmza')}</h3>
              <div class="prose-forum text-sm">{@html p.signatureHtml}</div>
            </div>
          {/if}
        </Tabs.Content>

        <Tabs.Content value="topics" class="mt-4">
          {#if !topics}
            <div class="flex justify-center py-10"><LoaderIcon class="size-5 animate-spin text-muted-foreground" /></div>
          {:else if topics.items.length}
            <section class="overflow-hidden rounded-2xl border bg-card shadow-card">
              <div class="divide-y">{#each topics.items as t (t.id)}<TopicRow topic={t} board={t.board} />{/each}</div>
            </section>
            {#if topics.items.length < topics.total}
              <div class="mt-3 flex justify-center"><Button variant="outline" onclick={() => more('topics')} disabled={loadingTab}>{t('Daha fazla göster')}</Button></div>
            {/if}
          {:else}
            <EmptyState title={t('Henüz konu açılmamış')} />
          {/if}
        </Tabs.Content>

        <Tabs.Content value="posts" class="mt-4 grid gap-3">
          {#if !posts}
            <div class="flex justify-center py-10"><LoaderIcon class="size-5 animate-spin text-muted-foreground" /></div>
          {:else if posts.items.length}
            {#each posts.items as m (m.postId)}
              <article class="overflow-hidden rounded-2xl border bg-card shadow-card">
                <header class="flex flex-wrap items-center gap-x-2 border-b bg-panel-header px-4 py-2 text-sm">
                  <a href="/p/{m.postId}" class="font-semibold hover:text-highlight">{m.topic.title}</a>
                  <span class="text-xs text-muted-foreground">{m.isFirst ? t('konusunu açtı') : t('konusuna yanıt verdi')} · {m.board.name} · <TimeAgo ms={m.createdAt} /></span>
                </header>
                <div class="prose-forum relative max-h-56 overflow-hidden px-4 py-3 text-sm">
                  {@html m.html}
                  <div class="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"></div>
                </div>
              </article>
            {/each}
            {#if posts.items.length < posts.total}
              <div class="flex justify-center"><Button variant="outline" onclick={() => more('posts')} disabled={loadingTab}>{t('Daha fazla göster')}</Button></div>
            {/if}
          {:else}
            <EmptyState title={t('Henüz mesaj yok')} />
          {/if}
        </Tabs.Content>

        <Tabs.Content value="achievements" class="mt-4">
          {#if !p.achievements.recent.length}
            <EmptyState title={t('Henüz başarı kazanılmamış')} />
          {:else}
            <div class="grid gap-3 sm:grid-cols-2">
              {#each p.achievements.recent as a (a.id)}
                <div class="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-card">
                  <AchievementIcon iconUrl={a.iconUrl} tier={a.tier} size={44} />
                  <div class="grid min-w-0">
                    <span class="font-medium">{tc(a.name)}</span>
                    <span class="truncate text-xs text-muted-foreground">{tc(a.description)}</span>
                    <span class="text-xs text-muted-foreground">{tierName(a.tierLabel)} · {t('{n} puan', { n: a.points })} · <TimeAgo ms={a.awardedAt} /></span>
                  </div>
                </div>
              {/each}
            </div>
            {#if p.achievements.total > p.achievements.recent.length}
              <p class="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><TrophyIcon class="size-4" />{t('ve {n} başarı daha…', { n: p.achievements.total - p.achievements.recent.length })}</p>
            {/if}
          {/if}
        </Tabs.Content>
        {#each profileTabs as sn (sn.id)}
          <Tabs.Content value="custom-{sn.id}" class="mt-4">
            <div class="rounded-2xl border bg-card p-5 shadow-card"><CustomHtml html={sn.html} vars={profileVars} class="text-sm" part="custom-profileTab" /></div>
          </Tabs.Content>
        {/each}
      </Tabs.Root>
    </div>
  </div>
</div>

{#if p.can.warn}
  <IssueWarningDialog bind:open={warnOpen} userId={u.id} userName={u.displayName} ondone={() => invalidateAll()} />
{/if}
