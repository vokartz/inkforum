<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Prohibit';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import ShieldWarningIcon from 'phosphor-svelte/lib/ShieldWarning';
  import HourglassIcon from 'phosphor-svelte/lib/HourglassMedium';
  import HandIcon from 'phosphor-svelte/lib/HandPalm';
  import GlobeIcon from 'phosphor-svelte/lib/GlobeHemisphereWest';
  import AtIcon from 'phosphor-svelte/lib/At';
  import UserIcon from 'phosphor-svelte/lib/User';
  import IdentificationIcon from 'phosphor-svelte/lib/IdentificationBadge';
  import ListIcon from 'phosphor-svelte/lib/ListBullets';
  import LightningIcon from 'phosphor-svelte/lib/Lightning';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import DotsIcon from 'phosphor-svelte/lib/DotsThreeVertical';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import KpiCard from '$lib/components/admin/KpiCard.svelte';
  import BanForm from '$lib/components/admin/BanForm.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDateTime, formatNumber } from '$lib/format';
  import { cn, type IconComponent } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  let open = $state(false);
  let q = $state('');
  let kind = $state<'all' | 'ip' | 'email' | 'user' | 'username'>('all');

  const TYPE: Record<string, { label: string; icon: IconComponent }> = {
    ip: { label: 'IP', icon: GlobeIcon },
    ip_range: { label: 'IP aralığı', icon: GlobeIcon },
    email: { label: 'E-posta', icon: AtIcon },
    email_domain: { label: 'Alan adı', icon: AtIcon },
    username: { label: 'Kullanıcı adı', icon: IdentificationIcon },
    user: { label: 'Üye', icon: UserIcon },
  };
  const KIND_TYPES: Record<string, string[]> = { ip: ['ip', 'ip_range'], email: ['email', 'email_domain'], user: ['user'], username: ['username'] };

  const shown = $derived(
    data.bans.filter((b) => {
      if (kind !== 'all' && !b.triggers.some((t) => KIND_TYPES[kind]!.includes(t.type))) return false;
      const needle = q.trim().toLocaleLowerCase('tr-TR');
      if (!needle) return true;
      return `${b.name} ${b.reasonPublic ?? ''} ${b.triggers.map((t) => t.value).join(' ')}`.toLocaleLowerCase('tr-TR').includes(needle);
    }),
  );

  // ---------- Hızlı yasak ----------
  let qType = $state('ip');
  let qValue = $state('');
  let qDays = $state('0');
  let qReason = $state('');
  let quickBusy = $state(false);
  async function quickBan(e: SubmitEvent) {
    e.preventDefault();
    if (!qValue.trim()) return;
    quickBusy = true;
    try {
      const days = Number(qDays);
      await api.post('/api/mod/bans', {
        name: `${t(TYPE[qType]?.label ?? qType)}: ${qValue.trim()}`,
        reasonPublic: qReason.trim() || null,
        notesPrivate: null,
        cannotAccess: qType === 'ip',
        cannotLogin: true,
        cannotRegister: true,
        cannotPost: true,
        expiresAt: days ? Date.now() + days * 86_400_000 : null,
        triggers: [{ type: qType, value: qValue.trim() }],
      });
      toast.success(t('Yasak eklendi.'));
      qValue = '';
      qReason = '';
      await invalidate('app:admin-bans');
    } catch (err) {
      toast.error(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : errorMessage(err));
    } finally {
      quickBusy = false;
    }
  }

  async function lift(id: number) {
    try {
      await api.post(`/api/mod/bans/${id}/lift`);
      toast.success(t('Yasak kaldırıldı.'));
      await invalidate('app:admin-bans');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function remove(id: number) {
    if (!(await confirmAction({ title: t('Yasak kaydı tamamen silinsin mi?'), description: t('Kayıt ve eşleşme geçmişi silinir.'), destructive: true, confirmLabel: t('Sil') }))) return;
    await api.delete(`/api/admin/bans/${id}`);
    toast.success(t('Yasak silindi.'));
    await invalidate('app:admin-bans');
  }

  const restrictions = (b: (typeof data.bans)[number]) =>
    [b.cannotAccess && t('Erişim'), b.cannotLogin && t('Giriş'), b.cannotRegister && t('Kayıt'), b.cannotPost && t('Mesaj')].filter(Boolean) as string[];
  function remaining(b: (typeof data.bans)[number]): { text: string; pct: number | null } {
    if (b.liftedAt) return { text: t('Kaldırıldı'), pct: null };
    if (!b.expiresAt) return { text: t('Kalıcı'), pct: null };
    const left = b.expiresAt - Date.now();
    if (left <= 0) return { text: t('Süresi doldu'), pct: 0 };
    const total = b.expiresAt - b.createdAt;
    const days = Math.floor(left / 86_400_000);
    const hours = Math.floor((left % 86_400_000) / 3_600_000);
    return { text: days ? t('{days} gün {hours} sa kaldı', { days, hours }) : t('{hours} sa kaldı', { hours }), pct: total > 0 ? Math.max(3, Math.round((left / total) * 100)) : null };
  }
  const CONTEXT: Record<string, string> = { access: 'erişim', login: 'giriş', register: 'kayıt', post: 'mesaj' };
</script>

<svelte:head><title>{t('Yasaklar')} · {t('Yönetim')}</title></svelte:head>

<PageHeader icon={PageHeaderIcon} title={t('Yasaklar')} description={t('IP, IP aralığı, e-posta, alan adı, kullanıcı adı ya da üye bazlı kısıtlamalar ve engellenen denemeler.')}>
  {#snippet actions()}
    <Button href="/admin/bans/log" variant="outline"><ListIcon />{t('Engelleme kaydı')}</Button>
    <Button onclick={() => (open = true)}><PlusIcon weight="bold" />{t('Ayrıntılı yasak')}</Button>
  {/snippet}
</PageHeader>

{#if data.stats}
  <div class="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <KpiCard label={t('Aktif yasak')} value={data.stats.active} icon={ShieldWarningIcon} hint={t('{n} kalıcı', { n: data.stats.permanent })} />
    <KpiCard label={t('7 gün içinde bitecek')} value={data.stats.expiringSoon} icon={HourglassIcon} />
    <KpiCard label={t('Son 24 saatte engellenen')} value={data.stats.blocked24h} icon={HandIcon} hint={t('7 günde {n}', { n: formatNumber(data.stats.blocked7d) })} />
    <div class="rounded-xl border bg-card p-4">
      <p class="text-xs font-semibold text-muted-foreground">{t('Son 7 gün, engellenen')}</p>
      <div class="mt-2 grid gap-1.5">
        {#each Object.entries(CONTEXT) as [k, label] (k)}
          {@const n = data.stats.byContext[k] ?? 0}
          <div class="flex items-center gap-2 text-xs">
            <span class="w-14 text-muted-foreground">{t(label)}</span>
            <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full bg-destructive/70" style="width:{data.stats.blocked7d ? Math.round((n / data.stats.blocked7d) * 100) : 0}%"></span></span>
            <span class="w-8 text-right tabular-nums">{n}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- Hızlı yasak -->
<form class="mb-5 grid gap-2 rounded-xl border bg-card p-4 lg:grid-cols-[10rem_minmax(0,1fr)_9rem_minmax(0,1fr)_auto] lg:items-end" onsubmit={quickBan} data-part="quick-ban">
  <div class="grid gap-1 lg:col-span-5"><span class="flex items-center gap-1.5 text-sm font-bold"><LightningIcon class="size-4 text-warning" weight="fill" />{t('Hızlı yasak')}</span></div>
  <NativeSelect
    bind:value={qType}
    options={[
      { value: 'ip', label: t('IP / aralık') },
      { value: 'email', label: t('E-posta') },
      { value: 'email_domain', label: t('E-posta alan adı') },
      { value: 'username', label: t('Kullanıcı adı') },
      { value: 'user', label: t('Üye (numara)') },
    ]}
  />
  <Input bind:value={qValue} placeholder={qType === 'ip' ? '203.0.113.7 · 10.0.0.0/8 · 192.168.*.*' : qType === 'email' ? t('kisi@ornek.com ya da *@spam.com') : qType === 'email_domain' ? 'spam.com' : qType === 'user' ? '42' : 'spambot*'} class="font-mono text-sm" />
  <NativeSelect
    bind:value={qDays}
    options={[
      { value: '0', label: t('Kalıcı') },
      { value: '1', label: t('{n} gün', { n: 1 }) },
      { value: '7', label: t('{n} gün', { n: 7 }) },
      { value: '30', label: t('{n} gün', { n: 30 }) },
      { value: '90', label: t('{n} gün', { n: 90 }) },
    ]}
  />
  <Input bind:value={qReason} placeholder={t('Gerekçe (üyeye gösterilir, isteğe bağlı)')} />
  <Button type="submit" variant="destructive" disabled={quickBusy || !qValue.trim()}>{#if quickBusy}<LoaderIcon class="animate-spin" />{/if}{t('Yasakla')}</Button>
</form>

{#if data.stats?.topTriggers.length}
  <div class="mb-5 rounded-xl border bg-card p-4">
    <p class="mb-2 text-sm font-bold">{t('En çok engelleyen kurallar')}</p>
    <div class="flex flex-wrap gap-2">
      {#each data.stats.topTriggers as tr (tr.id)}
        {@const T = TYPE[tr.type]}
        <a href="/admin/bans/{tr.banId}" class="inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:border-primary">
          {#if T}<T.icon class="size-3.5 text-muted-foreground" />{/if}<span class="font-mono">{tr.value}</span>
          <span class="rounded bg-destructive/15 px-1.5 font-bold text-destructive tabular-nums">{tr.hits}</span>
          {#if tr.lastHitAt}<span class="text-muted-foreground"><TimeAgo ms={tr.lastHitAt} /></span>{/if}
        </a>
      {/each}
    </div>
  </div>
{/if}

<div class="mb-3 flex flex-wrap items-center gap-2">
  <div class="flex gap-1 rounded-lg bg-muted p-1">
    {#each [['active', 'Aktif'], ['expired', 'Biten / kaldırılan'], ['all', 'Tümü']] as [key, label] (key)}
      <a href="/admin/bans?filter={key}" class={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', data.filter === key ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{t(label!)}</a>
    {/each}
  </div>
  <div class="flex gap-1">
    {#each [['all', 'Hepsi'], ['ip', 'IP'], ['email', 'E-posta'], ['user', 'Üye'], ['username', 'Kullanıcı adı']] as [k, label] (k)}
      <button type="button" onclick={() => (kind = k as typeof kind)} class={cn('rounded-full border px-3 py-1 text-xs font-semibold transition-colors', kind === k ? 'border-primary bg-primary-soft text-highlight' : 'text-muted-foreground hover:text-foreground')}>{t(label!)}</button>
    {/each}
  </div>
  <div class="relative ml-auto w-full sm:w-64">
    <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
    <Input bind:value={q} placeholder={t('IP, e-posta, ad ara…')} class="pl-9" />
  </div>
</div>

{#if !shown.length}
  <EmptyState title={data.bans.length ? t('Eşleşen yasak yok') : t('Yasak yok')} description={data.bans.length ? t('Filtreleri değiştirmeyi dene.') : t('Yukarıdaki hızlı yasak alanından ilk kuralını ekleyebilirsin.')} />
{:else}
  <div class="grid gap-2">
    {#each shown as b (b.id)}
      {@const r = remaining(b)}
      <div class={cn('grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-center', !b.isActive && 'opacity-60')}>
        <div class="grid min-w-0 gap-1.5">
          <div class="flex flex-wrap items-center gap-2">
            <span class={cn('size-2 rounded-full', b.isActive ? 'bg-destructive' : 'bg-muted-foreground/40')}></span>
            <a href="/admin/bans/{b.id}" class="font-semibold hover:underline">{b.name}</a>
            {#if b.source === 'warning'}<span class="rounded bg-warning/15 px-1.5 text-[10px] font-bold text-warning">{t('UYARI PUANI')}</span>{/if}
            <span class="text-xs text-muted-foreground">{formatDateTime(b.createdAt)}</span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            {#each b.triggers as tr (tr.id)}
              {@const T = TYPE[tr.type]}
              <span class="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-xs" title={t('{n} eşleşme', { n: tr.hits }) + (tr.lastHitAt ? ` · ${t('son: {date}', { date: formatDateTime(tr.lastHitAt) })}` : '')}>
                {#if T}<T.icon class="size-3.5 text-muted-foreground" />{/if}
                {#if tr.type === 'user'}<a href="/admin/users/{tr.userId}" class="font-mono hover:underline">#{tr.value}</a>{:else}<span class="font-mono">{tr.value}</span>{/if}
                {#if tr.hits}<span class="rounded bg-destructive/15 px-1 text-[10px] font-bold text-destructive tabular-nums">{tr.hits}</span>{/if}
              </span>
            {/each}
          </div>
          {#if b.reasonPublic}<p class="text-xs text-muted-foreground">{t('Gerekçe: {reason}', { reason: b.reasonPublic })}</p>{/if}
        </div>
        <div class="grid gap-1.5 text-xs">
          <div class="flex flex-wrap gap-1">{#each restrictions(b) as x (x)}<span class="rounded bg-muted px-1.5 py-0.5 font-medium">{x}</span>{/each}</div>
          <span class={cn('font-semibold', r.text === t('Kalıcı') ? 'text-destructive' : 'text-muted-foreground')}>{r.text}</span>
          {#if r.pct !== null && b.isActive}<span class="h-1 overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full bg-warning" style="width:{r.pct}%"></span></span>{/if}
        </div>
        <div class="flex justify-end gap-1">
          {#if b.isActive}<Button size="sm" variant="outline" onclick={() => lift(b.id)}>{t('Kaldır')}</Button>{/if}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}<Button {...props} variant="ghost" size="icon-sm" aria-label={t('İşlemler')}><DotsIcon weight="bold" /></Button>{/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item onSelect={() => (location.href = `/admin/bans/${b.id}`)}>{t('Düzenle')}</DropdownMenu.Item>
              {#if !b.isActive}<DropdownMenu.Item variant="destructive" onSelect={() => remove(b.id)}>{t('Kaydı sil')}</DropdownMenu.Item>{/if}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>
    {/each}
  </div>
{/if}

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <Dialog.Header><Dialog.Title>{t('Yeni yasak')}</Dialog.Title><Dialog.Description>{t('Birden çok tetikleyici ve ayrıntılı kısıtlama seçebilirsin.')}</Dialog.Description></Dialog.Header>
    <BanForm
      ondone={async () => {
        open = false;
        await invalidate('app:admin-bans');
      }}
    />
  </Dialog.Content>
</Dialog.Root>
