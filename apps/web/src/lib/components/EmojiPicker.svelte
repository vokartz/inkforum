<script lang="ts" module>
  import { loadCustomEmojis } from '$lib/custom-emoji';
  interface EmojiEntry {
    unicode: string;
    label: string;
    tags: string;
    group: number;
    order: number;
    url?: string;
  }

  let dataPromise: Promise<EmojiEntry[]> | null = null;
  function loadData(): Promise<EmojiEntry[]> {
    dataPromise ??= import('emojibase-data/en/compact.json').then((m) =>
      (m.default as Array<{ unicode: string; label: string; tags?: string[]; group?: number; order?: number }>)
        .filter((e) => e.group !== undefined && e.group !== 2)
        .map((e) => ({ unicode: e.unicode, label: e.label, tags: (e.tags ?? []).join(' '), group: e.group!, order: e.order ?? 0 }))
        .sort((a, b) => a.order - b.order),
    );
    return dataPromise;
  }

  function loadCustom(): Promise<EmojiEntry[]> {
    return loadCustomEmojis().then((list) =>
      list.map((e, i) => ({ unicode: `:${e.shortcode}:`, label: e.name, tags: `${e.shortcode} ${e.category}`.toLocaleLowerCase('tr-TR'), group: -2, order: i, url: e.url })),
    );
  }

  const TR: Record<string, string> = {
    gül: 'smile grin laugh',
    gülen: 'smile grin',
    kahkaha: 'joy laugh rolling',
    güldür: 'joy laugh',
    kalp: 'heart',
    sevgi: 'love heart',
    aşk: 'love heart kiss',
    öp: 'kiss',
    ağla: 'cry sob',
    üzgün: 'sad cry disappointed',
    kız: 'angry rage',
    sinir: 'angry rage',
    şaşır: 'astonished surprised open mouth',
    düşün: 'thinking',
    uyku: 'sleep',
    ateş: 'fire',
    alev: 'fire',
    onay: 'check thumbs up',
    tamam: 'ok thumbs up check',
    beğen: 'thumbs up like',
    alkış: 'clap',
    parti: 'party tada',
    kutla: 'party tada confetti',
    göz: 'eyes eye',
    el: 'hand wave',
    selam: 'wave hand',
    para: 'money dollar',
    oyun: 'game controller video',
    araba: 'car',
    müzik: 'music note',
    kupa: 'trophy',
    yıldız: 'star',
    kedi: 'cat',
    köpek: 'dog',
    yemek: 'food',
    kahve: 'coffee',
    bayrak: 'flag',
    türkiye: 'turkey',
    güneş: 'sun',
    ay: 'moon',
    hayalet: 'ghost',
    kafatası: 'skull',
    polis: 'police',
    silah: 'pistol gun',
    bomba: 'bomb',
    kilit: 'lock',
    uyarı: 'warning',
    yasak: 'prohibited no entry',
    soru: 'question',
    ünlem: 'exclamation',
    hediye: 'gift',
    doğum: 'birthday cake',
    pasta: 'cake',
    telefon: 'phone mobile',
    bilgisayar: 'computer laptop',
    saat: 'clock watch',
    ev: 'house home',
  };
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import ClockIcon from 'phosphor-svelte/lib/ClockCounterClockwise';
  import SparkleIcon from 'phosphor-svelte/lib/Sparkle';
  import SmileyIcon from 'phosphor-svelte/lib/Smiley';
  import HandIcon from 'phosphor-svelte/lib/HandWaving';
  import PawIcon from 'phosphor-svelte/lib/PawPrint';
  import BowlIcon from 'phosphor-svelte/lib/BowlFood';
  import AirplaneIcon from 'phosphor-svelte/lib/AirplaneTilt';
  import BallIcon from 'phosphor-svelte/lib/SoccerBall';
  import LightbulbIcon from 'phosphor-svelte/lib/Lightbulb';
  import HeartIcon from 'phosphor-svelte/lib/Heart';
  import FlagIcon from 'phosphor-svelte/lib/Flag';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import { emojiCode } from '@forum/shared';
  import { cn, type IconComponent } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { onpick }: { onpick: (emoji: string) => void } = $props();

  const GROUPS: Array<{ id: number; label: string; icon: IconComponent }> = [
    { id: 0, label: 'İfadeler', icon: SmileyIcon },
    { id: 1, label: 'İnsanlar', icon: HandIcon },
    { id: 3, label: 'Hayvanlar ve doğa', icon: PawIcon },
    { id: 4, label: 'Yiyecek ve içecek', icon: BowlIcon },
    { id: 5, label: 'Seyahat ve yerler', icon: AirplaneIcon },
    { id: 6, label: 'Etkinlikler', icon: BallIcon },
    { id: 7, label: 'Nesneler', icon: LightbulbIcon },
    { id: 8, label: 'Semboller', icon: HeartIcon },
    { id: 9, label: 'Bayraklar', icon: FlagIcon },
  ];
  const RECENT_KEY = 'forum:recent-emojis';

  let data = $state<EmojiEntry[] | null>(null);
  let customs = $state<EmojiEntry[]>([]);
  let group = $state<number | 'recent' | 'custom'>(0);
  let query = $state('');
  let recent = $state<string[]>([]);
  let hover = $state<EmojiEntry | null>(null);

  onMount(() => {
    void loadData().then((d) => (data = d));
    void loadCustom().then((c) => {
      customs = c;
      if (c.length && group === 0) group = 'custom';
    });
    try {
      recent = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
      if (recent.length) group = 'recent';
    } catch {
      recent = [];
    }
  });

  const q = $derived(query.trim().toLocaleLowerCase('tr-TR'));
  const terms = $derived.by(() => {
    if (!q) return [];
    const extra = Object.entries(TR)
      .filter(([tr]) => tr.startsWith(q) || q.startsWith(tr))
      .flatMap(([, en]) => en.split(' '));
    return [q, ...extra];
  });
  const list = $derived.by<EmojiEntry[]>(() => {
    if (group === 'custom' && !q) return customs;
    if (!data) return [];
    const all = [...customs, ...data];
    if (q) return all.filter((e) => terms.some((t) => e.label.toLocaleLowerCase('tr-TR').includes(t) || e.tags.includes(t))).slice(0, 160);
    if (group === 'recent') return recent.map((u) => all.find((e) => e.unicode === u)).filter((e): e is EmojiEntry => !!e);
    return data.filter((e) => e.group === group);
  });
  const src = (e: EmojiEntry) => e.url ?? `/emoji/${emojiCode(e.unicode)}.svg`;

  function pick(e: EmojiEntry) {
    onpick(e.unicode);
    recent = [e.unicode, ...recent.filter((r) => r !== e.unicode)].slice(0, 32);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
    }
  }
