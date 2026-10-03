<script lang="ts" module>
  import { CAPTCHA_SCRIPTS } from '@forum/shared';

  type Provider = keyof typeof CAPTCHA_SCRIPTS;
  interface Widget {
    render: (el: HTMLElement, opts: Record<string, unknown>) => string | number;
    reset: (id?: string | number) => void;
  }
  const GLOBALS: Record<Provider, string> = { turnstile: 'turnstile', hcaptcha: 'hcaptcha', recaptcha: 'grecaptcha' };

  const loading = new Map<Provider, Promise<Widget>>();
  function loadProvider(p: Provider): Promise<Widget> {
    let promise = loading.get(p);
    if (!promise) {
      promise = new Promise<Widget>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = CAPTCHA_SCRIPTS[p].src;
        s.async = true;
        s.onerror = () => {
          loading.delete(p);
          reject(new Error('captcha'));
        };
        document.head.append(s);
        const started = Date.now();
        const wait = () => {
          const w = (window as unknown as Record<string, Widget | undefined>)[GLOBALS[p]];
          if (w && typeof w.render === 'function') resolve(w);
          else if (Date.now() - started > 15_000) reject(new Error('captcha'));
          else setTimeout(wait, 60);
        };
        wait();
      });
      loading.set(p, promise);
    }
    return promise;
  }
</script>

<script lang="ts">
  import { captchaRequired, DEFAULT_CAPTCHA_CONFIG, type CaptchaConfig, type CaptchaForm } from '@forum/shared';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwise';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import { api } from '$lib/api';
  import { theme } from '$lib/theme.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { form, value = $bindable(), error = undefined }: { form: CaptchaForm; value?: string; error?: string } = $props();

  const cfg = $derived((page.data.viewer?.settings['captcha.config'] as CaptchaConfig | undefined) ?? DEFAULT_CAPTCHA_CONFIG);
  const required = $derived(captchaRequired(cfg, form));

  let question = $state('');
  let token = $state('');
  let answer = $state('');
  $effect(() => {
    if (cfg.provider === 'builtin') value = token && answer.trim() ? `${token}|${answer.trim()}` : '';
  });
  async function fetchQuestion() {
    answer = '';
    try {
      const r = await api.get<{ token: string; question: string }>('/api/auth/captcha');
      token = r.token;
      question = r.question;
    } catch {
      question = '';
    }
  }

  let box = $state<HTMLElement | null>(null);
  let widget: Widget | null = null;
  let widgetId: string | number | undefined;
  let failed = $state(false);

  onMount(() => {
    if (!required) return;
    if (cfg.provider === 'builtin') {
      void fetchQuestion();
      return;
    }
    const p = cfg.provider as Provider;
    loadProvider(p)
      .then((w) => {
        if (!box) return;
        widget = w;
        widgetId = w.render(box, {
          sitekey: cfg.siteKey,
          theme: theme.resolved,
          callback: (tok: string) => (value = tok),
          'expired-callback': () => (value = ''),
          'error-callback': () => (value = ''),
        });
      })
      .catch(() => (failed = true));
  });

  export function reset() {
    value = '';
    if (cfg.provider === 'builtin') void fetchQuestion();
    else widget?.reset(widgetId);
  }
</script>

{#if required}
  <div class="grid gap-1.5" data-part="captcha">
    <input type="hidden" name="captcha" {value} />
    {#if cfg.provider === 'builtin'}
      <label class="text-sm font-medium" for="captcha-{form}">{t('Robot olmadığını doğrula')}</label>
      <div class="flex items-center gap-2">
        <span class="flex h-11 shrink-0 items-center gap-2 rounded-lg border bg-muted/60 px-3 font-mono text-sm font-semibold tabular-nums select-none">
          <ShieldCheckIcon class="size-4 text-primary" weight="duotone" />{question || '…'}
        </span>
        <input
          id="captcha-{form}"
          bind:value={answer}
          inputmode="numeric"
          autocomplete="off"
          placeholder={t('Cevap')}
          aria-invalid={error ? 'true' : undefined}
          class={cn('h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30', error && 'border-destructive')}
        />
        <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-lg border text-muted-foreground hover:bg-accent hover:text-foreground" onclick={fetchQuestion} aria-label={t('Başka soru')}>
          <ArrowsClockwiseIcon class="size-4" />
        </button>
      </div>
    {:else}
      <div bind:this={box} class="min-h-[65px]"></div>
      {#if failed}<p class="text-xs text-muted-foreground">{t('Doğrulama yüklenemedi. Reklam engelleyiciyi kapatıp sayfayı yenileyin.')}</p>{/if}
    {/if}
    {#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
  </div>
{/if}
