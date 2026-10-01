<script lang="ts">
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { t } from '$lib/i18n.svelte';

  type Btn = { label: string; url: string; style: 'primary' | 'outline' | 'ghost'; newTab: boolean };
  let { value = $bindable([]) }: { value?: Btn[] } = $props();

  const QUICK = [
    { label: 'Foruma git', url: '/forum' },
    { label: 'Kayıt ol', url: '/register' },
    { label: 'Wiki', url: '/wiki' },
  ];
</script>

<div class="grid gap-2">
  <span class="text-xs font-semibold text-muted-foreground">{t('Düğmeler')}</span>
  {#each value as b, i (i)}
    <div class="grid gap-1.5 rounded-lg border bg-muted/20 p-2">
      <div class="flex gap-1.5">
        <Input bind:value={b.label} placeholder={t('Yazı')} class="h-8 text-xs" maxlength={40} />
        <select bind:value={b.style} class="h-8 rounded-md border bg-background px-1.5 text-xs">
          <option value="primary">{t('Dolgulu')}</option>
          <option value="outline">{t('Çerçeveli')}</option>
          <option value="ghost">{t('Sade')}</option>
        </select>
        <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onclick={() => (value = value.filter((_, k) => k !== i))} aria-label={t('Düğmeyi sil')}><TrashIcon class="size-4" /></button>
      </div>
      <Input bind:value={b.url} placeholder="/forum, https://discord.gg/…, fivem://connect/…" class="h-8 font-mono text-xs" />
      <label class="flex items-center gap-2 text-xs"><Switch bind:checked={b.newTab} class="scale-75" />{t('Yeni sekmede aç')}</label>
    </div>
  {/each}
  {#if value.length < 3}
    <div class="flex flex-wrap gap-1.5">
      <button type="button" class="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-semibold hover:bg-accent" onclick={() => (value = [...value, { label: t('Düğme'), url: '/', style: value.length ? 'outline' : 'primary', newTab: false }])}><PlusIcon class="size-3.5" />{t('Düğme')}</button>
      {#each QUICK.filter((q) => !value.some((v) => v.url === q.url)) as q (q.url)}
        <button type="button" class="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => (value = [...value, { ...q, label: t(q.label), style: value.length ? 'outline' : 'primary', newTab: false }])}>+ {t(q.label)}</button>
      {/each}
    </div>
  {/if}
</div>
