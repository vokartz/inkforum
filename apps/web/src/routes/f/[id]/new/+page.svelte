<script lang="ts">
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import SendIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import PinIcon from 'phosphor-svelte/lib/PushPin';
  import LockIcon from 'phosphor-svelte/lib/Lock';
  import InfoIcon from 'phosphor-svelte/lib/Info';
  import BellIcon from 'phosphor-svelte/lib/BellRinging';
  import TextIcon from 'phosphor-svelte/lib/TextAlignLeft';
  import ChartIcon from 'phosphor-svelte/lib/ChartBar';
  import CheckIcon from 'phosphor-svelte/lib/CheckCircle';
  import LightbulbIcon from 'phosphor-svelte/lib/Lightbulb';
  import BookIcon from 'phosphor-svelte/lib/BookOpenText';
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import Breadcrumbs from '$lib/components/forum/Breadcrumbs.svelte';
  import BoardIcon from '$lib/components/forum/BoardIcon.svelte';
  import ModeratorList from '$lib/components/forum/ModeratorList.svelte';
  import TagInput from '$lib/components/forum/TagInput.svelte';
  import PollEditor, { emptyPoll, pollPayload, type PollDraft } from '$lib/components/forum/PollEditor.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import TopicTemplateForm from '$lib/components/forum/TopicTemplateForm.svelte';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { formatNumber } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const ctx = $derived(data.ctx);

  let title = $state('');
  let body = $state('');
  let tags = $state<string[]>([]);
  let prefixId = $state<number | null>(null);
  let pinned = $state(false);
  let locked = $state(false);
  let subscribe = $state(true);
  let tab = $state<'content' | 'poll'>('content');
  let withPoll = $state(false);
  let poll = $state<PollDraft>(emptyPoll());
  let editor = $state<ReturnType<typeof Editor> | null>(null);
  let answers = $state<Record<string, string | string[]>>({});
  const form = createForm();
  // Konu şablonu: sorular sorulur; başlık şablonu varsa başlık da yanıtlardan oluşur
  const tpl = $derived(ctx.template);
  const useTpl = $derived(tpl.enabled && tpl.fields.length > 0);
  const needsTitle = $derived(!useTpl || !tpl.titleTemplate);
  const showBody = $derived(!useTpl || tpl.allowMessage);

  // Başlık, etiket ve anket taslağı da (mesaj gövdesi editörün kendi taslağında) tarayıcıda saklanır.
  const metaKey = $derived(`forum:new-topic-meta:${ctx.board.id}`);
  let restored = false;
  $effect(() => {
    if (restored) return;
    restored = true;
    try {
      const raw = localStorage.getItem(metaKey);
      if (!raw) return;
      const m = JSON.parse(raw) as { title?: string; tags?: string[]; prefixId?: number | null; poll?: PollDraft | null };
      title = m.title ?? '';
      tags = Array.isArray(m.tags) ? m.tags : [];
      prefixId = m.prefixId ?? null;
      if (m.poll) {
        poll = m.poll;
        withPoll = true;
      }
    } catch {
      /* taslak okunamadı */
    }
  });
  $effect(() => {
    const snapshot = JSON.stringify({ title, tags, prefixId, poll: withPoll ? poll : null });
    const t = setTimeout(() => {
      try {
        if (title || tags.length || withPoll) localStorage.setItem(metaKey, snapshot);
        else localStorage.removeItem(metaKey);
      } catch {
        /* depolama kapalı */
      }
    }, 400);
    return () => clearTimeout(t);
  });

  const pollReady = $derived(withPoll && poll.question.trim().length >= 3 && poll.options.filter((o) => o.label.trim()).length >= 2);
  const titleMax = $derived(ctx.limits.titleMaxLength);

  async function submit(e?: SubmitEvent) {
    e?.preventDefault();
    if (withPoll && !pollReady) {
      tab = 'poll';
      toast.error(t('Anketi tamamlayın ya da kaldırın (soru ve en az iki seçenek).'));
      return;
    }
    const res = await form.submit(() =>
      api.post<{ topicId: number; slug: string; approved: boolean }>(`/api/boards/${ctx.board.id}/topics`, {
        title: needsTitle ? title : '',
        body: showBody ? body : '',
        answers: useTpl ? $state.snapshot(answers) : undefined,
        prefixId,
        pinned,
        locked,
        tags,
        subscribe,
        poll: withPoll ? pollPayload(poll) : null,
      }),
    );
    if (!res) {
      if (Object.keys(form.errors).some((k) => k.startsWith('poll'))) tab = 'poll';
      else if (Object.keys(form.errors).length) tab = 'content';
      return;
    }
    editor?.clearDraft();
    try {
      localStorage.removeItem(metaKey);
    } catch {
      /* yok */
    }
    if (!res.approved) toast.info(t('Konunuz moderatör onayından sonra yayınlanacak.'));
    else if (ctx.privateTopics) toast.success(t('Konunuz açıldı; yalnızca siz ve yetkililer görebilir.'));
    else toast.success(t('Konunuz yayınlandı.'));
    await goto(`/t/${res.topicId}/${res.slug}`);
  }

  const tabBtn = 'relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors';
