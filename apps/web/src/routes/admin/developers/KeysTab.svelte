<script lang="ts">
  import { API_SCOPES, API_SCOPE_INFO, type AdminApiKey, type ApiScope, type Paginated, type UserSummary } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import KeyIcon from 'phosphor-svelte/lib/Key';
  import ProhibitIcon from 'phosphor-svelte/lib/Prohibit';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import Field from '$lib/components/Field.svelte';
  import Combobox, { type ComboOption } from '$lib/components/Combobox.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDate } from '$lib/format';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';
  import SecretDialog from './SecretDialog.svelte';

  let { keys }: { keys: AdminApiKey[] } = $props();

  let open = $state(false);
  let name = $state('');
  let userId = $state<number | null>(null);
  let scopes = $state<ApiScope[]>(['read']);
  let expires = $state('');
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);
  let secrets = $state<Array<{ label: string; value: string }> | null>(null);

  async function searchUsers(q: string): Promise<ComboOption[]> {
    if (q.trim().length < 2) return [];
    const res = await api.get<Paginated<{ user: UserSummary }>>(`/api/members?q=${encodeURIComponent(q)}&perPage=10&sort=name&dir=asc`);
    return res.items.map((i) => ({ value: i.user.id, label: i.user.displayName, description: `@${i.user.username}`, avatar: i.user }));
  }
  function openNew() {
    name = '';
    userId = null;
    scopes = ['read'];
    expires = '';
    errors = {};
    open = true;
  }
  async function create() {
    saving = true;
    errors = {};
    try {
      const res = await api.post<{ key: string; id: number }>('/api/admin/developers/keys', { name, userId, scopes, expiresAt: expires ? new Date(expires).getTime() : null });
      secrets = [{ label: t('API anahtarı'), value: res.key }];
      open = false;
      await invalidate('app:admin-developers');
    } catch (e) {
      if (e instanceof ApiError) {
        errors = e.fields;
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
  async function revoke(k: AdminApiKey) {
    if (!(await confirmAction({
        title: t('"{name}" iptal edilsin mi?', { name: k.name }),
        description: t('Bu anahtarı kullanan sistemler hemen erişimini kaybeder.'),
        confirmLabel: t('İptal et'),
        destructive: true,
      }))) return;
    try {
      await api.delete(`/api/admin/developers/keys/${k.id}`);
      await invalidate('app:admin-developers');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  const status = (k: AdminApiKey) => (k.revokedAt ? 'İptal edildi' : k.expiresAt && k.expiresAt < Date.now() ? 'Süresi doldu' : 'Etkin');
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
    <div class="min-w-0 flex-1">
      <h2 class="font-bold">{t('API anahtarları')}</h2>
      <p class="text-sm text-muted-foreground">{t('Sunucudan sunucuya erişim (UCP arka ucu, Discord botu, oyun sunucusu). Anahtar, seçtiğin üyenin yetkileriyle ve seçtiğin izinlerle çalışır.')}</p>
    </div>
    <Button onclick={openNew}><PlusIcon weight="bold" />{t('Yeni anahtar')}</Button>
  </div>

  {#if keys.length}
    <div class="overflow-hidden rounded-xl border bg-card">
      <Table.Root>
        <Table.Header>
          <Table.Row><Table.Head>{t('Anahtar')}</Table.Head><Table.Head class="hidden md:table-cell">{t('Kimin adına')}</Table.Head><Table.Head>{t('İzinler')}</Table.Head><Table.Head class="hidden lg:table-cell">{t('Son kullanım')}</Table.Head><Table.Head class="w-24"></Table.Head></Table.Row>
        </Table.Header>
        <Table.Body>
          {#each keys as k (k.id)}
            <Table.Row class={cn(status(k) !== 'Etkin' && 'opacity-55')}>
              <Table.Cell>
                <span class="grid">
                  <span class="font-semibold">{k.name}</span>
                  <span class="font-mono text-xs text-muted-foreground">{k.prefix}… · {t(status(k))}{k.expiresAt ? ` · ${t('bitiş {date}', { date: formatDate(k.expiresAt) })}` : ''}</span>
                </span>
              </Table.Cell>
              <Table.Cell class="hidden text-sm md:table-cell">{k.user ? `${k.user.displayName} (@${k.user.username})` : '—'}</Table.Cell>
              <Table.Cell><span class="flex flex-wrap gap-1">{#each k.scopes as s (s)}<span class={cn('rounded px-1.5 py-px text-[11px] font-semibold', s === 'admin' ? 'bg-destructive/15 text-destructive' : 'bg-primary-soft text-highlight')}>{s}</span>{/each}</span></Table.Cell>
              <Table.Cell class="hidden text-xs text-muted-foreground lg:table-cell">{#if k.lastUsedAt}<TimeAgo ms={k.lastUsedAt} />{k.lastIp ? ` · ${k.lastIp}` : ''}{:else}{t('Hiç')}{/if}</Table.Cell>
              <Table.Cell class="text-right">{#if !k.revokedAt}<Button variant="ghost" size="sm" class="text-destructive" onclick={() => revoke(k)}><ProhibitIcon />{t('İptal')}</Button>{/if}</Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {:else}
    <p class="rounded-xl border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">{t('Henüz API anahtarı yok.')}</p>
  {/if}
  <div class="rounded-xl border bg-muted/20 p-4 text-sm">
    <p class="mb-2 font-semibold">{t('Kullanım')}</p>
    <pre class="overflow-x-auto rounded-md border bg-card p-3 font-mono text-xs">curl -H "Authorization: Bearer fk_…" {page.url.origin}/api/members?q=ali</pre>
  </div>
</div>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2"><KeyIcon />{t('Yeni API anahtarı')}</Dialog.Title>
      <Dialog.Description>{t('Anahtar yalnızca oluşturulduğunda bir kez gösterilir.')}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-4">
      <Field label={t('Ad')} error={errors.name}><Input bind:value={name} maxlength={60} placeholder={t('ör. UCP sunucusu')} /></Field>
      <Field label={t('Kimin adına')} error={errors.userId} hint={t('Boş bırakılırsa senin hesabınla çalışır. Bot hesabı açıp onu seçmen önerilir.')}>
        <Combobox load={searchUsers} bind:value={userId} placeholder={t('Üye ara…')} searchPlaceholder={t('En az 2 harf yazın…')} clearable />
      </Field>
      <div class="grid gap-2">
        <span class="text-sm font-semibold">{t('İzinler')}</span>
        {#each API_SCOPES as s (s)}
          <label class="flex items-start gap-3 text-sm">
            <Checkbox checked={scopes.includes(s)} onCheckedChange={(v) => (scopes = v === true ? [...new Set([...scopes, s])] : scopes.filter((x) => x !== s))} class="mt-0.5" />
            <span class="grid"><span class={cn('font-semibold', s === 'admin' && 'text-destructive')}>{t(API_SCOPE_INFO[s].label)} <code class="text-[11px] font-normal text-muted-foreground">{s}</code></span><span class="text-xs text-muted-foreground">{t(API_SCOPE_INFO[s].description)}</span></span>
          </label>
        {/each}
        {#if errors.scopes}<p class="text-xs text-destructive">{errors.scopes}</p>{/if}
      </div>
      <Field label={t('Bitiş (isteğe bağlı)')} error={errors.expiresAt}><Input type="date" bind:value={expires} /></Field>
    </div>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>{t('Vazgeç')}</Button>
      <Button onclick={create} disabled={saving || name.trim().length < 2 || !scopes.length}>{#if saving}<LoaderIcon class="animate-spin" />{/if}{t('Oluştur')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<SecretDialog
  title={t('API anahtarın hazır')}
  bind:items={secrets}
  note={t('İsteklerde "Authorization: Bearer <anahtar>" başlığıyla gönder. Anahtar sızarsa hemen iptal et.')}
/>
