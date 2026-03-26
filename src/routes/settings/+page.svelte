<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getAuth, getAuthKey, logout } from '$lib/stores/auth.svelte';
	import { getAddons, installAddon, removeAddon, loadAddons } from '$lib/stores/addons.svelte';
	import { serverHeartbeat, getServerUrl, setServerUrl, resetServerUrl } from '$lib/api/stremio';
	import { toast } from 'svelte-sonner';

	const auth = getAuth();
	const addonStore = getAddons();

	let serverOnline = $state(false);
	let checkingServer = $state(true);
	let serverUrl = $state(getServerUrl());
	let editingServerUrl = $state(false);
	let addonUrl = $state('');
	let installingAddon = $state(false);

	// Sidebar navigation
	type Section = 'account' | 'server' | 'addons' | 'about';
	let activeSection = $state<Section>('account');

	const sections: { id: Section; label: string; icon: string }[] = [
		{ id: 'account', label: 'Account', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
		{ id: 'server', label: 'Streaming Server', icon: 'M22 12H2M22 12a10 10 0 0 0-10-10M22 12a10 10 0 0 1-10 10M2 12a10 10 0 0 1 10-10M2 12a10 10 0 0 0 10 10' },
		{ id: 'addons', label: 'Addons', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
		{ id: 'about', label: 'About', icon: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16v-4M12 8h.01' },
	];

	const OFFICIAL_ADDONS = [
		'com.linvo.cinemeta',
		'com.stremio.subtitlesfromlopensubtitles',
		'org.stremio.opensubtitlesv2',
		'org.stremio.opensubtitlesv3',
		'org.stremio.local',
	];

	function isOfficial(id: string) { return OFFICIAL_ADDONS.includes(id); }

	onMount(async () => {
		const key = getAuthKey();
		const [online] = await Promise.allSettled([serverHeartbeat(), loadAddons(key || '')]);
		serverOnline = online.status === 'fulfilled' && online.value === true;
		checkingServer = false;
	});

	async function handleLogout() { logout(); goto('/'); }

	async function handleInstallAddon() {
		if (!addonUrl.trim()) return;
		installingAddon = true;
		try {
			const key = getAuthKey();
			const manifest = await installAddon(key || '', addonUrl.trim());
			toast.success(`"${manifest.name}" installed`);
			addonUrl = '';
		} catch (err: any) {
			toast.error(err?.message || 'Failed to install addon');
		}
		installingAddon = false;
	}

	async function handleRemoveAddon(addonId: string, name: string) {
		const key = getAuthKey();
		await removeAddon(key || '', addonId);
		toast(`"${name}" removed`);
	}

	async function recheckServer() {
		checkingServer = true;
		serverOnline = await serverHeartbeat();
		checkingServer = false;
	}

	function saveServerUrl() {
		setServerUrl(serverUrl);
		editingServerUrl = false;
		toast.success('Server URL updated');
		recheckServer();
	}
</script>

<svelte:head>
	<title>Settings – Scope</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-6 py-8 md:px-12">
	<h1 class="mb-8 text-2xl font-bold tracking-tight text-text">Settings</h1>

	<div class="flex gap-8">
		<!-- Sidebar -->
		<nav class="hidden w-52 shrink-0 md:block">
			<div class="sticky top-24 space-y-1">
				{#each sections as sec}
					<button
						onclick={() => activeSection = sec.id}
						class="sidebar-item"
						class:sidebar-active={activeSection === sec.id}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={sec.icon}></path></svg>
						{sec.label}
					</button>
				{/each}
			</div>
		</nav>

		<!-- Mobile tabs -->
		<div class="flex w-0 flex-1 flex-col">
			<div class="mb-6 flex gap-1 overflow-x-auto scrollbar-hide md:hidden">
				{#each sections as sec}
					<button
						onclick={() => activeSection = sec.id}
						class="mobile-tab"
						class:mobile-tab-active={activeSection === sec.id}
					>{sec.label}</button>
				{/each}
			</div>

			<!-- Content -->
			<div class="flex-1 min-w-0 overflow-hidden">
				<!-- ═══ ACCOUNT ═══ -->
				{#if activeSection === 'account'}
					<div class="space-y-6">
						<div>
							<h2 class="section-title">Account</h2>
							<p class="section-desc">Manage your Stremio account and sign-in status.</p>
						</div>

						<div class="settings-card">
							{#if auth.isAuthenticated}
								<div class="flex items-center gap-4">
									<div class="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white" style="background: linear-gradient(135deg, #7c3aed, #6d28d9);">
										{(auth.user?.email ?? '?').charAt(0).toUpperCase()}
									</div>
									<div class="flex-1 min-w-0">
										<p class="text-sm font-medium text-text truncate">{auth.user?.email || 'Signed in'}</p>
										<p class="text-xs text-text-muted">Stremio account</p>
									</div>
									<button onclick={handleLogout} class="setting-btn-danger">Sign Out</button>
								</div>
							{:else}
								<div class="flex items-center justify-between">
									<div>
										<p class="text-sm font-medium text-text">Not signed in</p>
										<p class="text-xs text-text-muted mt-0.5">Sign in to sync your library and addons</p>
									</div>
									<a href="/login" class="setting-btn-primary">Sign In</a>
								</div>
							{/if}
						</div>
					</div>

				<!-- ═══ SERVER ═══ -->
				{:else if activeSection === 'server'}
					<div class="space-y-6">
						<div>
							<h2 class="section-title">Streaming Server</h2>
							<p class="section-desc">The server handles torrent streaming and transcoding.</p>
						</div>

						<!-- Status -->
						<div class="settings-card">
							<div class="setting-row">
								<div>
									<p class="setting-label">Connection Status</p>
									<p class="setting-hint">
										{#if checkingServer}Checking...{:else if serverOnline}Server is reachable{:else}Server is not responding{/if}
									</p>
								</div>
								<div class="flex items-center gap-3">
									{#if checkingServer}
										<div class="h-2.5 w-2.5 shimmer rounded-full bg-yellow-400"></div>
									{:else if serverOnline}
										<div class="h-2.5 w-2.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]"></div>
									{:else}
										<div class="h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]"></div>
									{/if}
									<button
										onclick={recheckServer}
										disabled={checkingServer}
										class="setting-btn-ghost"
									>Recheck</button>
								</div>
							</div>
						</div>

						<!-- URL -->
						<div class="settings-card">
							<div class="setting-row-col">
								<div>
									<p class="setting-label">Server URL</p>
									<p class="setting-hint">Point to a local or remote streaming server instance.</p>
								</div>
								<div class="mt-3 flex items-center gap-2">
									{#if editingServerUrl}
										<input
											type="url"
											bind:value={serverUrl}
											onkeydown={(e) => {
												if (e.key === 'Enter') saveServerUrl();
												if (e.key === 'Escape') { serverUrl = getServerUrl(); editingServerUrl = false; }
											}}
											class="setting-input flex-1"
										/>
										<button onclick={saveServerUrl} class="setting-btn-primary">Save</button>
										<button
											onclick={() => { resetServerUrl(); serverUrl = getServerUrl(); editingServerUrl = false; toast('Reset to default'); recheckServer(); }}
											class="setting-btn-ghost"
										>Reset</button>
									{:else}
										<code class="flex-1 rounded-lg bg-bg px-3 py-2 font-mono text-xs text-text-muted">{serverUrl}</code>
										<button onclick={() => editingServerUrl = true} class="setting-btn-ghost">Edit</button>
									{/if}
								</div>
							</div>
						</div>
					</div>

				<!-- ═══ ADDONS ═══ -->
				{:else if activeSection === 'addons'}
					<div class="space-y-6">
						<div>
							<h2 class="section-title">Addons</h2>
							<p class="section-desc">Addons provide catalogs, streams, and subtitles.</p>
						</div>

						<!-- Install -->
						<div class="settings-card overflow-hidden">
							<p class="setting-label mb-3">Install Addon</p>
							<div class="flex gap-2 min-w-0">
								<input
									type="url"
									bind:value={addonUrl}
									onkeydown={(e) => e.key === 'Enter' && handleInstallAddon()}
									placeholder="https://addon-url.com/manifest.json"
									class="setting-input flex-1"
								/>
								<button
									onclick={handleInstallAddon}
									disabled={installingAddon || !addonUrl.trim()}
									class="setting-btn-primary disabled:opacity-40"
								>
									{#if installingAddon}
										<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
									{:else}
										Install
									{/if}
								</button>
							</div>
						</div>

						<!-- Installed -->
						<div class="settings-card !p-0 overflow-hidden">
							{#if addonStore.loading}
								<div class="flex items-center justify-center py-12">
									<svg class="h-5 w-5 animate-spin text-text-muted" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
								</div>
							{:else if addonStore.addons.length === 0}
								<p class="px-5 py-12 text-center text-sm text-text-muted">No addons installed</p>
							{:else}
								{#each addonStore.addons as addon, i (addon.manifest.id)}
									<div class="addon-row" class:addon-row-border={i > 0}>
										<div class="flex items-center gap-3 min-w-0 flex-1">
											{#if addon.manifest.logo}
												<img src={addon.manifest.logo} alt="" class="h-8 w-8 shrink-0 rounded-lg object-contain bg-white/5 p-1" />
											{:else}
												<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-text-muted">
													<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path></svg>
												</div>
											{/if}
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2">
													<p class="truncate text-sm font-medium text-text">{addon.manifest.name}</p>
													<span class="shrink-0 text-[10px] text-text-muted">v{addon.manifest.version}</span>
													{#if isOfficial(addon.manifest.id)}
														<span class="shrink-0 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-medium text-violet-400">Official</span>
													{/if}
												</div>
												{#if addon.manifest.description}
													<p class="truncate text-xs text-text-muted mt-0.5">{addon.manifest.description}</p>
												{/if}
											</div>
										</div>
										{#if !isOfficial(addon.manifest.id)}
											<button
												onclick={() => handleRemoveAddon(addon.manifest.id, addon.manifest.name)}
												class="shrink-0 rounded-lg p-1.5 text-text-muted transition hover:bg-red-500/10 hover:text-red-400"
												title="Remove"
											>
												<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
											</button>
										{/if}
									</div>
								{/each}
							{/if}
						</div>
					</div>

				<!-- ═══ ABOUT ═══ -->
				{:else if activeSection === 'about'}
					<div class="space-y-6">
						<div>
							<h2 class="section-title">About</h2>
							<p class="section-desc">Information about this client.</p>
						</div>

						<div class="settings-card space-y-4">
							<div class="setting-row">
								<p class="setting-label">Client</p>
								<p class="text-sm text-text">Scope</p>
							</div>
							<div class="setting-row">
								<p class="setting-label">Version</p>
								<p class="text-sm text-text-secondary">0.1.0-alpha</p>
							</div>
							<div class="setting-row">
								<p class="setting-label">Built with</p>
								<p class="text-sm text-text-secondary">SvelteKit + Tailwind + Vidstack</p>
							</div>
							<div class="setting-row">
								<p class="setting-label">Protocol</p>
								<p class="text-sm text-text-secondary">Addon Protocol v3</p>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	/* ─── Sidebar ─── */
	.sidebar-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 14px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text-muted);
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s ease;
	}
	.sidebar-item:hover {
		color: var(--color-text-secondary);
		background: rgba(231, 229, 228, 0.04);
	}
	.sidebar-active {
		color: var(--color-text) !important;
		background: rgba(231, 229, 228, 0.07) !important;
	}

	/* ─── Mobile Tabs ─── */
	.mobile-tab {
		padding: 6px 14px;
		border-radius: 9999px;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text-muted);
		background: transparent;
		border: 1px solid transparent;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s ease;
	}
	.mobile-tab:hover { color: var(--color-text-secondary); }
	.mobile-tab-active {
		color: var(--color-text) !important;
		background: rgba(231, 229, 228, 0.07) !important;
		border-color: rgba(231, 229, 228, 0.08) !important;
	}

	/* ─── Sections ─── */
	.section-title {
		font-size: 17px;
		font-weight: 600;
		color: var(--color-text);
		letter-spacing: -0.01em;
	}
	.section-desc {
		font-size: 13px;
		color: var(--color-text-muted);
		margin-top: 4px;
	}

	/* ─── Card ─── */
	.settings-card {
		border-radius: 14px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		padding: 20px;
	}

	/* ─── Rows ─── */
	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.setting-row-col {
		display: flex;
		flex-direction: column;
	}
	.setting-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text);
	}
	.setting-hint {
		font-size: 12px;
		color: var(--color-text-muted);
		margin-top: 2px;
	}

	/* ─── Inputs ─── */
	.setting-input {
		border-radius: 8px;
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		padding: 8px 12px;
		font-size: 13px;
		color: var(--color-text);
		outline: none;
		transition: border-color 0.15s ease;
		font-family: ui-monospace, monospace;
	}
	.setting-input::placeholder { color: var(--color-text-muted); }
	.setting-input:focus { border-color: rgba(139, 92, 246, 0.4); }

	/* ─── Buttons ─── */
	.setting-btn-primary {
		padding: 7px 16px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		background: rgba(227, 227, 227, 0.8);
		color: #0f172a;
		border: none;
		cursor: pointer;
		transition: filter 0.15s ease;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.setting-btn-primary:hover { filter: brightness(0.93); }

	.setting-btn-ghost {
		padding: 7px 14px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		background: rgba(231, 229, 228, 0.06);
		color: var(--color-text-secondary);
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.setting-btn-ghost:hover { background: rgba(231, 229, 228, 0.1); }
	.setting-btn-ghost:disabled { opacity: 0.5; cursor: default; }

	.setting-btn-danger {
		padding: 7px 16px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		background: rgba(239, 68, 68, 0.1);
		color: #f87171;
		border: 1px solid rgba(239, 68, 68, 0.15);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.setting-btn-danger:hover { background: rgba(239, 68, 68, 0.15); }

	/* ─── Addon Row ─── */
	.addon-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 20px;
		overflow: hidden;
	}
	.addon-row-border {
		border-top: 1px solid var(--color-border);
	}
</style>
