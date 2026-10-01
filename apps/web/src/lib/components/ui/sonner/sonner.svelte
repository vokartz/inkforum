<script lang="ts">
	import { theme } from "$lib/theme.svelte";
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";
	import Loader2Icon from 'phosphor-svelte/lib/CircleNotch';
	import CircleCheckIcon from 'phosphor-svelte/lib/CheckCircle';
	import OctagonXIcon from 'phosphor-svelte/lib/XCircle';
	import InfoIcon from 'phosphor-svelte/lib/Info';
	import TriangleAlertIcon from 'phosphor-svelte/lib/Warning';

	let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
	theme={theme.resolved}
	class="toaster group"
	style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
	toastOptions={{
		classes: {
			toast: "cn-toast",
		},
	}}
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4" />
	{/snippet}
</Sonner>
