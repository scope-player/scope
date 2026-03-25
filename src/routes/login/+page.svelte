<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { login, getAuth, getAuthKey } from '$lib/stores/auth.svelte';
	import { refreshAddons } from '$lib/stores/addons.svelte';
	import { loadLibrary } from '$lib/stores/library.svelte';
	import { toast } from 'svelte-sonner';

	const auth = getAuth();

	let email = $state('');
	let password = $state('');
	let submitting = $state(false);

	onMount(() => {
		if (auth.isAuthenticated) goto('/');
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		submitting = true;

		try {
			await login(email, password);
			const key = getAuthKey();
			if (!key) {
				toast.error('Auth key missing after login');
				submitting = false;
				return;
			}
			toast.success('Signed in successfully');
			// Navigate first, then sync in background on the home page
			goto('/');
			// Kick off sync without awaiting — home page will pick it up reactively
			refreshAddons(key);
			loadLibrary(key);
		} catch (err: any) {
			const msg = typeof err?.message === 'string' ? err.message : 'Login failed. Please check your credentials.';
			toast.error(msg);
		}

		submitting = false;
	}
</script>

<svelte:head>
	<title>Sign In – Scope</title>
</svelte:head>

<div class="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
	<div class="w-full max-w-sm">
		<div class="mb-10 text-center">
			<div class="mx-auto mb-5" style="filter: drop-shadow(0 8px 24px rgba(109, 40, 217, 0.3));">
				<svg width="56" height="56" viewBox="0 0 100 100" fill="none">
					<path d="M50 5 L90 27.5 V72.5 L50 95 L10 72.5 V27.5 Z" fill="url(#login-grad)"/>
					<path d="M40 30 L72 50 L40 70 Z" fill="white"/>
					<defs><linearGradient id="login-grad" x1="50" y1="5" x2="50" y2="95" gradientUnits="userSpaceOnUse"><stop stop-color="#8B5CF6"/><stop offset="1" stop-color="#6D28D9"/></linearGradient></defs>
				</svg>
			</div>
			<h1 class="text-2xl font-bold tracking-tight text-text">Welcome back</h1>
			<p class="mt-2 text-sm text-text-muted">Sign in with your Stremio account to sync</p>
		</div>

		<form onsubmit={handleSubmit} class="space-y-5">
			<div class="space-y-1.5">
				<label for="email" class="block text-[13px] font-medium text-text-secondary">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					required
					autocomplete="email"
					placeholder="you@example.com"
					class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text placeholder-text-muted outline-none transition focus:border-[rgba(139,92,246,0.4)] focus:ring-2 focus:ring-[rgba(139,92,246,0.15)]"
				/>
			</div>

			<div class="space-y-1.5">
				<label for="password" class="block text-[13px] font-medium text-text-secondary">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
					placeholder="Your password"
					class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text placeholder-text-muted outline-none transition focus:border-[rgba(139,92,246,0.4)] focus:ring-2 focus:ring-[rgba(139,92,246,0.15)]"
				/>
			</div>

			<button
				type="submit"
				disabled={submitting || !email || !password}
				class="btn-light w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
			>
				<span class="btn-stroke"></span>
				<span class="btn-highlight"></span>
				{#if submitting}
					<span class="relative flex items-center justify-center gap-2">
						<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
						</svg>
						Signing in...
					</span>
				{:else}
					<span class="relative">Sign In</span>
				{/if}
			</button>
		</form>

		<p class="mt-8 text-center text-xs text-text-muted">
			Don't have an account?
			<a
				href="https://www.stremio.com"
				target="_blank"
				rel="noopener noreferrer"
				class="text-text-secondary transition hover:text-text"
			>
				Create one at stremio.com
			</a>
		</p>
	</div>
</div>
