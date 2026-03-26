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
	let crashed = $state(false);
	let crashError = $state<Error | null>(null);

	function handleCrash(e: unknown) {
		crashed = true;
		crashError = e instanceof Error ? e : new Error(String(e));
		console.error('Scope crashed:', e);
	}

	function recover() {
		crashed = false;
		crashError = null;
	}

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
		<svelte:boundary onerror={handleCrash}>
			{#if crashed}
				<div class="flex min-h-[80vh] flex-col items-center justify-center gap-6 px-6 text-center">
					<div class="flex h-20 w-20 items-center justify-center rounded-full bg-surface">
						<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-accent-red"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
					</div>
					<div class="space-y-2">
						<h1 class="text-2xl font-bold tracking-tight text-text">Something went wrong</h1>
						<p class="max-w-sm text-sm text-text-muted">{crashError?.message || 'An unexpected error occurred.'}</p>
					</div>
					<div class="flex items-center gap-3">
						<button onclick={recover} class="btn-dark btn-pill px-6 py-2.5 text-sm font-medium">
							<span class="btn-stroke"></span><span class="btn-highlight"></span>
							<span class="relative">Try Again</span>
						</button>
						<a href="/" class="btn-dark btn-pill px-6 py-2.5 text-sm font-medium" onclick={recover}>
							<span class="btn-stroke"></span><span class="btn-highlight"></span>
							<span class="relative">Go Home</span>
						</a>
					</div>
				</div>
			{:else}
				{@render children()}
			{/if}
		</svelte:boundary>
	</div>
</div>

<Toaster
	position="bottom-right"
	theme="dark"
	toastOptions={{
		style: 'background: rgba(28, 25, 23, 0.95); border: 1px solid rgba(231,229,228,0.08); backdrop-filter: blur(16px); color: #fafaf9;',
	}}
/>
