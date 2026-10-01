<script lang="ts">
  import { THEME_PRESETS, themeConfigSchema, type ThemeDetail, type ThemeSummary } from '@forum/shared';
  import { goto, invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/PaintBrushBroad';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import DotsIcon from 'phosphor-svelte/lib/DotsThree';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import DownloadIcon from 'phosphor-svelte/lib/DownloadSimple';
  import ArrowCounterIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import CheckIcon from 'phosphor-svelte/lib/CheckCircle';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import ThemeThumb from '$lib/components/admin/themes/ThemeThumb.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();

  let newOpen = $state(false);
  let newName = $state('');
  let preset = $state('modern');
  let creating = $state(false);

  async function create() {
    if (!newName.trim()) return;
    creating = true;
    try {
      const r = await api.post<{ id: number }>('/api/admin/themes', { name: newName.trim(), preset });
      newOpen = false;
      await goto(`/admin/themes/${r.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      creating = false;
    }
  }

  async function activate(th: ThemeSummary) {
    try {
      await api.post(`/api/admin/themes/${th.id}/activate`);
      toast.success(t('"{name}" etkinleştirildi.', { name: th.name }));
      await Promise.all([invalidate('app:admin-themes'), invalidate('app:viewer')]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function duplicate(th: ThemeSummary) {
    try {
      const r = await api.post<{ id: number }>('/api/admin/themes', {
        name: t('{name} (kopya)', { name: th.name }).slice(0, 60),
        copyOf: th.id,
      });
      await goto(`/admin/themes/${r.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function exportTheme(th: ThemeSummary) {
    const d = await api.get<ThemeDetail>(`/api/admin/themes/${th.id}`);
    const blob = new Blob(
      [
        JSON.stringify(
          {
            inkforumTheme: 1,
            name: d.name,
            description: d.description,
            config: d.config,
            css: d.css,
            html: d.html,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${d.name.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9]+/g, '-') || 'tema'}.inkforum-theme.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  let fileInput = $state<HTMLInputElement | null>(null);
  async function importTheme(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as {
        name?: string;
        description?: string;
        config?: unknown;
        css?: string;
        html?: unknown;
      };
      const name =
        String(json.name ?? file.name.replace(/\..*$/, '')).slice(0, 60) || t('İçe aktarılan tema');
      const r = await api.post<{ id: number }>('/api/admin/themes', {
        name,
        data: {
          name,
          description: json.description ?? '',
          config: json.config ?? {},
          css: json.css ?? '',
          html: json.html ?? {},
        },
      });
      toast.success(t('Tema içe aktarıldı.'));
      await goto(`/admin/themes/${r.id}`);
    } catch (e) {
      toast.error(e instanceof SyntaxError ? t('Dosya geçerli bir tema (JSON) değil.') : errorMessage(e));
    }
  }

  async function reset(th: ThemeSummary) {
    if (
      !(await confirmAction({
        title: t('Varsayılana döndürülsün mü?'),
        description: t('Bu temadaki tüm değişiklikler, özel CSS ve HTML dahil, silinir.'),
        confirmLabel: t('Döndür'),
        destructive: true,
      }))
    )
      return;
    try {
      await api.post(`/api/admin/themes/${th.id}/reset`);
      toast.success(t('Tema varsayılana döndürüldü.'));
      await Promise.all([invalidate('app:admin-themes'), invalidate('app:viewer')]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function remove(th: ThemeSummary) {
    if (
      !(await confirmAction({
        title: t('"{name}" silinsin mi?', { name: th.name }),
        description: t('Bu işlem geri alınamaz. İsterseniz önce dışa aktarın.'),
        confirmLabel: t('Sil'),
        destructive: true,
      }))
    )
      return;
    try {
      await api.delete(`/api/admin/themes/${th.id}`);
      toast.success(t('Tema silindi.'));
      await invalidate('app:admin-themes');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<PageHeader
  title={t('Temalar')}
  description={t(
    'Forumun görünümünü kod yazmadan baştan tasarlayın: renkler, yazı, düzen, forum listesi, arka plan. İsterseniz kendi CSS ve HTML kodunuzu da ekleyin.',
  )}
  icon={PageHeaderIcon}
>
  {#snippet actions()}
    <Button variant="outline" onclick={() => fileInput?.click()}><UploadIcon />{t('İçe aktar')}</Button>
    <Button onclick={() => ((newName = ''), (preset = 'modern'), (newOpen = true))}
      ><PlusIcon />{t('Yeni tema')}</Button
    >
    <input
      bind:this={fileInput}
      type="file"
      accept="application/json,.json"
      class="hidden"
      onchange={importTheme}
    />
  {/snippet}
</PageHeader>

{#if data.themes}
  <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" data-part="theme-list">
    {#each data.themes as th (th.id)}
      <article
        class={cn(
          'group overflow-hidden rounded-2xl border bg-card shadow-card transition-colors',
          th.active && 'border-primary ring-2 ring-primary/25',
        )}
      >
        <a
          href="/admin/themes/{th.id}"
          class="block border-b"
          aria-label={t('{name} temasını düzenle', { name: th.name })}><ThemeThumb config={th.config} /></a
        >
        <div class="grid gap-3 p-4">
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <h2 class="flex flex-wrap items-center gap-1.5 font-bold">
                {th.name}
                {#if th.active}<Badge class="gap-1"
                    ><CheckIcon class="size-3" weight="fill" />{t('Etkin')}</Badge
                  >{/if}
                {#if th.isSystem}<Badge variant="secondary">{t('Sistem')}</Badge>{/if}
              </h2>
              {#if th.description}<p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {th.description}
                </p>{/if}
            </div>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}<Button
                    {...props}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('Tema işlemleri')}><DotsIcon weight="bold" /></Button
                  >{/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" class="w-52">
                <DropdownMenu.Item onSelect={() => duplicate(th)}
                  ><CopyIcon />{t('Kopyala')}</DropdownMenu.Item
                >
                <DropdownMenu.Item onSelect={() => exportTheme(th)}
                  ><DownloadIcon />{t('Dışa aktar (JSON)')}</DropdownMenu.Item
                >
                {#if th.isSystem}<DropdownMenu.Item onSelect={() => reset(th)}
                    ><ArrowCounterIcon />{t('Varsayılana döndür')}</DropdownMenu.Item
                  >{/if}
                {#if !th.isSystem && !th.active}
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item variant="destructive" onSelect={() => remove(th)}
                    ><TrashIcon />{t('Sil')}</DropdownMenu.Item
                  >
                {/if}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>
          <div class="flex gap-2">
            <Button href="/admin/themes/{th.id}" size="sm" class="flex-1"><PencilIcon />{t('Düzenle')}</Button
            >
            {#if !th.active}<Button variant="outline" size="sm" class="flex-1" onclick={() => activate(th)}
                >{t('Etkinleştir')}</Button
              >{/if}
          </div>
        </div>
      </article>
    {/each}
  </div>
{/if}

<Dialog.Root bind:open={newOpen}>
  <Dialog.Content class="sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>{t('Yeni tema')}</Dialog.Title>
      <Dialog.Description
        >{t('Bir başlangıç teması seçin; ardından her ayrıntısını düzenleyebilirsiniz.')}</Dialog.Description
      >
    </Dialog.Header>
    <form
      class="grid gap-4"
      onsubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <Input bind:value={newName} maxlength={60} placeholder={t('Tema adı')} aria-label={t('Tema adı')} />
      <div class="grid max-h-[55vh] gap-3 overflow-y-auto p-0.5 sm:grid-cols-2 lg:grid-cols-4">
        {#each THEME_PRESETS as p (p.key)}
          <button
            type="button"
            onclick={() => ((preset = p.key), !newName.trim() && (newName = t(p.name)))}
            class={cn(
              'overflow-hidden rounded-xl border text-left transition-colors hover:border-primary/60',
              preset === p.key && 'border-primary ring-2 ring-primary/30',
            )}
          >
            <ThemeThumb config={themeConfigSchema.parse(p.config)} />
            <span class="grid gap-0.5 p-2.5"
              ><span class="text-sm font-semibold">{t(p.name)}</span><span
                class="line-clamp-2 text-[11px] text-muted-foreground">{t(p.description)}</span
              ></span
            >
          </button>
        {/each}
      </div>
      <Dialog.Footer>
        <Button type="button" variant="ghost" onclick={() => (newOpen = false)}>{t('Vazgeç')}</Button>
        <Button type="submit" disabled={creating || !newName.trim()}>{t('Oluştur ve düzenle')}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
