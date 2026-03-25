<script lang="ts">
	import './layout.css';
	import { browser } from '$app/environment';
	import { onNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { initAuth, getAuth, getAuthKey } from '$lib/stores/auth.svelte';
	import { loadAddons } from '$lib/stores/addons.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import { Toaster } from 'svelte-sonner';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
	let isWelcome = $state(false);

	if (browser) {
		initAuth();
		loadAddons(getAuthKey() || '');

		// Redirect first-time users to onboarding
		const onboarded = localStorage.getItem('scope_onboarded');
		if (!onboarded && !window.location.pathname.startsWith('/welcome')) {
			goto('/welcome');
		}
		isWelcome = window.location.pathname.startsWith('/welcome');
	}

	// Track if we're on the welcome page
	$effect(() => {
		const unsub = page.subscribe(p => {
			isWelcome = p.url.pathname.startsWith('/welcome');
		});
		return unsub;
	});

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-bg text-text antialiased">
	{#if !isWelcome}
		<Nav />
		<CommandPalette />
	{/if}
	<div class={isWelcome ? '' : 'pt-16'}>
		{@render children()}
	</div>
</div>

<Toaster
	position="bottom-right"
	theme="dark"
	toastOptions={{
		style: 'background: rgba(28, 25, 23, 0.95); border: 1px solid rgba(231,229,228,0.08); backdrop-filter: blur(16px); color: #fafaf9;',
	}}
/>
