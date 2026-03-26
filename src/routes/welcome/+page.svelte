<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { getAuth, getAuthKey, login } from '$lib/stores/auth.svelte';
	import { refreshAddons, installAddon, getAddons } from '$lib/stores/addons.svelte';
	import { loadLibrary } from '$lib/stores/library.svelte';
	import { serverHeartbeat, getServerUrl, setServerUrl, getCatalog, type StremioMeta } from '$lib/api/stremio';
	import { toast } from 'svelte-sonner';

	const auth = getAuth();
	const addonStore = getAddons();

	let step = $state(0);
	let animating = $state(false);
	let posters = $state<string[]>([]);

	// Step 1
	let email = $state('');
	let password = $state('');
	let loggingIn = $state(false);

	// Step 2
	let serverUrl = $state(getServerUrl());
	let serverOnline = $state(false);
	let checkingServer = $state(false);
	let serverTested = $state(false);

	// Step 3
	let addonUrl = $state('');
	let installingAddon = $state(false);

	onMount(async () => {
		// Fetch posters for the welcome background
		try {
			const [movies, series] = await Promise.allSettled([
				getCatalog('movie', 'top'),
				getCatalog('series', 'top'),
			]);
			const all: string[] = [];
			if (movies.status === 'fulfilled') all.push(...movies.value.filter(m => m.poster).map(m => m.poster));
			if (series.status === 'fulfilled') all.push(...series.value.filter(m => m.poster).map(m => m.poster));
			posters = all.slice(0, 24);
		} catch {}
	});

	function tick(ms: number) { return new Promise(r => setTimeout(r, ms)); }

	async function go(target: number) {
		if (animating || target === step) return;
		animating = true;
		await tick(200);
		step = target;
		await tick(50);
		animating = false;
	}

	async function handleLogin() {
		if (!email || !password) return;
		loggingIn = true;
		try {
			await login(email, password);
			const key = getAuthKey()!;
			toast.success('Signed in');
			await Promise.allSettled([refreshAddons(key), loadLibrary(key)]);
		} catch (err: any) {
			toast.error(typeof err?.message === 'string' ? err.message : 'Login failed');
			loggingIn = false;
			return;
		}
		loggingIn = false;
		go(2);
	}

	async function checkServer() {
		if (serverUrl !== getServerUrl()) setServerUrl(serverUrl);
		checkingServer = true;
		serverOnline = await serverHeartbeat();
		checkingServer = false;
		serverTested = true;
	}

	$effect(() => {
		if (step === 2 && !serverTested && !checkingServer) checkServer();
	});

	async function handleInstallAddon() {
		if (!addonUrl.trim()) return;
		installingAddon = true;
		try {
			const key = getAuthKey();
			const manifest = await installAddon(key || '', addonUrl.trim());
			toast.success(`${manifest.name} added`);
			addonUrl = '';
		} catch (err: any) {
			toast.error(err?.message || 'Failed to install');
		}
		installingAddon = false;
	}

	function finish() {
		localStorage.setItem('scope_onboarded', 'true');
		goto('/');
	}
</script>

<svelte:head>
	<title>Welcome to Scope</title>
</svelte:head>

