<script lang="ts">
  import type { StorageWarning } from '@forum/shared';
  import WarningIcon from 'phosphor-svelte/lib/WarningOctagon';
  import { t } from '$lib/i18n.svelte';

  /** Docker'da depolama klasörüne kalıcı disk bağlı değil: yeniden dağıtımda veriler kaybolur. */
  let { warning }: { warning: StorageWarning } = $props();

  const copyCmd = $derived(
    warning.volume
      ? `docker run --rm -v ${warning.volume}:/from -v NEW_VOLUME:/to alpine sh -c "find /to -mindepth 1 -delete && cp -a /from/. /to/"`
      : null,
  );
</script>

<section
  class="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
  data-part="storage-warning"
  role="alert"
>
  <div class="flex items-start gap-3">
    <WarningIcon class="mt-0.5 size-6 shrink-0 text-destructive" weight="fill" />
    <div class="grid min-w-0 gap-3 text-sm">
      <div>
        <h2 class="font-bold text-destructive">
          {t('Veriler kalıcı değil: yeniden dağıtımda forum silinir')}
        </h2>
        <p class="mt-1 text-muted-foreground">
          {warning.database
            ? t(
                '{path} klasörüne kalıcı disk bağlı değil. Veritabanı, yüklemeler ve yedekler kapsayıcıyla birlikte siliniyor; bu yüzden her yeniden dağıtımda kurulum sayfası yeniden açılıyor.',
                { path: warning.path },
              )
            : t(
                '{path} klasörüne kalıcı disk bağlı değil. Yüklenen dosyalar ve yedekler kapsayıcıyla birlikte siliniyor.',
                { path: warning.path },
              )}
        </p>
      </div>
      {#if warning.coolify}
        <ol class="grid list-decimal gap-1.5 pl-5">
          <li>
            {t('Coolify’da forumun kaynağını açın ve Persistent Storage (Kalıcı depolama) bölümüne gidin.')}
          </li>
          <li>
            {t(
              '"+ Add" → "Volume Mount" seçin; ad olarak inkforum-storage, hedef yol (Destination Path) olarak {path} yazıp kaydedin.',
              { path: warning.path },
            )}
          </li>
          <li>
            {t(
              'Redeploy yapın; şu anki verileri korumak için ardından aşağıdaki adımı uygulayın. Bundan sonra güncellemeler ve yeniden dağıtımlar verilere dokunmaz.',
            )}
          </li>
        </ol>
      {:else}
        <p>
          {t(
            '{path} için adlandırılmış bir birim bağlayın (ör. docker run -v inkforum-storage:{path} …) ya da resmi docker-compose.yml dosyasını kullanın.',
            { path: warning.path },
          )}
        </p>
      {/if}
      {#if copyCmd}
        <div class="grid gap-1.5">
          <p class="font-semibold">{t('Şu anki verileri yeni birime taşıma')}</p>
          <p class="text-muted-foreground">
            {t(
              'Veriler şu an isimsiz bir Docker biriminde duruyor. Kalıcı birimi ekleyip yeniden dağıttıktan sonra kurulum sihirbazını doldurmayın: forumu durdurun (Stop), sunucuda yeni birimin adını "docker volume ls" ile bulun, NEW_VOLUME yerine yazıp aşağıdaki komutu çalıştırın ve forumu yeniden başlatın.',
            )}
          </p>
          <pre
            class="rounded-lg border bg-background px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap select-all">{copyCmd}</pre>
        </div>
      {/if}
    </div>
  </div>
</section>