</script>

<div class="grid w-[22rem] gap-2" data-part="emoji-picker">
  <div class="relative">
    <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={query}
      autofocus
      placeholder={t('Emoji ara (gül, kalp, ateş…)')}
      class="h-9 w-full rounded-lg border bg-card pr-2 pl-8 text-sm outline-none focus:border-ring"
      aria-label={t('Emoji ara')}
    />
  </div>
  {#if !q}
    <div class="flex justify-between border-b pb-1.5">
      <button
        type="button"
        title={t('Son kullanılanlar')}
        onclick={() => (group = 'recent')}
        class={cn('flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent', group === 'recent' && 'bg-primary-soft text-primary')}
        ><ClockIcon class="size-[18px]" weight={group === 'recent' ? 'fill' : 'regular'} /></button
      >
      {#if customs.length}
        <button
          type="button"
          title={t('Forumun emojileri')}
          onclick={() => (group = 'custom')}
          class={cn('flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent', group === 'custom' && 'bg-primary-soft text-primary')}
          ><SparkleIcon class="size-[18px]" weight={group === 'custom' ? 'fill' : 'regular'} /></button
        >
      {/if}
      {#each GROUPS as g (g.id)}
        <button
          type="button"
          title={t(g.label)}
          onclick={() => (group = g.id)}
          class={cn('flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent', group === g.id && 'bg-primary-soft text-primary')}
          ><g.icon class="size-[18px]" weight={group === g.id ? 'fill' : 'regular'} /></button
        >
      {/each}
    </div>
  {/if}
  <p class="px-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
    {q
      ? t('Arama sonuçları')
      : group === 'recent'
        ? t('Son kullanılanlar')
        : group === 'custom'
          ? t('Forumun emojileri')
          : t(GROUPS.find((g) => g.id === group)?.label ?? '')}
  </p>
  <div class="h-60 overflow-y-auto">
    {#if !data && group !== 'custom'}
      <div class="flex h-full items-center justify-center"><LoaderIcon class="size-5 animate-spin text-muted-foreground" /></div>
    {:else if !list.length}
      <p class="p-6 text-center text-sm text-muted-foreground">{group === 'recent' && !q ? t('Henüz emoji kullanmadın.') : t('Eşleşen emoji yok.')}</p>
    {:else}
      <div class="grid grid-cols-9 gap-0.5">
        {#each list as e (e.unicode)}
          <button
            type="button"
            onclick={() => pick(e)}
            onmouseenter={() => (hover = e)}
            title={e.label}
            class="flex aspect-square items-center justify-center rounded-lg transition-transform duration-150 hover:scale-125 hover:bg-accent"
          >
            <img
              src={src(e)}
              alt={e.unicode}
              loading="lazy"
              class="size-[22px] object-contain"
              draggable="false"
              onerror={(ev) => ((ev.currentTarget as HTMLElement).closest('button')!.style.display = 'none')}
            />
          </button>
        {/each}
      </div>
    {/if}
  </div>
  <div class="flex h-8 items-center gap-2 border-t pt-1.5 text-xs text-muted-foreground">
    {#if hover}
      <img src={src(hover)} alt="" class="size-6 object-contain" />
      {#if hover.url}<code class="text-[11px]">{hover.unicode}</code>{/if}
      <span class="truncate">{hover.label}</span>
    {:else}
      {t('Emojiler: {name}', { name: 'Twemoji' })}
    {/if}
  </div>
</div>