<div class="fixed inset-0 z-[200] bg-bg overflow-hidden">
	<!-- Progress -->
	<div class="absolute top-0 left-0 right-0 h-[2px] bg-white/[0.03] z-30">
		<div class="h-full bg-white/20 transition-all duration-700 ease-out" style="width: {((step + 1) / 4) * 100}%"></div>
	</div>

	<!-- Step nav -->
	{#if step > 0}
		<div class="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex gap-8">
			{#each ['Account', 'Server', 'Addons'] as label, i}
				<button
					class="text-[11px] font-medium tracking-[0.08em] uppercase transition-colors duration-300 border-none bg-transparent cursor-pointer disabled:cursor-default
						{i + 1 === step ? 'text-white/80' : i + 1 < step ? 'text-white/30' : 'text-white/10'}"
					onclick={() => i + 1 <= step && go(i + 1)}
					disabled={i + 1 > step}
				>{label}</button>
			{/each}
		</div>
	{/if}

	<!-- Content -->
	<div class="flex h-full items-center justify-center">
		<div class="w-full max-w-[420px] px-6 transition-all duration-300 {animating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}" style="animation: contentIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;">

			{#if step === 0}
				<!-- ═══ WELCOME ═══ -->
				<div class="relative">
					<!-- Poster wall background (always reserves space) -->
					<div class="poster-wrapper">
						{#if posters.length > 0}
							<div class="poster-wall">
								{#each Array(6) as _, col}
									<div class="poster-col {col % 2 === 0 ? 'poster-col-up' : 'poster-col-down'}">
										{#each [0, 1] as _loop}
											{#each posters.slice(col * 4, col * 4 + 4) as src}
												<img {src} alt="" class="poster-img" />
											{/each}
										{/each}
									</div>
								{/each}
							</div>
						{/if}
						<div class="poster-fade-top"></div>
						<div class="poster-fade-bottom"></div>
					</div>

					<div class="relative z-10 flex flex-col items-center pt-16 pb-8">
						<svg width="48" height="48" viewBox="0 0 100 100" fill="none" class="mb-6">
							<path d="M50 5 L90 27.5 V72.5 L50 95 L10 72.5 V27.5 Z" fill="url(#wg)"/>
							<path d="M40 30 L72 50 L40 70 Z" fill="white"/>
							<defs><linearGradient id="wg" x1="50" y1="5" x2="50" y2="95" gradientUnits="userSpaceOnUse"><stop stop-color="#8B5CF6"/><stop offset="1" stop-color="#6D28D9"/></linearGradient></defs>
						</svg>

						<h1 class="text-[40px] font-extrabold tracking-[-0.04em] leading-[1] text-text mb-3">Scope</h1>
						<p class="text-[15px] text-text-muted mb-10">Your movies and shows, beautifully.</p>

						<button onclick={() => go(1)} class="btn-light btn-pill inline-flex items-center gap-2 px-8 py-3.5 text-[15px] font-semibold">
							<span class="btn-stroke"></span><span class="btn-highlight"></span>
							<span class="relative">Get Started</span>
						</button>
					</div>
				</div>

			{:else if step === 1}
				<!-- ═══ ACCOUNT ═══ -->
				<div class="space-y-6">
					<div>
						<h2 class="text-[22px] font-bold tracking-tight text-text mb-1.5">Connect your account</h2>
						<p class="text-[13px] text-text-muted leading-relaxed">Sign in with Stremio to sync your library and addons.</p>
					</div>

					{#if auth.isAuthenticated}
						<div class="flex items-center gap-3 rounded-xl border border-accent-green/15 bg-accent-green/[0.04] px-4 py-3.5">
							<div class="h-2.5 w-2.5 rounded-full bg-accent-green shadow-[0_0_10px_rgba(34,197,94,0.4)]"></div>
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-wider text-accent-green/70">Connected</p>
								<p class="text-sm text-text">{auth.user?.email}</p>
							</div>
						</div>
						<button onclick={() => go(2)} class="btn-light btn-pill px-7 py-3 text-sm font-semibold">
							<span class="btn-stroke"></span><span class="btn-highlight"></span>
							<span class="relative">Continue</span>
						</button>
					{:else}
						<form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="space-y-3.5">
							<input type="email" bind:value={email} required autocomplete="email" placeholder="Email" class="ob-input" />
							<input type="password" bind:value={password} required autocomplete="current-password" placeholder="Password" class="ob-input" />
							<button type="submit" disabled={loggingIn || !email || !password} class="btn-light w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40">
								<span class="btn-stroke"></span><span class="btn-highlight"></span>
								<span class="relative">{loggingIn ? 'Connecting...' : 'Sign In'}</span>
							</button>
						</form>
						<button onclick={() => go(2)} class="block mx-auto text-[13px] text-text-muted/50 bg-transparent border-none cursor-pointer transition-colors hover:text-text-muted">Skip</button>
					{/if}
				</div>

			{:else if step === 2}
				<!-- ═══ SERVER ═══ -->
				<div class="space-y-6">
					<div>
						<h2 class="text-[22px] font-bold tracking-tight text-text mb-1.5">Streaming server</h2>
						<p class="text-[13px] text-text-muted leading-relaxed">For torrent playback. Works out of the box if the Stremio app is running.</p>
					</div>

					<div class="flex gap-2.5">
						<input type="url" bind:value={serverUrl} placeholder="http://127.0.0.1:11470" class="ob-input flex-1 !font-mono !text-[13px]" />
						<button onclick={checkServer} disabled={checkingServer} class="btn-dark shrink-0 rounded-xl px-5 py-3 text-sm font-medium disabled:opacity-40">
							<span class="btn-stroke"></span><span class="btn-highlight"></span>
							<span class="relative">{checkingServer ? '...' : 'Test'}</span>
						</button>
					</div>

					{#if serverTested && !checkingServer}
						<div class="flex items-center gap-2 text-[13px] {serverOnline ? 'text-accent-green' : 'text-accent-red'}">
							<div class="h-2 w-2 rounded-full {serverOnline ? 'bg-accent-green shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-accent-red'}"></div>
							{serverOnline ? 'Connected' : 'Not responding'}
						</div>
					{/if}

					<button onclick={() => go(3)} class="btn-light btn-pill px-7 py-3 text-sm font-semibold">
						<span class="btn-stroke"></span><span class="btn-highlight"></span>
						<span class="relative">{serverOnline ? 'Continue' : 'Skip'}</span>
					</button>
				</div>

			{:else if step === 3}
				<!-- ═══ ADDONS ═══ -->
				<div class="space-y-6">
					<div>
						<h2 class="text-[22px] font-bold tracking-tight text-text mb-1.5">Add your sources</h2>
						<p class="text-[13px] text-text-muted leading-relaxed">Addons unlock streaming sources, subtitles, and catalogs.</p>
					</div>

					<div class="flex gap-2.5">
						<input type="url" bind:value={addonUrl} onkeydown={(e) => e.key === 'Enter' && handleInstallAddon()} placeholder="Addon manifest URL" class="ob-input flex-1" />
						<button onclick={handleInstallAddon} disabled={installingAddon || !addonUrl.trim()} class="btn-dark shrink-0 rounded-xl px-5 py-3 text-sm font-medium disabled:opacity-40">
							<span class="btn-stroke"></span><span class="btn-highlight"></span>
							<span class="relative">{installingAddon ? '...' : 'Add'}</span>
						</button>
					</div>

					{#if addonStore.addons.length > 0}
						<div class="rounded-xl border border-border bg-surface overflow-hidden">
							{#each addonStore.addons as addon, i (addon.manifest.id)}
								<div class="flex items-center gap-3 px-4 py-3 {i > 0 ? 'border-t border-border' : ''}">
									{#if addon.manifest.logo}
										<img src={addon.manifest.logo} alt="" class="h-7 w-7 rounded-lg object-contain" />
									{:else}
										<div class="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-[10px] font-bold text-text-muted">{addon.manifest.name.charAt(0)}</div>
									{/if}
									<span class="text-sm text-text-secondary truncate">{addon.manifest.name}</span>
									<span class="text-[10px] text-text-muted ml-auto shrink-0">v{addon.manifest.version}</span>
								</div>
							{/each}
						</div>
					{/if}

					<button onclick={finish} class="btn-light btn-pill w-full inline-flex items-center justify-center gap-2 py-3.5 text-[15px] font-semibold">
						<span class="btn-stroke"></span><span class="btn-highlight"></span>
						<svg class="relative" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,40.74V215.26a15.94,15.94,0,0,0,8.12,13.89,16,16,0,0,0,16.2-.3L232.4,141.51a16,16,0,0,0,0-27Z"/></svg>
						<span class="relative">Start Watching</span>
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	@keyframes contentIn {
		from { opacity: 0; transform: translateY(12px); }
		to { opacity: 1; transform: translateY(0); }
	}

	/* ─── Input ─── */
	.ob-input {
		width: 100%;
		padding: 12px 14px;
		border-radius: 10px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 14px;
		outline: none;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}
	.ob-input::placeholder {
		color: var(--color-text-muted);
	}
	.ob-input:focus {
		border-color: rgba(139, 92, 246, 0.35);
		box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.06);
	}

	/* ─── Poster wall ─── */
	.poster-wrapper {
		position: relative;
		height: 370px;
		overflow: hidden;
		margin-bottom: -40px;
	}
	.poster-wall {
		display: flex;
		gap: 6px;
		height: 100%;
		opacity: 0;
		animation: wallFadeIn 1.2s ease-out 0.2s forwards;
	}
	@keyframes wallFadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.poster-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.poster-col-up {
		animation: scrollUp 30s linear infinite;
	}
	.poster-col-down {
		animation: scrollDown 30s linear infinite;
	}

	@keyframes scrollUp {
		from { transform: translateY(0); }
		to { transform: translateY(-50%); }
	}
	@keyframes scrollDown {
		from { transform: translateY(-50%); }
		to { transform: translateY(0); }
	}

	.poster-img {
		width: 100%;
		aspect-ratio: 2/3;
		object-fit: cover;
		border-radius: 6px;
		opacity: 0.3;
		flex-shrink: 0;
	}

	.poster-fade-top {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 80px;
		background: linear-gradient(to bottom, var(--color-bg), transparent);
		pointer-events: none;
		z-index: 5;
	}
	.poster-fade-bottom {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 200px;
		background: linear-gradient(to top, var(--color-bg) 20%, transparent);
		pointer-events: none;
		z-index: 5;
	}

	@media (max-width: 480px) {
		.poster-wrapper { height: 320px; }
		.poster-col:nth-child(5),
		.poster-col:nth-child(6) { display: none; }
	}
</style>