</script>

<svelte:head><title>{t('Yeni konu')} · {tc(ctx.board.name)}</title></svelte:head>

<Breadcrumbs items={ctx.breadcrumbs} current={t('Yeni konu')} />

<div class="grid gap-5">
  <header class="flex flex-wrap items-center gap-4" data-part="composer-header">
    <BoardIcon icon={ctx.board.icon} unread size={52} />
    <div class="min-w-0 flex-1">
      <h1 class="text-2xl font-extrabold tracking-tight">{t('Yeni konu aç')}</h1>
      <p class="text-sm text-muted-foreground"><b class="text-foreground">{tc(ctx.board.name)}</b> {t('bölümüne yazıyorsun')}</p>
    </div>
  </header>

  {#if ctx.privateTopics}
    <div class="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft/60 px-4 py-2.5 text-sm">
      <EyeSlashIcon class="size-4 shrink-0" />{t('Bu bölümdeki konular gizlidir: açtığın konuyu yalnızca sen ve yetkililer görebilir.')}
    </div>
  {/if}
  {#if ctx.board.requireApprovalTopics}
    <div class="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
      <InfoIcon class="size-4 shrink-0" />{t('Bu bölümde yeni konular moderatör onayından sonra yayınlanır.')}
    </div>
  {/if}

  <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
    <form class="overflow-hidden rounded-xl border bg-card shadow-card" onsubmit={submit} data-part="composer">
      <!-- Sekmeler -->
      <div class="flex border-b bg-panel-header" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'content'} class={cn(tabBtn, tab === 'content' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')} onclick={() => (tab = 'content')}>
          <TextIcon class="size-4" />{t('İçerik')}
          {#if tab === 'content'}<span class="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"></span>{/if}
        </button>
        {#if ctx.can.poll}
          <button type="button" role="tab" aria-selected={tab === 'poll'} class={cn(tabBtn, tab === 'poll' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')} onclick={() => (tab = 'poll')}>
            <ChartIcon class="size-4" />{t('Anket')}
            {#if pollReady}<CheckIcon class="size-4 text-success" weight="fill" />{:else if withPoll}<span class="size-1.5 rounded-full bg-warning"></span>{/if}
            {#if tab === 'poll'}<span class="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"></span>{/if}
          </button>
        {/if}
      </div>

      <div class="grid gap-5 p-4 sm:p-6">
        <FormMessage message={form.message} />

        <div class={cn('grid gap-5', tab !== 'content' && 'hidden')}>
          <div class={cn('grid gap-4', ctx.prefixes.length && 'sm:grid-cols-[13rem_minmax(0,1fr)]')}>
            {#if ctx.prefixes.length}
              <div class="grid content-start gap-2">
                <label for="prefix" class="text-sm font-semibold">{t('Önek')}</label>
                <Combobox
                  id="prefix"
                  options={ctx.prefixes.map((p) => ({ value: p.id, label: p.name, swatch: p.color ?? 'var(--primary)' }))}
                  bind:value={prefixId}
                  placeholder={t('Önek yok')}
                  clearable
                />
              </div>
            {/if}
            {#if needsTitle}<div class="grid content-start gap-2">
              <div class="flex items-center gap-2">
                <label for="title" class="text-sm font-semibold">{t('Başlık')}</label>
                <span class="text-[10px] font-bold tracking-wider text-destructive uppercase">{t('Gerekli')}</span>
                <span class={cn('ml-auto text-xs tabular-nums', title.length > titleMax - 15 ? 'text-warning' : 'text-muted-foreground')}>{title.length}/{titleMax}</span>
              </div>
              <Input id="title" bind:value={title} maxlength={titleMax} placeholder={t('Konunu kısaca ve açıklayıcı bir şekilde özetle')} required autofocus class="h-11 text-base font-medium" aria-invalid={!!form.error('title')} />
              {#if form.error('title')}<p class="text-xs text-destructive">{form.error('title')}</p>{/if}
            </div>{:else if form.error('title')}<p class="text-xs text-destructive">{form.error('title')}</p>{/if}
          </div>

          {#if useTpl}<TopicTemplateForm template={tpl} bind:answers errors={form.errors} />{/if}

          {#if ctx.tagging.enabled}
            <div class="grid gap-2">
              <div class="flex items-center gap-2">
                <label for="tags" class="text-sm font-semibold">{t('Etiketler')}</label>
                <span class="text-xs text-muted-foreground">{t('İsteğe bağlı · Enter ya da virgülle ekle')}</span>
              </div>
              <TagInput id="tags" bind:value={tags} max={ctx.tagging.max} allowNew={ctx.tagging.allowNew || ctx.can.moderate} popular={ctx.popularTags} invalid={!!form.error('tags')} />
              {#if form.error('tags')}<p class="text-xs text-destructive">{form.error('tags')}</p>{/if}
            </div>
          {/if}

          <div class={cn('grid gap-2', !showBody && 'hidden')}>
            <div class="flex items-center gap-2">
              <label for="body" class="text-sm font-semibold">{useTpl ? t('Ek mesaj') : t('Mesaj')}</label>
              {#if useTpl}<span class="text-xs text-muted-foreground">{t('İsteğe bağlı')}</span>{:else}<span class="text-[10px] font-bold tracking-wider text-destructive uppercase">{t('Gerekli')}</span>{/if}
            </div>
            <Editor
              bind:this={editor}
              id="body"
              bind:value={body}
              boardId={ctx.board.id}
              maxLength={ctx.limits.postMaxLength}
              minHeight={320}
              draftKey="new-topic:{ctx.board.id}"
              invalid={!!form.error('body')}
              onsubmit={() => submit()}
            />
            {#if form.error('body')}<p class="text-xs text-destructive">{form.error('body')}</p>{/if}
          </div>
        </div>

        {#if ctx.can.poll}
          <div class={cn('grid gap-5', tab !== 'poll' && 'hidden')}>
            {#if withPoll}
              <PollEditor bind:poll maxOptions={ctx.pollMaxOptions} errors={form.errors} />
              <Button type="button" variant="ghost" class="justify-self-start text-destructive" onclick={() => ((withPoll = false), (poll = emptyPoll()))}><TrashIcon />{t('Anketi kaldır')}</Button>
            {:else}
              <div class="grid justify-items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
                <span class="flex size-12 items-center justify-center rounded-lg bg-primary-soft text-primary"><ChartIcon class="size-6" weight="duotone" /></span>
                <p class="font-semibold">{t('Konuna bir anket ekle')}</p>
                <p class="max-w-sm text-sm text-muted-foreground">{t('Üyeler seçeneklerden birine ya da birkaçına oy verir; sonuçlar konunun en üstünde görünür.')}</p>
                <Button type="button" onclick={() => (withPoll = true)}><ChartIcon />{t('Anket oluştur')}</Button>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Seçenekler ve gönder -->
      <div class="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t bg-card/95 px-4 py-3 backdrop-blur sm:px-6" data-part="composer-actions">
        <label class="flex items-center gap-2 text-sm"><Switch bind:checked={subscribe} /><BellIcon class="size-4 text-muted-foreground" />{t('Konuyu takip et')}</label>
        {#if ctx.can.pin}<label class="flex items-center gap-2 text-sm"><Switch bind:checked={pinned} /><PinIcon class="size-4 text-muted-foreground" />{t('Sabitle')}</label>{/if}
        {#if ctx.can.lock}<label class="flex items-center gap-2 text-sm"><Switch bind:checked={locked} /><LockIcon class="size-4 text-muted-foreground" />{t('Kilitli aç')}</label>{/if}
        <div class="ml-auto flex items-center gap-2">
          <Button variant="ghost" href="/f/{ctx.board.id}/{ctx.board.slug}">{t('Vazgeç')}</Button>
          <Button type="submit" size="lg" disabled={form.submitting || (needsTitle && !title.trim())} title={t('Gönder (Ctrl+Enter)')}>
            {#if form.submitting}<LoaderIcon class="animate-spin" />{t('Gönderiliyor…')}{:else}<SendIcon weight="fill" />{t('Konuyu aç')}{/if}
          </Button>
        </div>
      </div>
    </form>

    <!-- Yan bilgi -->
    <aside class="grid gap-4" data-part="composer-aside">
      <section class="overflow-hidden rounded-xl border bg-card">
        <div class="flex items-center gap-3 border-b px-4 py-3">
          <BoardIcon icon={ctx.board.icon} size={36} />
          <div class="min-w-0">
            <p class="truncate font-bold">{tc(ctx.board.name)}</p>
            <p class="text-xs text-muted-foreground">{t('{n} konu', { n: formatNumber(ctx.board.topicCount) })} · {t('{n} mesaj', { n: formatNumber(ctx.board.postCount) })}</p>
          </div>
        </div>
        {#if ctx.board.description}<p class="px-4 py-3 text-sm text-muted-foreground">{tc(ctx.board.description)}</p>{/if}
        {#if ctx.board.moderators.users.length || ctx.board.moderators.groups.length}
          <div class="border-t px-4 py-3"><ModeratorList moderators={ctx.board.moderators} compact /></div>
        {/if}
      </section>

      <section class="grid gap-3 rounded-xl border bg-card p-4">
        <h2 class="flex items-center gap-2 text-sm font-bold"><LightbulbIcon class="size-4 text-warning" weight="fill" />{t('İyi bir konu için')}</h2>
        <ul class="grid gap-2.5 text-sm text-muted-foreground">
          <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-primary"></span>{t('Başlık, konuyu okumadan anlaşılacak kadar açık olsun.')}</li>
          <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-primary"></span>{t('Etiketler benzer konuların bulunmasını kolaylaştırır.')}</li>
          <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-primary"></span>{t('Ekran görüntüsü ve bağlantı eklemek yanıt almayı hızlandırır.')}</li>
        </ul>
        <div class="grid gap-1 border-t pt-3 text-sm">
          <a href="/search?q=&b={ctx.board.id}" class="flex items-center gap-2 text-link hover:underline"><MagnifyingGlassIcon class="size-4" />{t('Önce bu bölümde ara')}</a>
          <a href="/policies/rules" class="flex items-center gap-2 text-link hover:underline"><BookIcon class="size-4" />{t('Forum kuralları')}</a>
        </div>
      </section>
    </aside>
  </div>
</div>
