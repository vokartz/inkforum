<script lang="ts">
  import PlugsIcon from 'phosphor-svelte/lib/PlugsConnected';
  import AppWindowIcon from 'phosphor-svelte/lib/AppWindow';
  import KeyIcon from 'phosphor-svelte/lib/Key';
  import WebhooksIcon from 'phosphor-svelte/lib/WebhooksLogo';
  import UsersIcon from 'phosphor-svelte/lib/UsersThree';
  import BookIcon from 'phosphor-svelte/lib/BookOpenText';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { t } from '$lib/i18n.svelte';
  import AppsTab from './AppsTab.svelte';
  import KeysTab from './KeysTab.svelte';
  import WebhooksTab from './WebhooksTab.svelte';
  import SocialTab from './SocialTab.svelte';

  let { data } = $props();
  let tab = $state('apps');
</script>

<svelte:head><title>{t('Geliştiriciler ve API · Yönetim')}</title></svelte:head>

<PageHeader
  title={t('Geliştiriciler ve API')}
  description={t("UCP'ler, paneller, botlar ve diğer siteler forumla OAuth 2.0, REST API ve webhook'lar üzerinden konuşur. Üyeler sosyal hesaplarıyla giriş yapabilir.")}
  icon={PlugsIcon}
>
  {#snippet actions()}
    <Button variant="outline" href="/developers" target="_blank"><BookIcon />{t('Belgeler')}</Button>
  {/snippet}
</PageHeader>

{#if data.dev}
  <Tabs.Root bind:value={tab}>
    <Tabs.List class="mb-4 max-w-full justify-start overflow-x-auto">
      <Tabs.Trigger value="apps"><AppWindowIcon />{t('Uygulamalar')} <span class="ml-1 rounded bg-muted px-1.5 text-[11px] font-bold">{data.dev.clients.length}</span></Tabs.Trigger>
      <Tabs.Trigger value="keys"><KeyIcon />{t('API anahtarları')} <span class="ml-1 rounded bg-muted px-1.5 text-[11px] font-bold">{data.dev.keys.filter((k) => !k.revokedAt).length}</span></Tabs.Trigger>
      <Tabs.Trigger value="webhooks"><WebhooksIcon />{t("Webhook'lar")} <span class="ml-1 rounded bg-muted px-1.5 text-[11px] font-bold">{data.dev.webhooks.length}</span></Tabs.Trigger>
      <Tabs.Trigger value="social"><UsersIcon />{t('Sosyal giriş')}</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="apps"><AppsTab clients={data.dev.clients} metadata={data.dev.metadata} /></Tabs.Content>
    <Tabs.Content value="keys"><KeysTab keys={data.dev.keys} /></Tabs.Content>
    <Tabs.Content value="webhooks"><WebhooksTab webhooks={data.dev.webhooks} /></Tabs.Content>
    <Tabs.Content value="social"><SocialTab social={data.dev.social} /></Tabs.Content>
  </Tabs.Root>
{/if}
